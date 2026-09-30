import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPasteMachine,
  createBrowserPasteAdapter,
  type PasteAdapter,
  type PasteResult,
} from '../src/core/paste-machine';
import { deferred, flush } from './helpers';

// ---------------------------------------------------------------------------
// Minimal adapter helpers
// ---------------------------------------------------------------------------

function makeAdapter(result: PasteResult | (() => Promise<PasteResult>)): PasteAdapter {
  return {
    read: typeof result === 'function' ? result : () => Promise.resolve(result),
  };
}

function makeFailingAdapter(cause: unknown): PasteAdapter {
  // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
  return { read: () => Promise.reject(cause) };
}

function makeControllableAdapter() {
  const reads: ReturnType<typeof deferred<PasteResult>>[] = [];
  const adapter: PasteAdapter = {
    read: () => {
      const d = deferred<PasteResult>();
      reads.push(d);
      return d.promise;
    },
  };
  const at = (index: number) => {
    const d = index < 0 ? reads[reads.length + index] : reads[index];
    if (!d) throw new Error(`No read #${String(index)}`);
    return d;
  };
  return {
    adapter,
    resolve: (result: PasteResult, index = -1) => { at(index).resolve(result); },
    reject: (reason: unknown, index = -1) => { at(index).reject(reason); },
    count: () => reads.length,
  };
}

const textResult: PasteResult = { kind: 'text', value: 'Hello, clipboard!' };
const imageResult: PasteResult = {
  kind: 'image',
  blob: new Blob(['png'], { type: 'image/png' }),
  mimeType: 'image/png',
};

// ---------------------------------------------------------------------------
// Basic state transitions
// ---------------------------------------------------------------------------

describe('createPasteMachine — basic transitions', () => {
  it('starts in idle', () => {
    const m = createPasteMachine({ adapter: makeAdapter(textResult) });
    expect(m.getSnapshot().status).toBe('idle');
  });

  it('idle → reading → read on success', async () => {
    const ctrl = makeControllableAdapter();
    const m = createPasteMachine({ adapter: ctrl.adapter });

    const promise = m.paste();
    expect(m.getSnapshot().status).toBe('reading');

    ctrl.resolve(textResult);
    await flush();
    await promise;

    const snap = m.getSnapshot();
    expect(snap.status).toBe('read');
    if (snap.status === 'read') {
      expect(snap.result).toEqual(textResult);
      expect(typeof snap.at).toBe('number');
    }
  });

  it('idle → reading → error on failure', async () => {
    const m = createPasteMachine({
      adapter: makeFailingAdapter({ name: 'NotAllowedError', message: 'Permission denied.' }),
    });

    const outcome = await m.paste();
    expect(outcome.status).toBe('error');
    if (outcome.status === 'error') {
      expect(outcome.error.type).toBe('permission-denied');
    }

    const snap = m.getSnapshot();
    expect(snap.status).toBe('error');
    if (snap.status === 'error') {
      expect(snap.error.type).toBe('permission-denied');
    }
  });

  it('ignores a second paste() while reading', async () => {
    const ctrl = makeControllableAdapter();
    const m = createPasteMachine({ adapter: ctrl.adapter });

    void m.paste();
    expect(m.getSnapshot().status).toBe('reading');

    const second = await m.paste();
    expect(second.status).toBe('ignored');
    if (second.status === 'ignored') expect(second.reason).toBe('in-flight');
    expect(ctrl.count()).toBe(1); // adapter only called once
  });

  it('reset() from reading goes to idle and discards result', async () => {
    const ctrl = makeControllableAdapter();
    const m = createPasteMachine({ adapter: ctrl.adapter });

    void m.paste();
    m.reset();
    expect(m.getSnapshot().status).toBe('idle');

    ctrl.resolve(textResult);
    await flush();
    expect(m.getSnapshot().status).toBe('idle'); // result discarded
  });

  it('reset() from read goes to idle', async () => {
    const m = createPasteMachine({ adapter: makeAdapter(textResult) });
    await m.paste();
    expect(m.getSnapshot().status).toBe('read');
    m.reset();
    expect(m.getSnapshot().status).toBe('idle');
  });

  it('reset() from error goes to idle', async () => {
    const m = createPasteMachine({
      adapter: makeFailingAdapter({ name: 'NotAllowedError', message: 'Denied.' }),
    });
    await m.paste();
    expect(m.getSnapshot().status).toBe('error');
    m.reset();
    expect(m.getSnapshot().status).toBe('idle');
  });
});

// ---------------------------------------------------------------------------
// Auto-reset
// ---------------------------------------------------------------------------

describe('createPasteMachine — resetAfterMs', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('stays read when resetAfterMs is false (default)', async () => {
    const m = createPasteMachine({ adapter: makeAdapter(textResult) });
    m.connect();
    await m.paste();
    await flush();

    vi.advanceTimersByTime(60_000);
    expect(m.getSnapshot().status).toBe('read');
  });

  it('auto-resets to idle after resetAfterMs', async () => {
    const m = createPasteMachine({ adapter: makeAdapter(textResult), resetAfterMs: 1000 });
    m.connect();
    await m.paste();
    await flush();

    expect(m.getSnapshot().status).toBe('read');
    vi.advanceTimersByTime(1000);
    expect(m.getSnapshot().status).toBe('idle');
  });

  it('connect() re-arms timer after remount', async () => {
    const m = createPasteMachine({
      adapter: makeAdapter(textResult),
      resetAfterMs: 1000,
      now: () => Date.now(),
    });
    const cleanup = m.connect();
    await m.paste();
    await flush();

    // Simulate 400 ms passing then remount (StrictMode style)
    vi.advanceTimersByTime(400);
    cleanup();
    m.connect(); // re-arm

    vi.advanceTimersByTime(600);
    expect(m.getSnapshot().status).toBe('idle');
  });
});

// ---------------------------------------------------------------------------
// Callbacks
// ---------------------------------------------------------------------------

describe('createPasteMachine — callbacks', () => {
  it('calls onPaste with the result', async () => {
    const onPaste = vi.fn();
    const m = createPasteMachine({ adapter: makeAdapter(textResult), onPaste });
    await m.paste();
    expect(onPaste).toHaveBeenCalledWith(textResult);
  });

  it('calls onError with the classified error', async () => {
    const onError = vi.fn();
    const m = createPasteMachine({
      adapter: makeFailingAdapter({ name: 'NotAllowedError', message: 'No.' }),
      onError,
    });
    await m.paste();
    expect(onError).toHaveBeenCalledOnce();
    const call = onError.mock.calls[0] as [{ type: string }] | undefined;
    expect(call?.[0].type).toBe('permission-denied');
  });

  it('does not corrupt state when onPaste throws', async () => {
    const reportError = vi.fn();
    vi.stubGlobal('reportError', reportError);
    const m = createPasteMachine({
      adapter: makeAdapter(textResult),
      onPaste: () => { throw new Error('boom'); },
    });
    await m.paste();
    // State should still be 'read' — callback error reported via reportError
    expect(m.getSnapshot().status).toBe('read');
    expect(reportError).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Subscription
// ---------------------------------------------------------------------------

describe('createPasteMachine — subscription', () => {
  it('notifies subscribers on every transition', async () => {
    const ctrl = makeControllableAdapter();
    const m = createPasteMachine({ adapter: ctrl.adapter });
    const states: string[] = [];
    m.subscribe(() => { states.push(m.getSnapshot().status); });

    void m.paste();
    ctrl.resolve(textResult);
    await flush();

    expect(states).toEqual(['reading', 'read']);
  });

  it('unsubscribe stops notifications', async () => {
    const m = createPasteMachine({ adapter: makeAdapter(textResult) });
    const fn = vi.fn();
    const unsub = m.subscribe(fn);
    unsub();
    await m.paste();
    expect(fn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Paste result kinds
// ---------------------------------------------------------------------------

describe('createPasteMachine — result kinds', () => {
  it('surfaces text result', async () => {
    const m = createPasteMachine({ adapter: makeAdapter(textResult) });
    const outcome = await m.paste();
    expect(outcome.status).toBe('read');
    if (outcome.status === 'read') {
      expect(outcome.result.kind).toBe('text');
      if (outcome.result.kind === 'text') {
        expect(outcome.result.value).toBe('Hello, clipboard!');
      }
    }
  });

  it('surfaces image result', async () => {
    const m = createPasteMachine({ adapter: makeAdapter(imageResult) });
    const outcome = await m.paste();
    if (outcome.status === 'read') {
      expect(outcome.result.kind).toBe('image');
      if (outcome.result.kind === 'image') {
        expect(outcome.result.mimeType).toBe('image/png');
        expect(outcome.result.blob).toBeInstanceOf(Blob);
      }
    }
  });

  it('surfaces multi result', async () => {
    const multi: PasteResult = {
      kind: 'multi',
      items: [
        { mimeType: 'text/plain', data: 'plain' },
        { mimeType: 'text/html', data: '<b>bold</b>' },
      ],
      text: 'plain',
    };
    const m = createPasteMachine({ adapter: makeAdapter(multi) });
    const outcome = await m.paste();
    if (outcome.status === 'read') {
      expect(outcome.result.kind).toBe('multi');
      if (outcome.result.kind === 'multi') {
        expect(outcome.result.text).toBe('plain');
        expect(outcome.result.items).toHaveLength(2);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// connect() / StrictMode lifecycle
// ---------------------------------------------------------------------------

describe('createPasteMachine — connect()', () => {
  it('cleanup unsticks reading state', async () => {
    const ctrl = makeControllableAdapter();
    const m = createPasteMachine({ adapter: ctrl.adapter });
    const cleanup = m.connect();

    void m.paste();
    expect(m.getSnapshot().status).toBe('reading');

    cleanup();
    expect(m.getSnapshot().status).toBe('idle');

    ctrl.resolve(textResult);
    await flush();
    expect(m.getSnapshot().status).toBe('idle'); // stale result discarded
  });

  it('survives double-connect (StrictMode)', async () => {
    const m = createPasteMachine({ adapter: makeAdapter(textResult) });
    const c1 = m.connect();
    c1();
    const c2 = m.connect();

    await m.paste();
    expect(m.getSnapshot().status).toBe('read');
    c2();
  });
});

// ---------------------------------------------------------------------------
// createBrowserPasteAdapter — unit test with mocked navigator
// ---------------------------------------------------------------------------

describe('createBrowserPasteAdapter', () => {
  it('reads text via readText fallback', async () => {
    const adapter = createBrowserPasteAdapter();
    Object.defineProperty(globalThis, 'isSecureContext', { value: true, configurable: true });
    const readText = vi.fn().mockResolvedValue('copied text');
    Object.defineProperty(navigator, 'clipboard', {
      value: { readText },
      configurable: true,
    });

    const result = await adapter.read(['text/plain']);
    expect(result.kind).toBe('text');
    if (result.kind === 'text') expect(result.value).toBe('copied text');
  });

  it('classifies NotAllowedError correctly', async () => {
    const adapter = createBrowserPasteAdapter();
    Object.defineProperty(globalThis, 'isSecureContext', { value: true, configurable: true });
    Object.defineProperty(navigator, 'clipboard', {
      value: { readText: vi.fn().mockRejectedValue({ name: 'NotAllowedError', message: 'Denied.' }) },
      configurable: true,
    });

    await expect(adapter.read(['text/plain'])).rejects.toMatchObject({ copyError: { type: 'permission-denied' } });
  });
});
