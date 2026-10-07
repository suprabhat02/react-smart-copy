import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PasteAccept, PasteResult } from '../src/core';
import { createCopyCoordinator } from '../src/core/copy-coordinator';
import { createCopyMachine } from '../src/core/copy-machine';
import { createOperations } from '../src/core/machine-shared';
import type { PasteAdapter } from '../src/core/paste-adapter';
import { createPasteMachine } from '../src/core/paste-machine';
import { fakeDataTransfer, fakePasteEvent } from './fixtures';
import { createControllableAdapter, deferred, flush, permissionDenied, type Deferred } from './helpers';

const textResult: PasteResult = {
  source: 'clipboard',
  items: [{ type: 'text/plain', data: 'Hello' }],
  text: 'Hello',
  html: null,
  images: [],
  files: [],
  imageFiles: [],
};

function pendingPasteAdapter() {
  const reads: Deferred<PasteResult>[] = [];
  const adapter: PasteAdapter = {
    read: () => {
      const d = deferred<PasteResult>();
      reads.push(d);
      return d.promise;
    },
  };
  return { adapter, reads };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('createOperations().abort()', () => {
  it('reports whether an operation was cancelled', () => {
    const ops = createOperations();
    expect(ops.abort()).toBe(false);
    const context = ops.start();
    expect(ops.abort()).toBe(true);
    expect(ops.abort()).toBe(false);
    const next = ops.start();
    ops.end(next);
    expect(ops.abort()).toBe(false);
    expect(context.signal.aborted).toBe(true);
    expect(next.signal.aborted).toBe(false);
  });
});

describe('copy onReset / onCancel', () => {
  it('reset() while copying: onCancel("reset") then onReset, after the state is idle', async () => {
    const { adapter, reject } = createControllableAdapter();
    const calls: string[] = [];
    const machine = createCopyMachine({
      adapter,
      onCancel: (reason) => calls.push(`cancel:${reason}:${machine.getSnapshot().status}`),
      onReset: () => calls.push(`reset:${machine.getSnapshot().status}`),
    });
    const outcome = machine.copy('x');
    machine.reset();
    expect(calls).toEqual(['cancel:reset:idle', 'reset:idle']);
    reject(new Error('aborted'));
    expect(await outcome).toEqual({ status: 'ignored', reason: 'cancelled' });
  });

  it('reset() from copied and error calls onReset only; from idle calls nothing', async () => {
    const { adapter, resolve, reject } = createControllableAdapter();
    const onReset = vi.fn();
    const onCancel = vi.fn();
    const machine = createCopyMachine({ adapter, onReset, onCancel });

    machine.reset();
    expect(onReset).not.toHaveBeenCalled();

    const copied = machine.copy('x');
    resolve();
    await copied;
    machine.reset();
    expect(onReset).toHaveBeenCalledTimes(1);

    const failed = machine.copy('x');
    reject(permissionDenied);
    await failed;
    machine.reset();
    expect(onReset).toHaveBeenCalledTimes(2);

    // An invalid payload settles synchronously: there is no operation to cancel.
    await machine.copy({ text: '' } as never);
    machine.reset();
    expect(onReset).toHaveBeenCalledTimes(3);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('does not call onReset for the automatic reset or a coordinator hand-off', async () => {
    vi.useFakeTimers();
    const coordinator = createCopyCoordinator();
    const onReset = vi.fn();
    const a = createCopyMachine({ adapter: { write: () => Promise.resolve() }, coordinator, onReset, resetAfterMs: 50 });
    const b = createCopyMachine({ adapter: { write: () => Promise.resolve() }, coordinator, onReset });

    await a.copy('a');
    await b.copy('b');
    expect(a.getSnapshot().status).toBe('idle');

    vi.advanceTimersByTime(5000);
    await a.copy('a');
    vi.advanceTimersByTime(50);
    expect(a.getSnapshot().status).toBe('idle');
    expect(onReset).not.toHaveBeenCalled();
  });

  it('disconnect while copying calls onCancel("disconnect"); disconnect while settled calls nothing', async () => {
    const { adapter, resolve, reject } = createControllableAdapter();
    const onCancel = vi.fn();
    const onReset = vi.fn();
    const machine = createCopyMachine({ adapter, onCancel, onReset });

    machine.connect()();
    expect(onCancel).not.toHaveBeenCalled();

    const disconnect = machine.connect();
    const outcome = machine.copy('x');
    disconnect();
    expect(onCancel).toHaveBeenCalledExactlyOnceWith('disconnect');
    expect(onReset).not.toHaveBeenCalled();
    reject(new Error('aborted'));
    expect(await outcome).toEqual({ status: 'ignored', reason: 'cancelled' });

    const finished = machine.copy('y');
    resolve();
    await finished;
    machine.connect()();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('reads the latest callbacks and reports callback errors without corrupting state', async () => {
    const reportError = vi.fn();
    vi.stubGlobal('reportError', reportError);
    const { adapter } = createControllableAdapter();
    let onReset = (): void => {
      throw new Error('stale');
    };
    const machine = createCopyMachine(() => ({
      adapter,
      onReset,
      onCancel: () => {
        throw new Error('boom');
      },
    }));
    void machine.copy('x');
    onReset = vi.fn();
    machine.reset();
    expect(machine.getSnapshot().status).toBe('idle');
    expect(reportError).toHaveBeenCalledExactlyOnceWith(new Error('boom'));
    expect(onReset).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});

describe('paste onReset / onCancel', () => {
  it('reset() while reading: onCancel("reset") then onReset', async () => {
    const { adapter, reads } = pendingPasteAdapter();
    const calls: string[] = [];
    const machine = createPasteMachine({
      adapter,
      onCancel: (reason) => calls.push(`cancel:${reason}`),
      onReset: () => calls.push('reset'),
    });
    const outcome = machine.paste();
    machine.reset();
    expect(calls).toEqual(['cancel:reset', 'reset']);
    reads[0]?.reject(new Error('aborted'));
    expect(await outcome).toEqual({ status: 'ignored', reason: 'cancelled' });
    machine.reset();
    expect(calls).toHaveLength(2);
  });

  it('reset() from read and error calls onReset only', async () => {
    const { adapter, reads } = pendingPasteAdapter();
    const onReset = vi.fn();
    const onCancel = vi.fn();
    const machine = createPasteMachine({ adapter, onReset, onCancel });

    const ok = machine.paste();
    reads[0]?.resolve(textResult);
    await ok;
    machine.reset();

    const failed = machine.paste();
    reads[1]?.reject(permissionDenied);
    await failed;
    expect(machine.getSnapshot().status).toBe('error');
    machine.reset();

    expect(onReset).toHaveBeenCalledTimes(2);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('a paste event superseding a clipboard read calls onCancel("superseded")', async () => {
    const { adapter, reads } = pendingPasteAdapter();
    const onCancel = vi.fn();
    const machine = createPasteMachine({ adapter, onCancel });
    const pending = machine.paste();
    await machine.pasteEvent(fakePasteEvent(fakeDataTransfer({ 'text/plain': 'from event' })));
    expect(onCancel).toHaveBeenCalledExactlyOnceWith('superseded');
    reads[0]?.reject(new Error('aborted'));
    expect(await pending).toEqual({ status: 'ignored', reason: 'cancelled' });

    // A paste event with nothing in flight cancels nothing.
    await machine.pasteEvent(fakePasteEvent(fakeDataTransfer({ 'text/plain': 'again' })));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel("superseded") when invalid options fail the event path mid-read', async () => {
    const { adapter } = pendingPasteAdapter();
    const onCancel = vi.fn();
    let accept: readonly PasteAccept[] = ['text'];
    const machine = createPasteMachine(() => ({ adapter, accept, onCancel }));
    void machine.paste();
    accept = [];
    await machine.pasteEvent(fakePasteEvent(fakeDataTransfer({ 'text/plain': 'x' })));
    expect(machine.getSnapshot().status).toBe('error');
    expect(onCancel).toHaveBeenCalledExactlyOnceWith('superseded');

    // Same failure with nothing in flight: no cancellation.
    await machine.pasteEvent(fakePasteEvent(fakeDataTransfer({ 'text/plain': 'x' })));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('disconnect while reading calls onCancel("disconnect")', async () => {
    const { adapter, reads } = pendingPasteAdapter();
    const onCancel = vi.fn();
    const machine = createPasteMachine({ adapter, onCancel });
    machine.connect()();
    const disconnect = machine.connect();
    const outcome = machine.paste();
    disconnect();
    reads[0]?.reject(new Error('aborted'));
    await flush();
    expect(onCancel).toHaveBeenCalledExactlyOnceWith('disconnect');
    expect(machine.getSnapshot().status).toBe('idle');
    expect(await outcome).toEqual({ status: 'ignored', reason: 'cancelled' });
  });
});
