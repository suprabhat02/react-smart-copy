import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureSource, type Rasterizer } from '../src/capture';
import {
  createBrowserClipboardAdapter,
  createBrowserPasteAdapter,
  type ClipboardAdapter,
  type ClipboardItemData,
  type OperationContext,
} from '../src/core';
import { copyFailure } from '../src/core/errors';
import { createCopyMachine } from '../src/core/copy-machine';
import { createOperations, resolveMaxRetries } from '../src/core/machine-shared';
import type { PasteAdapter } from '../src/core/paste-adapter';
import { canRetryPasteState, createPasteMachine, type PasteState } from '../src/core/paste-machine';
import { collectClipboardItems, resolvePasteReadOptions, type PasteAccept, type PasteResult } from '../src/core/paste-reader';
import { failureType, fakeClipboardItem, fakeDataTransfer, fakePasteEvent, pngBlob } from './fixtures';
import { deferred, flush, permissionDenied, type Deferred } from './helpers';

const textResult: PasteResult = {
  source: 'clipboard',
  items: [{ type: 'text/plain', data: 'Hello' }],
  text: 'Hello',
  html: null,
  images: [],
  files: [],
};

/** An adapter whose reads stay pending, recording the context each read received. */
function pendingPasteAdapter() {
  const reads: Deferred<PasteResult>[] = [];
  const contexts: (OperationContext | undefined)[] = [];
  const adapter: PasteAdapter = {
    read: (_options, context) => {
      contexts.push(context);
      const d = deferred<PasteResult>();
      reads.push(d);
      return d.promise;
    },
  };
  return { adapter, reads, contexts };
}

/** Fails with `reasons` in order, then succeeds. */
function scriptedPasteAdapter(reasons: unknown[]) {
  const read = vi.fn<PasteAdapter['read']>(() => {
    const reason = reasons.shift();
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- platform-shaped errors
    return reason === undefined ? Promise.resolve(textResult) : Promise.reject(reason);
  });
  return { adapter: { read } satisfies PasteAdapter, read };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/* ============================================================ Paste retry */

describe('paste retry()', () => {
  it('ignores retry() when there is nothing to retry', async () => {
    const machine = createPasteMachine({ adapter: scriptedPasteAdapter([]).adapter });
    expect(await machine.retry()).toEqual({ status: 'ignored', reason: 'nothing-to-retry' });
    await machine.paste();
    expect(machine.getSnapshot().status).toBe('read');
    expect(await machine.retry()).toEqual({ status: 'ignored', reason: 'nothing-to-retry' });
  });

  it('re-reads the clipboard after a retryable failure and counts attempts', async () => {
    const { adapter, read } = scriptedPasteAdapter([permissionDenied, permissionDenied]);
    const machine = createPasteMachine({ adapter });

    await machine.paste();
    let state = machine.getSnapshot();
    expect(state).toMatchObject({ status: 'error', source: 'clipboard', retryCount: 0, error: { type: 'permission-denied' } });
    expect(canRetryPasteState(state)).toBe(true);

    await machine.retry();
    state = machine.getSnapshot();
    expect(state).toMatchObject({ status: 'error', retryCount: 1 });

    expect(await machine.retry()).toEqual({ status: 'read', result: textResult });
    expect(machine.getSnapshot().status).toBe('read');
    expect(read).toHaveBeenCalledTimes(3);
  });

  it('stops at maxRetries with a max-retries-exceeded error', async () => {
    const onError = vi.fn();
    const { adapter, read } = scriptedPasteAdapter([permissionDenied, permissionDenied, permissionDenied]);
    const machine = createPasteMachine({ adapter, maxRetries: 1, onError });

    await machine.paste();
    await machine.retry();
    expect(canRetryPasteState(machine.getSnapshot(), 1)).toBe(false);

    const outcome = await machine.retry();
    expect(outcome).toMatchObject({ status: 'error', error: { type: 'max-retries-exceeded' } });
    expect(machine.getSnapshot()).toMatchObject({ status: 'error', retryCount: 1, error: { type: 'max-retries-exceeded' } });
    expect(onError).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'max-retries-exceeded' }));
    expect(read).toHaveBeenCalledTimes(2);
    // max-retries-exceeded is terminal.
    expect(await machine.retry()).toEqual({ status: 'ignored', reason: 'not-retryable' });
  });

  it('a fresh paste() starts counting from zero again', async () => {
    const { adapter } = scriptedPasteAdapter([permissionDenied, permissionDenied, permissionDenied]);
    const machine = createPasteMachine({ adapter });
    await machine.paste();
    await machine.retry();
    expect(machine.getSnapshot()).toMatchObject({ retryCount: 1 });
    await machine.paste();
    expect(machine.getSnapshot()).toMatchObject({ status: 'error', retryCount: 0 });
  });

  it('does not retry non-retryable errors', async () => {
    const machine = createPasteMachine({ adapter: scriptedPasteAdapter([copyFailure('unsupported', 'No API.')]).adapter });
    await machine.paste();
    expect(canRetryPasteState(machine.getSnapshot())).toBe(false);
    expect(await machine.retry()).toEqual({ status: 'ignored', reason: 'not-retryable' });
  });

  it('does not retry paste-event failures: their data is gone after dispatch', async () => {
    const machine = createPasteMachine({ maxBytes: 2 });
    await machine.pasteEvent(fakePasteEvent(fakeDataTransfer({ 'text/plain': 'too long' })));
    const state = machine.getSnapshot();
    expect(state).toMatchObject({ status: 'error', source: 'event', error: { type: 'too-large' } });
    expect(await machine.retry()).toEqual({ status: 'ignored', reason: 'not-retryable' });

    const invalid = createPasteMachine({ accept: [] });
    await invalid.pasteEvent(fakePasteEvent(fakeDataTransfer({ 'text/plain': 'x' })));
    expect(invalid.getSnapshot()).toMatchObject({ status: 'error', source: 'event', retryCount: 0 });
  });

  it('honours maxRetries 0 and Infinity', () => {
    const failed: PasteState = {
      status: 'error',
      source: 'clipboard',
      retryCount: 50,
      error: { type: 'permission-denied', message: 'x', cause: undefined },
    };
    expect(canRetryPasteState(failed, 0)).toBe(false);
    expect(canRetryPasteState(failed, Infinity)).toBe(true);
    expect(canRetryPasteState({ status: 'idle' })).toBe(false);
    expect(resolveMaxRetries(2.7)).toBe(2);
    expect(resolveMaxRetries(-1)).toBe(0);
    expect(resolveMaxRetries(Number.NaN)).toBe(3);
  });
});

/* ======================================================= Cancellation core */

describe('createOperations', () => {
  it('aborts the previous operation on start and on abort(), and abort() is idempotent', () => {
    const ops = createOperations();
    const first = ops.start();
    const second = ops.start();
    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);
    ops.abort();
    ops.abort();
    expect(second.signal.aborted).toBe(true);
  });
});

describe('copy cancellation', () => {
  function pendingCopyAdapter() {
    const contexts: (OperationContext | undefined)[] = [];
    const adapter: ClipboardAdapter = {
      write: (_payload, context) => {
        contexts.push(context);
        return new Promise(() => undefined);
      },
    };
    return { adapter, contexts };
  }

  it('passes a live signal to the adapter and aborts it on reset()', () => {
    const { adapter, contexts } = pendingCopyAdapter();
    const machine = createCopyMachine({ adapter });
    void machine.copy('a');
    const signal = contexts[0]?.signal;
    expect(signal?.aborted).toBe(false);
    machine.reset();
    expect(signal?.aborted).toBe(true);
    expect(machine.getSnapshot().status).toBe('idle');
  });

  it('aborts in-flight work when the host disconnects (unmount)', () => {
    const { adapter, contexts } = pendingCopyAdapter();
    const machine = createCopyMachine({ adapter });
    const disconnect = machine.connect();
    void machine.copy('a');
    disconnect();
    expect(contexts[0]?.signal.aborted).toBe(true);
  });

  it('hands the signal to lazy image sources through the browser adapter', async () => {
    class Item {
      constructor(readonly items: Record<string, ClipboardItemData>) {}
    }
    const write = vi.fn(async (items: readonly unknown[]) => {
      for (const item of items as Item[]) await Promise.all(Object.values(item.items).map((value) => Promise.resolve(value)));
    });
    const adapter = createBrowserClipboardAdapter({
      getEnvironment: () => ({ isSecureContext: true, navigator: { clipboard: { write } }, ClipboardItem: Item }),
    });
    const source = vi.fn((_context?: OperationContext) => new Blob(['png'], { type: 'image/png' }));
    const machine = createCopyMachine({ adapter });
    await machine.copy({ kind: 'image', blob: source });
    expect(source).toHaveBeenCalledWith(expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(machine.getSnapshot().status).toBe('copied');
  });
});

describe('cancelled outcomes and finished operations', () => {
  it('copy: an image source cancelled by reset() resolves ignored/cancelled, not an error', async () => {
    const onError = vi.fn();
    const source = vi.fn(
      ({ signal }: OperationContext = { signal: new AbortController().signal }) =>
        new Promise<Blob>((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            reject(new DOMException('Stopped', 'AbortError'));
          });
        }),
    );
    class Item {
      constructor(readonly items: Record<string, ClipboardItemData>) {}
    }
    const write = vi.fn(async (items: readonly unknown[]) => {
      for (const item of items as Item[]) await Promise.all(Object.values(item.items).map((v) => Promise.resolve(v)));
    });
    const adapter = createBrowserClipboardAdapter({
      getEnvironment: () => ({ isSecureContext: true, navigator: { clipboard: { write } }, ClipboardItem: Item }),
    });
    const machine = createCopyMachine({ adapter, onError });
    const outcome = machine.copy({ kind: 'image', blob: source });
    machine.reset();
    expect(await outcome).toEqual({ status: 'ignored', reason: 'cancelled' });
    expect(onError).not.toHaveBeenCalled();
    expect(machine.getSnapshot().status).toBe('idle');
  });

  it('adapter: an aborted image source is classified as aborted when called directly', async () => {
    class Item {
      constructor(readonly items: Record<string, ClipboardItemData>) {}
    }
    const write = vi.fn(async (items: readonly unknown[]) => {
      for (const item of items as Item[]) await Promise.all(Object.values(item.items).map((v) => Promise.resolve(v)));
    });
    const adapter = createBrowserClipboardAdapter({
      getEnvironment: () => ({ isSecureContext: true, navigator: { clipboard: { write } }, ClipboardItem: Item }),
    });
    const controller = new AbortController();
    controller.abort();
    const payload = { kind: 'image', blob: () => Promise.reject(new Error('stopped')) } as const;
    expect(await failureType(adapter.write(payload, { signal: controller.signal }))).toBe('aborted');
    expect(await failureType(adapter.write(payload))).toBe('blob-generation-failed');
  });

  it('paste: a read superseded by a paste event resolves ignored/cancelled', async () => {
    const adapter: PasteAdapter = {
      read: (_options, context) =>
        new Promise((_resolve, reject) => {
          context?.signal.addEventListener('abort', () => {
            reject(copyFailure('aborted', 'stopped'));
          });
        }),
    };
    const onError = vi.fn();
    const machine = createPasteMachine({ adapter, onError });
    const first = machine.paste();
    await machine.pasteEvent(fakePasteEvent(fakeDataTransfer({ 'text/plain': 'event' })));
    expect(await first).toEqual({ status: 'ignored', reason: 'cancelled' });
    expect(onError).not.toHaveBeenCalled();
    expect(machine.getSnapshot()).toMatchObject({ status: 'read', result: { text: 'event' } });
  });

  it('a finished operation is never aborted later (reset after success)', async () => {
    const contexts: (OperationContext | undefined)[] = [];
    const copier = createCopyMachine({
      adapter: {
        write: (_payload, context) => {
          contexts.push(context);
          return Promise.resolve();
        },
      },
    });
    await copier.copy('a');
    copier.reset();
    await copier.copy('b');
    expect(contexts.map((c) => c?.signal.aborted)).toEqual([false, false]);

    const reader = createPasteMachine({
      adapter: {
        read: (_options, context) => {
          contexts.push(context);
          return Promise.resolve(textResult);
        },
      },
    });
    await reader.paste();
    reader.reset();
    expect(contexts[2]?.signal.aborted).toBe(false);
  });

  it('end() of an older operation does not detach the current one', () => {
    const ops = createOperations();
    const first = ops.start();
    const second = ops.start();
    ops.end(first);
    ops.abort();
    expect(second.signal.aborted).toBe(true);
  });
});

describe('paste cancellation', () => {
  it('aborts the clipboard read when a paste event supersedes it', async () => {
    const { adapter, contexts } = pendingPasteAdapter();
    const machine = createPasteMachine({ adapter });
    void machine.paste();
    await machine.pasteEvent(fakePasteEvent(fakeDataTransfer({ 'text/plain': 'from event' })));
    expect(contexts[0]?.signal.aborted).toBe(true);
    expect(machine.getSnapshot()).toMatchObject({ status: 'read', result: { text: 'from event' } });
  });

  it('aborts on reset(), on disconnect, and when options fail on the event path', async () => {
    const { adapter, contexts } = pendingPasteAdapter();
    const machine = createPasteMachine({ adapter });

    void machine.paste();
    machine.reset();
    expect(contexts[0]?.signal.aborted).toBe(true);

    const disconnect = machine.connect();
    void machine.paste();
    disconnect();
    expect(contexts[1]?.signal.aborted).toBe(true);

    let accept: readonly PasteAccept[] = ['text'];
    const lazy = createPasteMachine(() => ({ adapter, accept }));
    void lazy.paste();
    accept = [];
    await lazy.pasteEvent(fakePasteEvent(fakeDataTransfer({ 'text/plain': 'x' })));
    expect(contexts[2]?.signal.aborted).toBe(true);
  });

  it('the browser paste adapter stops decoding once aborted', async () => {
    const controller = new AbortController();
    const items = [fakeClipboardItem({ 'text/plain': 'a', 'text/html': '<b>a</b>' })];
    const options = resolvePasteReadOptions({ accept: ['text', 'html'] });
    controller.abort();
    expect(await failureType(collectClipboardItems(items, options, controller.signal))).toBe('aborted');
    // Without a signal, nothing changes.
    expect(await collectClipboardItems(items, options)).toHaveLength(2);

    const read = vi.fn(() => Promise.resolve(items));
    const adapter = createBrowserPasteAdapter({
      getEnvironment: () => ({ isSecureContext: true, navigator: { clipboard: { read } } }),
    });
    expect(await failureType(adapter.read(options, { signal: controller.signal }))).toBe('aborted');
  });
});

/* =================================================== Capture cancellation */

describe('captureSource cancellation', () => {
  const element = (): HTMLDivElement => {
    const div = document.createElement('div');
    div.getBoundingClientRect = () => ({ width: 4, height: 4 }) as DOMRect;
    return div;
  };

  it('passes a signal that aborts with the copy, and keeps working without one', async () => {
    let seen: AbortSignal | undefined;
    const pending = deferred<Blob>();
    const rasterize = vi.fn<Rasterizer>((_node, { signal }) => {
      seen = signal;
      return pending.promise;
    });
    const source = captureSource(element, { rasterize });
    const controller = new AbortController();
    const result = source({ signal: controller.signal });
    await flush();
    controller.abort();
    expect(seen?.aborted).toBe(true);
    expect(await failureType(result)).toBe('aborted');

    const ok = vi.fn<Rasterizer>(() => pngBlob());
    expect((await captureSource(element, { rasterize: ok })()).type).toBe('image/png');
  });

  it('detaches its listeners from a long-lived caller signal once the capture settles (no AbortSignal.any)', async () => {
    vi.stubGlobal('AbortSignal', Object.assign(class extends AbortSignal {}, { any: undefined }));
    const caller = new AbortController();
    const add = vi.spyOn(caller.signal, 'addEventListener');
    const remove = vi.spyOn(caller.signal, 'removeEventListener');
    const source = captureSource(element, { rasterize: () => pngBlob(), signal: caller.signal });
    for (let i = 0; i < 3; i++) await source({ signal: new AbortController().signal });
    expect(add).toHaveBeenCalledTimes(3);
    expect(remove).toHaveBeenCalledTimes(3);
    expect(remove.mock.calls.map(([, fn]) => fn)).toEqual(add.mock.calls.map(([, fn]) => fn));
  });

  it('aborts when either the caller signal or the copy signal aborts (with and without AbortSignal.any)', async () => {
    for (const withAny of [true, false]) {
      if (!withAny) vi.stubGlobal('AbortSignal', Object.assign(class extends AbortSignal {}, { any: undefined }));
      for (const which of ['caller', 'copy', 'already', 'already-copy'] as const) {
        const caller = new AbortController();
        const copy = new AbortController();
        if (which === 'already') caller.abort();
        if (which === 'already-copy') copy.abort();
        const rasterize = vi.fn<Rasterizer>(() => new Promise<Blob>(() => undefined));
        const result = captureSource(element, { rasterize, signal: caller.signal })({ signal: copy.signal });
        await flush();
        if (which === 'caller') caller.abort();
        if (which === 'copy') copy.abort();
        expect(await failureType(result)).toBe('aborted');
      }
      vi.unstubAllGlobals();
    }
  });
});
