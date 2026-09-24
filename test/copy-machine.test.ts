import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CopyFailure,
  IDLE_STATE,
  canRetryState,
  createCopyError,
  createCopyMachine,
} from '../src/core';
import { createControllableAdapter, flush, permissionDenied } from './helpers';

describe('createCopyMachine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts idle', () => {
    expect(createCopyMachine().getSnapshot()).toBe(IDLE_STATE);
  });

  it('calls the adapter synchronously inside copy() so the user gesture is preserved', () => {
    const c = createControllableAdapter();
    const machine = createCopyMachine({ adapter: c.adapter });
    void machine.copy('hello');
    expect(c.calls).toEqual([{ kind: 'text', value: 'hello' }]);
    expect(machine.getSnapshot()).toMatchObject({ status: 'copying', retryCount: 0 });
  });

  it('transitions to copied, fires onCopy, then auto-resets', async () => {
    const c = createControllableAdapter();
    const onCopy = vi.fn();
    const machine = createCopyMachine({ adapter: c.adapter, onCopy });

    const outcome = machine.copy('a');
    c.resolve();
    await expect(outcome).resolves.toEqual({ status: 'copied', payload: { kind: 'text', value: 'a' } });
    expect(machine.getSnapshot().status).toBe('copied');
    expect(onCopy).toHaveBeenCalledWith({ kind: 'text', value: 'a' });

    vi.advanceTimersByTime(1999);
    expect(machine.getSnapshot().status).toBe('copied');
    vi.advanceTimersByTime(1);
    expect(machine.getSnapshot()).toBe(IDLE_STATE);
  });

  it('keeps copied when resetAfterMs is false', async () => {
    const c = createControllableAdapter();
    const machine = createCopyMachine({ adapter: c.adapter, resetAfterMs: false });
    const outcome = machine.copy('a');
    c.resolve();
    await outcome;
    vi.advanceTimersByTime(60_000);
    expect(machine.getSnapshot().status).toBe('copied');
  });

  it('ignores copy() while a write is in flight (no double-fire)', async () => {
    const c = createControllableAdapter();
    const machine = createCopyMachine({ adapter: c.adapter });
    void machine.copy('a');
    await expect(machine.copy('b')).resolves.toEqual({ status: 'ignored', reason: 'in-flight' });
    expect(c.calls).toHaveLength(1);
  });

  it('copying again from copied cancels the pending reset', async () => {
    const c = createControllableAdapter();
    const machine = createCopyMachine({ adapter: c.adapter });
    const first = machine.copy('a');
    c.resolve();
    await first;

    vi.advanceTimersByTime(1500);
    void machine.copy('b');
    vi.advanceTimersByTime(1000); // old timer would have fired here
    expect(machine.getSnapshot().status).toBe('copying');

    c.resolve();
    await flush();
    expect(machine.getSnapshot()).toMatchObject({ status: 'copied', payload: { value: 'b' } });
  });

  it('classifies platform failures and fires onError', async () => {
    const c = createControllableAdapter();
    const onError = vi.fn();
    const machine = createCopyMachine({ adapter: c.adapter, onError });
    const outcome = machine.copy('a');
    c.reject(permissionDenied);
    await expect(outcome).resolves.toMatchObject({ status: 'error', error: { type: 'permission-denied' } });
    expect(machine.getSnapshot()).toMatchObject({ status: 'error', retryCount: 0 });
    expect(onError).toHaveBeenCalledOnce();
  });

  it('retries the same payload and caps at maxRetries', async () => {
    const c = createControllableAdapter();
    const machine = createCopyMachine({ adapter: c.adapter, maxRetries: 2 });

    const first = machine.copy('a');
    c.reject(permissionDenied);
    await first;

    for (const expected of [1, 2]) {
      const attempt = machine.retry();
      c.reject(permissionDenied);
      await attempt;
      expect(machine.getSnapshot()).toMatchObject({ status: 'error', retryCount: expected });
    }
    expect(canRetryState(machine.getSnapshot(), 2)).toBe(false);

    const exhausted = await machine.retry();
    expect(exhausted).toMatchObject({ status: 'error', error: { type: 'max-retries-exceeded' } });
    expect(c.calls).toHaveLength(3);
    expect(c.calls.every((p) => p.kind === 'text' && p.value === 'a')).toBe(true);
    await expect(machine.retry()).resolves.toEqual({ status: 'ignored', reason: 'not-retryable' });
  });

  it('does not retry errors that cannot succeed', async () => {
    const c = createControllableAdapter();
    const machine = createCopyMachine({ adapter: c.adapter });
    const outcome = machine.copy('a');
    c.reject(new CopyFailure(createCopyError('unsupported', 'nope')));
    await outcome;
    await expect(machine.retry()).resolves.toEqual({ status: 'ignored', reason: 'not-retryable' });
    expect(c.calls).toHaveLength(1);
  });

  it('retry() from a non-error state is a no-op', async () => {
    await expect(createCopyMachine().retry()).resolves.toEqual({ status: 'ignored', reason: 'nothing-to-retry' });
  });

  it('rejects invalid payloads without touching the clipboard', async () => {
    const c = createControllableAdapter();
    const machine = createCopyMachine({ adapter: c.adapter });
    await expect(machine.copy('')).resolves.toMatchObject({ error: { type: 'invalid-payload' } });
    expect(c.calls).toHaveLength(0);
  });

  it('captures a lazy source that throws', async () => {
    const machine = createCopyMachine({ adapter: createControllableAdapter().adapter });
    const outcome = await machine.copy(() => {
      throw new Error('boom');
    });
    expect(outcome).toMatchObject({ status: 'error', error: { type: 'invalid-payload' } });
    expect(machine.getSnapshot()).toMatchObject({ status: 'error', payload: null });
  });

  it('reads a lazy source at copy time', () => {
    const c = createControllableAdapter();
    const machine = createCopyMachine({ adapter: c.adapter });
    let current = 'v1';
    const source = () => current;
    current = 'v2';
    void machine.copy(source);
    expect(c.calls[0]).toEqual({ kind: 'text', value: 'v2' });
  });

  it('survives adapters that throw synchronously', async () => {
    const machine = createCopyMachine({
      adapter: {
        write: () => {
          throw new Error('sync explode');
        },
      },
    });
    await expect(machine.copy('a')).resolves.toMatchObject({ status: 'error', error: { type: 'unknown' } });
  });

  it('reset() discards an in-flight result', async () => {
    const c = createControllableAdapter();
    const onCopy = vi.fn();
    const machine = createCopyMachine({ adapter: c.adapter, onCopy });
    const outcome = machine.copy('a');
    machine.reset();
    c.resolve();
    await expect(outcome).resolves.toMatchObject({ status: 'copied' });
    expect(machine.getSnapshot()).toBe(IDLE_STATE);
    expect(onCopy).not.toHaveBeenCalled();
  });

  it('connect() cleanup drops in-flight results and never leaves the machine stuck in copying', async () => {
    const c = createControllableAdapter();
    const machine = createCopyMachine({ adapter: c.adapter });
    const disconnect = machine.connect();
    void machine.copy('a');
    disconnect();
    expect(machine.getSnapshot()).toBe(IDLE_STATE);
    c.resolve();
    await flush();
    expect(machine.getSnapshot()).toBe(IDLE_STATE);
    // Remount (StrictMode) and copy again: must not be ignored as "in-flight".
    machine.connect();
    void machine.copy('b');
    expect(c.calls).toHaveLength(2);
  });

  it('connect() re-arms the auto-reset for a copied state', async () => {
    const c = createControllableAdapter();
    const machine = createCopyMachine({ adapter: c.adapter });
    const disconnect = machine.connect();
    const outcome = machine.copy('a');
    c.resolve();
    await outcome;
    disconnect();
    vi.advanceTimersByTime(5000);
    expect(machine.getSnapshot().status).toBe('copied');
    machine.connect();
    vi.advanceTimersByTime(0);
    expect(machine.getSnapshot()).toBe(IDLE_STATE);
  });

  it('isolates exceptions thrown by user callbacks', async () => {
    const reportError = vi.fn();
    vi.stubGlobal('reportError', reportError);
    const c = createControllableAdapter();
    const machine = createCopyMachine({
      adapter: c.adapter,
      onCopy: () => {
        throw new Error('consumer bug');
      },
    });
    const outcome = machine.copy('a');
    c.resolve();
    await expect(outcome).resolves.toMatchObject({ status: 'copied' });
    expect(machine.getSnapshot().status).toBe('copied');
    expect(reportError).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it('always uses the latest options from a getter', async () => {
    const c = createControllableAdapter();
    let onCopy = vi.fn();
    const machine = createCopyMachine(() => ({ adapter: c.adapter, onCopy }));
    const replacement = vi.fn();
    onCopy = replacement;
    const outcome = machine.copy('a');
    c.resolve();
    await outcome;
    expect(replacement).toHaveBeenCalledOnce();
  });

  it('notifies subscribers and supports unsubscribe', async () => {
    const c = createControllableAdapter();
    const machine = createCopyMachine({ adapter: c.adapter });
    const listener = vi.fn();
    const unsubscribe = machine.subscribe(listener);
    void machine.copy('a');
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    c.resolve();
    await flush();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
