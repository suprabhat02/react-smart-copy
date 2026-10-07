import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyFailure } from '../src/core/errors';
import type { PasteAdapter } from '../src/core/paste-adapter';
import { createPasteMachine, PASTE_IDLE_STATE, type PasteMachineOptions } from '../src/core/paste-machine';
import type { PasteResult, ResolvedPasteReadOptions } from '../src/core/paste-reader';
import { fakeDataTransfer, fakePasteEvent, pngBlob, pngFile } from './fixtures';
import { deferred, flush, permissionDenied, type Deferred } from './helpers';

const textResult: PasteResult = {
  source: 'clipboard',
  items: [{ type: 'text/plain', data: 'Hello' }],
  text: 'Hello',
  html: null,
  images: [],
  files: [],
  imageFiles: [],
};

function controllableAdapter() {
  const reads: Deferred<PasteResult>[] = [];
  const calls: ResolvedPasteReadOptions[] = [];
  const adapter: PasteAdapter = {
    read: (options) => {
      calls.push(options);
      const d = deferred<PasteResult>();
      reads.push(d);
      return d.promise;
    },
  };
  const last = (): Deferred<PasteResult> => {
    const d = reads.at(-1);
    if (!d) throw new Error('No read');
    return d;
  };
  return {
    adapter,
    calls,
    count: () => reads.length,
    resolve: (result: PasteResult = textResult) => {
      last().resolve(result);
    },
    reject: (reason: unknown) => {
      last().reject(reason);
    },
  };
}

const resolvedAdapter = (result: PasteResult = textResult): PasteAdapter => ({ read: () => Promise.resolve(result) });
const failingAdapter = (reason: unknown): PasteAdapter => ({
  // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- platform-shaped error
  read: () => Promise.reject(reason),
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('paste()', () => {
  it('idle → reading → read, passing resolved options to the adapter', async () => {
    const ctrl = controllableAdapter();
    const onPaste = vi.fn();
    const m = createPasteMachine({ adapter: ctrl.adapter, accept: ['text', 'image'], onPaste });
    expect(m.getSnapshot()).toBe(PASTE_IDLE_STATE);

    const outcome = m.paste();
    expect(m.getSnapshot().status).toBe('reading');
    expect(ctrl.calls[0]?.accept).toEqual(['text/plain', 'image/*']);

    ctrl.resolve();
    expect(await outcome).toEqual({ status: 'read', result: textResult });
    expect(m.getSnapshot()).toMatchObject({ status: 'read', result: textResult });
    expect(onPaste).toHaveBeenCalledWith(textResult);
  });

  it('idle → reading → error with read-specific classification', async () => {
    const onError = vi.fn();
    const m = createPasteMachine({ adapter: failingAdapter(permissionDenied), onError });
    const outcome = await m.paste();
    expect(outcome).toMatchObject({ status: 'error', error: { type: 'permission-denied' } });
    expect(m.getSnapshot()).toMatchObject({ status: 'error', error: { message: 'Clipboard read permission was denied.' } });
    expect(onError).toHaveBeenCalledOnce();
  });

  it('ignores paste() while reading', async () => {
    const ctrl = controllableAdapter();
    const m = createPasteMachine({ adapter: ctrl.adapter });
    void m.paste();
    expect(await m.paste()).toEqual({ status: 'ignored', reason: 'in-flight' });
    expect(ctrl.count()).toBe(1);
  });

  it('turns invalid options and synchronous adapter throws into error state', async () => {
    const bad = createPasteMachine({ adapter: resolvedAdapter(), accept: [] });
    expect(await bad.paste()).toMatchObject({ status: 'error', error: { type: 'invalid-payload' } });

    const throwing = createPasteMachine({
      adapter: {
        read: () => {
          throw copyFailure('unsupported', 'nope');
        },
      },
    });
    expect(await throwing.paste()).toMatchObject({ status: 'error', error: { type: 'unsupported' } });
  });

  it('uses the browser adapter by default', async () => {
    const readText = vi.fn(() => Promise.resolve('default adapter'));
    Object.defineProperty(navigator, 'clipboard', { value: { readText }, configurable: true });
    const outcome = await createPasteMachine().paste();
    expect(outcome).toMatchObject({ status: 'read', result: { text: 'default adapter' } });
    Reflect.deleteProperty(navigator, 'clipboard');
  });
});

describe('pasteEvent()', () => {
  it('reads accepted content from the event and prevents the default insertion', async () => {
    const file = pngFile();
    const event = fakePasteEvent(fakeDataTransfer({ 'text/plain': 'caption' }, [file]));
    const m = createPasteMachine({ accept: ['text', 'image'] });
    const outcome = await m.pasteEvent(event);
    expect(event.prevented).toBe(true);
    expect(outcome).toMatchObject({ status: 'read', result: { source: 'event', text: 'caption', images: [file], files: [file] } });
  });

  it('lists verified image files in imageFiles, retyped from their bytes and keeping their names', async () => {
    const shot = pngFile('shot.jpg', 'image/jpeg');
    const notes = new File(['hello'], 'notes.txt', { type: 'text/plain' });
    const fake = new File(['not a png'], 'fake.png', { type: 'image/png' });
    const event = fakePasteEvent(fakeDataTransfer({}, [shot, notes, fake]));
    const outcome = await createPasteMachine({ accept: ['image', 'text/plain'] }).pasteEvent(event);
    if (outcome.status !== 'read') throw new Error(`expected a read, got ${outcome.status}`);
    const { imageFiles, images, files } = outcome.result;
    expect(imageFiles).toHaveLength(1);
    expect(imageFiles[0]).toBeInstanceOf(File);
    expect(imageFiles[0]).toMatchObject({ name: 'shot.jpg', type: 'image/png' });
    expect(imageFiles[0]).toBe(images[0]);
    expect(files.map((f) => f.name)).toEqual(['shot.jpg', 'notes.txt']);
  });
});

describe('imageFiles from adapters', () => {
  it('derives imageFiles itself, ignoring what an adapter claims and leaving clipboard blobs out', async () => {
    const file = pngFile();
    const blob = pngBlob();
    const stray = pngFile('stray.png');
    const adapter: PasteAdapter = {
      read: () =>
        Promise.resolve({
          source: 'clipboard',
          items: [],
          text: null,
          html: null,
          images: [blob, file],
          files: [file],
          imageFiles: [stray],
        } as PasteResult),
    };
    const onPaste = vi.fn();
    const machine = createPasteMachine({ adapter, onPaste });
    const outcome = await machine.paste();
    if (outcome.status !== 'read') throw new Error(`expected a read, got ${outcome.status}`);
    expect(outcome.result.imageFiles).toEqual([file]);
    expect(outcome.result.imageFiles[0]).toBe(file);
    expect(onPaste).toHaveBeenCalledExactlyOnceWith(outcome.result);
    expect(machine.getSnapshot()).toMatchObject({ status: 'read', result: outcome.result });
  });

  it('turns a malformed adapter result into an error instead of rejecting or sticking in reading', async () => {
    // An untyped (JavaScript) adapter that forgot `images` / `files`.
    const adapter = { read: () => Promise.resolve({ text: 'x' }) } as unknown as PasteAdapter;
    const onPaste = vi.fn();
    const machine = createPasteMachine({ adapter, onPaste });
    const outcome = await machine.paste();
    expect(outcome.status).toBe('error');
    expect(machine.getSnapshot().status).toBe('error');
    expect(onPaste).not.toHaveBeenCalled();
    // Not stuck: a follow-up paste runs instead of being ignored as in-flight.
    expect((await machine.paste()).status).toBe('error');
  });

  it('leaves events without accepted content (or without data) to the browser', async () => {
    const m = createPasteMachine({ accept: ['image'] });
    const textOnly = fakePasteEvent(fakeDataTransfer({ 'text/plain': 'just text' }));
    expect(await m.pasteEvent(textOnly)).toEqual({ status: 'ignored', reason: 'no-accepted-content' });
    expect(textOnly.prevented).toBe(false);
    expect(await m.pasteEvent(fakePasteEvent(null))).toEqual({ status: 'ignored', reason: 'no-accepted-content' });
    expect(m.getSnapshot().status).toBe('idle');
  });

  it('respects preventDefault: false', async () => {
    const event = fakePasteEvent(fakeDataTransfer({ 'text/plain': 'x' }));
    await createPasteMachine({ preventDefault: false }).pasteEvent(event);
    expect(event.prevented).toBe(false);
  });

  it('reports too-large (still preventing the default) and invalid options (not preventing)', async () => {
    const big = fakePasteEvent(fakeDataTransfer({ 'text/plain': 'too long' }));
    expect(await createPasteMachine({ maxBytes: 2 }).pasteEvent(big)).toMatchObject({
      status: 'error',
      error: { type: 'too-large' },
    });
    expect(big.prevented).toBe(true);

    // 4 UTF-16 code units fit under 7, but the 8 UTF-8 bytes do not.
    const emoji = fakePasteEvent(fakeDataTransfer({ 'text/plain': '😀😀' }));
    expect(await createPasteMachine({ maxBytes: 7 }).pasteEvent(emoji)).toMatchObject({
      status: 'error',
      error: { type: 'too-large' },
    });

    const invalid = fakePasteEvent(fakeDataTransfer({ 'text/plain': 'x' }));
    expect(await createPasteMachine({ maxItems: 0 }).pasteEvent(invalid)).toMatchObject({
      status: 'error',
      error: { type: 'invalid-payload' },
    });
    expect(invalid.prevented).toBe(false);
  });

  it('supersedes an in-flight paste(): the stale read does not overwrite state', async () => {
    const ctrl = controllableAdapter();
    const onPaste = vi.fn();
    const m = createPasteMachine({ adapter: ctrl.adapter, onPaste });
    const first = m.paste();
    const second = await m.pasteEvent(fakePasteEvent(fakeDataTransfer({ 'text/plain': 'from event' })));
    expect(second).toMatchObject({ status: 'read', result: { text: 'from event' } });

    ctrl.resolve();
    expect(await first).toEqual({ status: 'read', result: textResult }); // the caller still learns what happened
    expect(m.getSnapshot()).toMatchObject({ result: { text: 'from event' } });
    expect(onPaste).toHaveBeenCalledOnce();
  });
});

describe('reset(), stale results and auto-reset', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('reset() discards an in-flight success and failure', async () => {
    const ctrl = controllableAdapter();
    const onError = vi.fn();
    const m = createPasteMachine({ adapter: ctrl.adapter, onError });

    void m.paste();
    m.reset();
    ctrl.resolve();
    await flush();
    expect(m.getSnapshot().status).toBe('idle');

    void m.paste();
    m.reset();
    ctrl.reject(permissionDenied);
    await flush();
    expect(m.getSnapshot().status).toBe('idle');
    expect(onError).not.toHaveBeenCalled();
  });

  it('keeps the result by default', async () => {
    const m = createPasteMachine({ adapter: resolvedAdapter() });
    m.connect();
    await m.paste();
    vi.advanceTimersByTime(60_000);
    expect(m.getSnapshot().status).toBe('read');
  });

  it.each([false, Infinity, NaN] as const)('resetAfterMs %s disables auto-reset', async (resetAfterMs) => {
    const m = createPasteMachine({ adapter: resolvedAdapter(), resetAfterMs });
    await m.paste();
    vi.advanceTimersByTime(60_000);
    expect(m.getSnapshot().status).toBe('read');
  });

  it('auto-resets after resetAfterMs, and a new paste cancels the pending reset', async () => {
    let time = 0;
    const m = createPasteMachine({ adapter: resolvedAdapter(), resetAfterMs: 1000, now: () => time });
    await m.paste();
    vi.advanceTimersByTime(500);
    time = 500;
    await m.paste(); // re-arms from now
    vi.advanceTimersByTime(600);
    expect(m.getSnapshot().status).toBe('read');
    vi.advanceTimersByTime(400);
    expect(m.getSnapshot().status).toBe('idle');
  });

  it('negative resetAfterMs resets immediately; a reset while read does not fire later', async () => {
    const m = createPasteMachine({ adapter: resolvedAdapter(), resetAfterMs: -5 });
    await m.paste();
    vi.advanceTimersByTime(0);
    expect(m.getSnapshot().status).toBe('idle');

    const n = createPasteMachine({ adapter: resolvedAdapter(), resetAfterMs: 100 });
    await n.paste();
    n.reset();
    await n.paste();
    const snapshot = n.getSnapshot();
    n.reset();
    vi.advanceTimersByTime(100);
    expect(n.getSnapshot()).not.toBe(snapshot);
  });

  it('a superseding read re-arms the timer from the new result', async () => {
    const ctrl = controllableAdapter();
    const m = createPasteMachine({ adapter: ctrl.adapter, resetAfterMs: 100 });
    void m.paste();
    ctrl.resolve();
    await flush();
    // Force a second read state without clearing the first timer by superseding through an event.
    await m.pasteEvent(fakePasteEvent(fakeDataTransfer({ 'text/plain': 'b' })));
    vi.advanceTimersByTime(100);
    expect(m.getSnapshot().status).toBe('idle');
  });
});

describe('connect()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('cleanup unsticks reading and drops the stale result; reconnect re-arms auto-reset', async () => {
    const ctrl = controllableAdapter();
    const m = createPasteMachine({ adapter: ctrl.adapter, resetAfterMs: 1000 });
    const disconnect = m.connect();
    void m.paste();
    disconnect();
    expect(m.getSnapshot().status).toBe('idle');
    ctrl.resolve();
    await flush();
    expect(m.getSnapshot().status).toBe('idle');

    void m.paste();
    ctrl.resolve();
    await flush();
    m.connect()(); // StrictMode-style connect + cleanup while `read` clears the timer…
    m.connect(); // …and reconnecting re-arms it.
    vi.advanceTimersByTime(1000);
    expect(m.getSnapshot().status).toBe('idle');
  });
});

describe('subscriptions and callbacks', () => {
  it('notifies on each transition and stops after unsubscribe', async () => {
    const ctrl = controllableAdapter();
    const m = createPasteMachine({ adapter: ctrl.adapter });
    const seen: string[] = [];
    const unsubscribe = m.subscribe(() => {
      seen.push(m.getSnapshot().status);
    });
    void m.paste();
    ctrl.resolve();
    await flush();
    unsubscribe();
    m.reset();
    expect(seen).toEqual(['reading', 'read']);
  });

  it('reports callback errors without corrupting state (reportError, or a rethrow on a timer)', async () => {
    const reportError = vi.fn();
    vi.stubGlobal('reportError', reportError);
    const m = createPasteMachine({
      adapter: resolvedAdapter(),
      onPaste: () => {
        throw new Error('boom');
      },
    });
    await m.paste();
    expect(m.getSnapshot().status).toBe('read');
    expect(reportError).toHaveBeenCalledOnce();

    vi.stubGlobal('reportError', undefined);
    vi.useFakeTimers();
    const n = createPasteMachine({
      adapter: failingAdapter(permissionDenied),
      onError: () => {
        throw new Error('late');
      },
    });
    await n.paste();
    expect(() => vi.runAllTimers()).toThrow('late');
    expect(n.getSnapshot().status).toBe('error');
  });

  it('reads options lazily from a getter', async () => {
    let options: PasteMachineOptions = { adapter: resolvedAdapter(), accept: ['image'] };
    const m = createPasteMachine(() => options);
    options = { ...options, onPaste: vi.fn() };
    await m.paste();
    expect(options.onPaste).toHaveBeenCalledOnce();
  });
});
