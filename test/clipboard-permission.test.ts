import { afterEach, describe, expect, it, vi } from 'vitest';
import { CopyFailure, readClipboardPermission, watchClipboardPermission, type ClipboardPermissionState } from '../src/core';

/** A permission status the test can change, like the browser's `PermissionStatus`. */
function fakeStatus(initial: unknown) {
  const listeners = new Set<() => void>();
  return {
    state: initial,
    listeners,
    addEventListener: vi.fn((_type: string, listener: () => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_type: string, listener: () => void) => listeners.delete(listener)),
    set(next: unknown) {
      this.state = next;
      for (const listener of [...listeners]) listener();
    },
  };
}

function stubPermissions(query: (descriptor: { name: string }) => Promise<unknown>) {
  const spy = vi.fn(query);
  vi.stubGlobal('navigator', { permissions: { query: spy } });
  return spy;
}

const settle = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readClipboardPermission', () => {
  it.each(['granted', 'prompt', 'denied'] as const)('reports %s as the browser gave it', async (state) => {
    stubPermissions(() => Promise.resolve(fakeStatus(state)));
    expect(await readClipboardPermission('read')).toBe(state);
  });

  it('asks about clipboard-read by default and clipboard-write on request, and nothing else', async () => {
    const query = stubPermissions(() => Promise.resolve(fakeStatus('granted')));
    await readClipboardPermission();
    await readClipboardPermission('write');
    expect(query.mock.calls.map(([descriptor]) => descriptor)).toEqual([{ name: 'clipboard-read' }, { name: 'clipboard-write' }]);
  });

  it('says unsupported when there is no Permissions API', async () => {
    vi.stubGlobal('navigator', {});
    expect(await readClipboardPermission()).toBe('unsupported');
  });

  it('says unsupported when there is no navigator at all (server)', async () => {
    vi.stubGlobal('navigator', undefined);
    expect(await readClipboardPermission()).toBe('unsupported');
  });

  it('says unsupported when the browser has no such permission (Firefox, Safari) instead of rejecting', async () => {
    stubPermissions(() => Promise.reject(new TypeError("'clipboard-read' is not a valid value for enumeration PermissionName")));
    expect(await readClipboardPermission()).toBe('unsupported');
  });

  it('says unsupported for a state it does not know', async () => {
    stubPermissions(() => Promise.resolve(fakeStatus('maybe')));
    expect(await readClipboardPermission()).toBe('unsupported');
  });

  it.each(['__proto__', 'constructor', 'clipboard-read', ''])('refuses the name %j before asking the browser anything', async (name) => {
    const query = stubPermissions(() => Promise.resolve(fakeStatus('granted')));
    const failure = await readClipboardPermission(name as 'read').catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(CopyFailure);
    expect(failure).toMatchObject({ copyError: { type: 'invalid-payload' } });
    expect(query).not.toHaveBeenCalled();
  });
});

describe('watchClipboardPermission', () => {
  it('reports the permission now, asynchronously, then only changes', async () => {
    const status = fakeStatus('prompt');
    stubPermissions(() => Promise.resolve(status));
    const seen: ClipboardPermissionState[] = [];
    const stop = watchClipboardPermission('read', (state) => seen.push(state));
    expect(seen).toEqual([]);
    await settle();
    expect(seen).toEqual(['prompt']);
    status.set('prompt'); // a change event with no change
    status.set('granted');
    status.set('denied');
    expect(seen).toEqual(['prompt', 'granted', 'denied']);
    stop();
  });

  it('stops listening when stopped, and stopping twice is harmless', async () => {
    const status = fakeStatus('granted');
    stubPermissions(() => Promise.resolve(status));
    const seen: ClipboardPermissionState[] = [];
    const stop = watchClipboardPermission('write', (state) => seen.push(state));
    await settle();
    stop();
    stop();
    expect(status.listeners.size).toBe(0);
    status.set('denied');
    expect(seen).toEqual(['granted']);
  });

  it('leaves nothing behind when stopped before the browser answers', async () => {
    const status = fakeStatus('granted');
    stubPermissions(() => Promise.resolve(status));
    const seen: ClipboardPermissionState[] = [];
    watchClipboardPermission('read', (state) => seen.push(state))();
    await settle();
    expect(seen).toEqual([]);
    expect(status.addEventListener).not.toHaveBeenCalled();
  });

  it('reports unsupported once for a browser that cannot say, and never again', async () => {
    stubPermissions(() => Promise.reject(new TypeError('nope')));
    const seen: ClipboardPermissionState[] = [];
    const stop = watchClipboardPermission('read', (state) => seen.push(state));
    await settle();
    expect(seen).toEqual(['unsupported']);
    stop();
  });

  it('reports unsupported when there is no Permissions API', async () => {
    vi.stubGlobal('navigator', {});
    const seen: ClipboardPermissionState[] = [];
    watchClipboardPermission('read', (state) => seen.push(state));
    await settle();
    expect(seen).toEqual(['unsupported']);
  });

  it('reports a throwing listener instead of swallowing it, and keeps watching', async () => {
    const status = fakeStatus('prompt');
    stubPermissions(() => Promise.resolve(status));
    const reportError = vi.fn();
    vi.stubGlobal('reportError', reportError);
    const seen: ClipboardPermissionState[] = [];
    const stop = watchClipboardPermission('read', (state) => {
      seen.push(state);
      throw new Error('listener bug');
    });
    await settle();
    status.set('granted');
    expect(seen).toEqual(['prompt', 'granted']);
    expect(reportError).toHaveBeenCalledTimes(2);
    stop();
  });

  it('refuses a bad name synchronously, before listening', () => {
    expect(() => watchClipboardPermission('both' as 'read', () => undefined)).toThrow(CopyFailure);
  });
});
