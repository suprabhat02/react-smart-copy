import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createBrowserClipboardAdapter,
  createCopyMachine,
  copyFailure,
  type ClipboardAdapter,
  type ClipboardEnvironment,
  type CopyPayload,
  type CopySourceContext,
} from '../src/core';

/** A promise the test settles by hand. */
function later<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const flush = async (): Promise<void> => {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
};

describe('an async copy source, in the machine', () => {
  it('starts the write in the same tick as copy(), with a promise of the text (the gesture is kept)', async () => {
    const link = later<string>();
    const received: Promise<string>[] = [];
    const write = vi.fn(() => Promise.resolve());
    const adapter: ClipboardAdapter = {
      write,
      writeDeferred: (text) => {
        received.push(text);
        return text.then(() => undefined);
      },
    };
    const m = createCopyMachine({ adapter });
    const outcome = m.copy(() => link.promise);
    // Synchronously: the platform write has already begun.
    expect(received).toHaveLength(1);
    expect(m.getSnapshot()).toEqual({ status: 'copying', payload: null, retryCount: 0 });
    link.resolve('https://example.com/s/abc');
    expect(await received[0]).toBe('https://example.com/s/abc');
    expect(await outcome).toEqual({ status: 'copied', payload: { kind: 'text', value: 'https://example.com/s/abc' } });
    expect(m.getSnapshot()).toMatchObject({ status: 'copied', payload: { kind: 'text', value: 'https://example.com/s/abc' } });
    expect(write).not.toHaveBeenCalled();
  });

  it('copies JSON as its text, and reports the JSON payload', async () => {
    let text = '';
    const adapter: ClipboardAdapter = {
      write: () => Promise.resolve(),
      writeDeferred: async (deferred) => {
        text = await deferred;
      },
    };
    const onCopy = vi.fn();
    const outcome = await createCopyMachine({ adapter, onCopy }).copy(() => Promise.resolve({ kind: 'json', value: { id: 7 }, pretty: false } as const));
    expect(text).toBe('{"id":7}');
    expect(outcome).toMatchObject({ status: 'copied', payload: { kind: 'json' } });
    expect(onCopy).toHaveBeenCalledWith({ kind: 'json', value: { id: 7 }, pretty: false });
  });

  it('refuses HTML or an image from an async source, before anything is reported copied', async () => {
    const write = vi.fn(() => Promise.resolve());
    const m = createCopyMachine({ adapter: { write } });
    const html = (() => Promise.resolve({ kind: 'html', html: '<b>x</b>', text: 'x' })) as unknown as () => Promise<string>;
    const outcome = await m.copy(html);
    expect(outcome).toMatchObject({ status: 'error', error: { type: 'invalid-payload' } });
    expect(outcome.status === 'error' && outcome.error.message).toContain('text or JSON');
    expect(write).not.toHaveBeenCalled();
  });

  it('checks the text like any payload: empty text is an error', async () => {
    const outcome = await createCopyMachine({ adapter: { write: () => Promise.resolve() } }).copy(() => Promise.resolve(''));
    expect(outcome).toMatchObject({ status: 'error', error: { type: 'invalid-payload' } });
  });

  it("reports the source's own failure, keeping a classified one", async () => {
    const onError = vi.fn();
    const m = createCopyMachine({ adapter: { write: () => Promise.resolve() }, onError });
    const network = new TypeError('Failed to fetch');
    const outcome = await m.copy(() => Promise.reject(network));
    expect(outcome).toMatchObject({ status: 'error', error: { type: 'invalid-payload', message: 'The copy source rejected.', cause: network } });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ type: 'invalid-payload' }), null);
    const big = await m.copy(() => Promise.reject(copyFailure('too-large', 'Too long.')));
    expect(big).toMatchObject({ status: 'error', error: { type: 'too-large' } });
  });

  it('gives the source the abort signal, and a reset while the server answers cancels the copy', async () => {
    const link = later<string>();
    const seen: CopySourceContext[] = [];
    const write = vi.fn(() => Promise.resolve());
    const m = createCopyMachine({ adapter: { write } });
    const outcome = m.copy((context) => {
      seen.push(context);
      return link.promise;
    });
    expect(seen[0]?.signal.aborted).toBe(false);
    m.reset();
    expect(seen[0]?.signal.aborted).toBe(true);
    link.resolve('too late');
    expect(await outcome).toEqual({ status: 'ignored', reason: 'cancelled' });
    expect(write).not.toHaveBeenCalled();
    expect(m.getSnapshot().status).toBe('idle');
  });

  it('never writes text that arrives after the copy was cancelled, whatever the adapter does', async () => {
    const link = later<string>();
    let deferred: Promise<string> | undefined;
    const adapter: ClipboardAdapter = {
      write: () => Promise.resolve(),
      writeDeferred: (text) => {
        deferred = text;
        return text.then(() => undefined);
      },
    };
    const m = createCopyMachine({ adapter });
    const outcome = m.copy(() => link.promise);
    m.reset();
    link.resolve('too late');
    // The text handed to the adapter rejects, so the platform write fails instead of writing.
    await expect(deferred).rejects.toMatchObject({ copyError: { type: 'aborted' } });
    expect(await outcome).toEqual({ status: 'ignored', reason: 'cancelled' });
  });

  it('a sync source gets the same context, and keeps working as before', async () => {
    const seen: unknown[] = [];
    const outcome = await createCopyMachine({ adapter: { write: () => Promise.resolve() } }).copy((context) => {
      seen.push(context.signal);
      return 'now';
    });
    expect(seen[0]).toBeInstanceOf(AbortSignal);
    expect(outcome).toMatchObject({ status: 'copied', payload: { kind: 'text', value: 'now' } });
  });

  it('waits for the text even when the adapter resolves first, and fails if it never comes', async () => {
    const lax: ClipboardAdapter = { write: () => Promise.resolve(), writeDeferred: () => Promise.resolve() };
    const m = createCopyMachine({ adapter: lax });
    const failed = await m.copy(() => Promise.reject(new Error('down')));
    expect(failed).toMatchObject({ status: 'error', error: { type: 'invalid-payload' } });
    const copied = await m.copy(() => Promise.resolve('fine'));
    expect(copied).toMatchObject({ status: 'copied' });
  });

  it('classifies an adapter that throws synchronously, without an unhandled rejection', async () => {
    const adapter: ClipboardAdapter = {
      write: () => Promise.resolve(),
      writeDeferred: () => {
        throw new DOMException('blocked', 'NotAllowedError');
      },
    };
    const outcome = await createCopyMachine({ adapter }).copy(() => Promise.reject(new Error('also down')));
    expect(outcome).toMatchObject({ status: 'error', error: { type: 'permission-denied' } });
  });

  it('can retry a failed write of text that did arrive, without asking the server again', async () => {
    const source = vi.fn(() => Promise.resolve('https://example.com/s/abc'));
    const write = vi
      .fn<(payload: CopyPayload) => Promise<void>>()
      .mockRejectedValueOnce(new DOMException('Document is not focused.', 'NotAllowedError'))
      .mockResolvedValue(undefined);
    const m = createCopyMachine({ adapter: { write } });
    expect(await m.copy(source)).toMatchObject({ status: 'error', error: { type: 'not-focused' } });
    expect(m.getSnapshot()).toMatchObject({ status: 'error', payload: { kind: 'text', value: 'https://example.com/s/abc' } });
    expect(await m.retry()).toMatchObject({ status: 'copied' });
    expect(source).toHaveBeenCalledTimes(1);
  });

  it('ignores a second click while the first async copy is still waiting', async () => {
    const link = later<string>();
    const m = createCopyMachine({ adapter: { write: () => Promise.resolve() } });
    const first = m.copy(() => link.promise);
    expect(await m.copy('second')).toEqual({ status: 'ignored', reason: 'in-flight' });
    link.resolve('first');
    expect(await first).toMatchObject({ status: 'copied', payload: { value: 'first' } });
  });
});

describe('an async copy source, in the browser adapter', () => {
  class Item {
    static supports = vi.fn((_type: string) => true);
    constructor(readonly record: Record<string, unknown>) {}
  }

  afterEach(() => {
    Item.supports.mockImplementation(() => true);
    Reflect.deleteProperty(document, 'execCommand');
  });

  const adapterFor = (env: ClipboardEnvironment | undefined) => createBrowserClipboardAdapter({ getEnvironment: () => env });

  it('hands ClipboardItem a promise of the text, so Safari keeps the gesture', async () => {
    const items: Item[] = [];
    const write = vi.fn(async (records: Item[]) => {
      items.push(...records);
      await Promise.all(Object.values(records[0]?.record ?? {}).map((value) => Promise.resolve(value)));
    });
    const link = later<string>();
    const done = adapterFor({ navigator: { clipboard: { write } }, ClipboardItem: Item }).writeDeferred?.(link.promise);
    expect(write).toHaveBeenCalledTimes(1); // before the text exists
    link.resolve('https://example.com/s/abc');
    await done;
    const blob = await (items[0]?.record['text/plain'] as Promise<Blob>);
    expect(await blob.text()).toBe('https://example.com/s/abc');
    expect(blob.type).toBe('text/plain');
  });

  it('waits for the text and writes it where there is no ClipboardItem, or it cannot take text', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    await adapterFor({ navigator: { clipboard: { writeText } } }).writeDeferred?.(Promise.resolve('a'));
    expect(writeText).toHaveBeenCalledWith('a');
    Item.supports.mockImplementation(() => false);
    const write = vi.fn(() => Promise.resolve());
    await adapterFor({ navigator: { clipboard: { writeText, write } }, ClipboardItem: Item }).writeDeferred?.(Promise.resolve('b'));
    expect(writeText).toHaveBeenLastCalledWith('b');
    expect(write).not.toHaveBeenCalled();
  });

  it('uses the copy command on plain HTTP, after the text arrives', async () => {
    const written = new Map<string, string>();
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: () => {
        const event = new Event('copy', { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'clipboardData', { value: { setData: (format: string, value: string) => written.set(format, value) } });
        document.body.dispatchEvent(event);
        return true;
      },
    });
    await adapterFor({ isSecureContext: false, document }).writeDeferred?.(Promise.resolve('over http'));
    expect(written.get('text/plain')).toBe('over http');
  });

  it("reports the source's failure rather than the browser's generic one", async () => {
    const write = vi.fn(async (records: Item[]) => {
      await Promise.all(Object.values(records[0]?.record ?? {}).map((value) => Promise.resolve(value)));
    });
    const reason = copyFailure('too-large', 'Too long.');
    await expect(adapterFor({ navigator: { clipboard: { write } }, ClipboardItem: Item }).writeDeferred?.(Promise.reject(reason))).rejects.toBe(reason);
  });

  it('falls back to the plain write when an embedded iframe refuses ClipboardItem', async () => {
    const write = vi.fn(() => Promise.reject(new DOMException('blocked by permissions policy', 'NotAllowedError')));
    const writeText = vi.fn(() => Promise.resolve());
    await adapterFor({ navigator: { clipboard: { write, writeText } }, ClipboardItem: Item }).writeDeferred?.(Promise.resolve('in the Teams tab'));
    expect(writeText).toHaveBeenCalledWith('in the Teams tab');
  });

  it("keeps the browser's error for anything else, and never reports text that failed to arrive", async () => {
    const dataError = new DOMException('bad', 'DataError');
    const failing = vi.fn(() => Promise.reject(dataError));
    await expect(adapterFor({ navigator: { clipboard: { write: failing } }, ClipboardItem: Item }).writeDeferred?.(Promise.resolve('x'))).rejects.toBe(dataError);
    // A lax browser that resolves the write without reading the text.
    const lax = vi.fn(() => Promise.resolve());
    const missing = new Error('never came');
    await expect(adapterFor({ navigator: { clipboard: { write: lax } }, ClipboardItem: Item }).writeDeferred?.(Promise.reject(missing))).rejects.toBe(missing);
    await flush();
  });

  it('says unsupported with no browser at all', async () => {
    await expect(adapterFor(undefined).writeDeferred?.(Promise.resolve('x'))).rejects.toMatchObject({ copyError: { type: 'unsupported' } });
  });
});
