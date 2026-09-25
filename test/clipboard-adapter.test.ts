import { describe, expect, it, vi } from 'vitest';
import {
  createBrowserClipboardAdapter,
  type ClipboardEnvironment,
  type ClipboardItemData,
  type ClipboardLike,
} from '../src/core';

class FakeClipboardItem {
  static supported = new Set(['text/plain', 'text/html', 'image/png']);
  static supports(type: string): boolean {
    return FakeClipboardItem.supported.has(type);
  }
  constructor(readonly items: Record<string, ClipboardItemData>) {}
}

/** A clipboard that behaves like Chromium: awaits item promises, then replaces failures with its own error. */
function createClipboard() {
  const written: FakeClipboardItem[][] = [];
  const clipboard = {
    writeText: vi.fn((_text: string) => Promise.resolve()),
    write: vi.fn(async (items: readonly unknown[]) => {
      const list = items as FakeClipboardItem[];
      try {
        for (const item of list) await Promise.all(Object.values(item.items).map((v) => Promise.resolve(v)));
      } catch {
        throw Object.assign(new Error('Generic browser failure.'), { name: 'NotAllowedError' });
      }
      written.push(list);
    }),
  } satisfies ClipboardLike;
  return { clipboard, written };
}

function adapterFor(env: ClipboardEnvironment | undefined, degradeHtmlToText?: boolean) {
  return createBrowserClipboardAdapter({
    getEnvironment: () => env,
    ...(degradeHtmlToText === undefined ? {} : { degradeHtmlToText }),
  });
}

const png = () => new Blob(['png'], { type: 'image/png' });

describe('createBrowserClipboardAdapter', () => {
  it('reports unsupported outside the browser', async () => {
    await expect(adapterFor(undefined).write({ kind: 'text', value: 'a' })).rejects.toMatchObject({
      copyError: { type: 'unsupported' },
    });
  });

  it('reports insecure contexts before trying', async () => {
    const { clipboard } = createClipboard();
    const env = { isSecureContext: false, navigator: { clipboard } };
    await expect(adapterFor(env).write({ kind: 'text', value: 'a' })).rejects.toMatchObject({
      copyError: { type: 'insecure-context' },
    });
    expect(clipboard.writeText).not.toHaveBeenCalled();
  });

  it('reports a missing Clipboard API', async () => {
    await expect(adapterFor({ navigator: {} }).write({ kind: 'text', value: 'a' })).rejects.toMatchObject({
      copyError: { type: 'unsupported' },
    });
  });

  it('writes text', async () => {
    const { clipboard } = createClipboard();
    await adapterFor({ navigator: { clipboard } }).write({ kind: 'text', value: 'hello' });
    expect(clipboard.writeText).toHaveBeenCalledWith('hello');
  });

  it('serialises JSON, optionally pretty', async () => {
    const { clipboard } = createClipboard();
    await adapterFor({ navigator: { clipboard } }).write({ kind: 'json', value: { a: 1 }, pretty: true });
    expect(clipboard.writeText).toHaveBeenCalledWith('{\n  "a": 1\n}');
  });

  it('classifies unserialisable JSON', async () => {
    const { clipboard } = createClipboard();
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    await expect(
      adapterFor({ navigator: { clipboard } }).write({ kind: 'json', value: circular }),
    ).rejects.toMatchObject({ copyError: { type: 'invalid-payload' } });
  });

  it('writes HTML with a plain-text fallback in the same item', async () => {
    const { clipboard, written } = createClipboard();
    await adapterFor({ navigator: { clipboard }, ClipboardItem: FakeClipboardItem }).write({
      kind: 'html',
      html: '<b>hi</b>',
      text: 'hi',
    });
    const item = written[0]?.[0];
    expect(Object.keys(item?.items ?? {}).sort()).toEqual(['text/html', 'text/plain']);
  });

  it('degrades HTML to plain text when rich copy is unavailable', async () => {
    const { clipboard } = createClipboard();
    await adapterFor({ navigator: { clipboard } }).write({ kind: 'html', html: '<b>hi</b>', text: 'hi' });
    expect(clipboard.writeText).toHaveBeenCalledWith('hi');
  });

  it('refuses to silently degrade HTML when asked not to', async () => {
    const { clipboard } = createClipboard();
    await expect(
      adapterFor({ navigator: { clipboard } }, false).write({ kind: 'html', html: '<b>hi</b>', text: 'hi' }),
    ).rejects.toMatchObject({ copyError: { type: 'unsupported-format' } });
  });

  it('invokes lazy image sources synchronously and passes a promise to ClipboardItem', async () => {
    const { clipboard, written } = createClipboard();
    const generate = vi.fn(() => Promise.resolve(png()));
    const write = adapterFor({ navigator: { clipboard }, ClipboardItem: FakeClipboardItem }).write({
      kind: 'image',
      blob: generate,
    });
    expect(generate).toHaveBeenCalledOnce();
    expect(clipboard.write).toHaveBeenCalledOnce(); // before any await resolved
    await write;
    const value = written[0]?.[0]?.items['image/png'];
    expect(value).toBeInstanceOf(Promise);
  });

  it('rejects non-PNG images with our classified error, not the browser generic one', async () => {
    const { clipboard } = createClipboard();
    await expect(
      adapterFor({ navigator: { clipboard }, ClipboardItem: FakeClipboardItem }).write({
        kind: 'image',
        blob: new Blob(['jpg'], { type: 'image/jpeg' }),
      }),
    ).rejects.toMatchObject({ copyError: { type: 'unsupported-format' } });
  });

  it('classifies a throwing image source', async () => {
    const { clipboard } = createClipboard();
    await expect(
      adapterFor({ navigator: { clipboard }, ClipboardItem: FakeClipboardItem }).write({
        kind: 'image',
        blob: () => {
          throw new Error('tainted canvas');
        },
      }),
    ).rejects.toMatchObject({ copyError: { type: 'blob-generation-failed' } });
  });

  it('refuses images when the browser says it cannot write PNG', async () => {
    const { clipboard } = createClipboard();
    class NoPng extends FakeClipboardItem {
      static override supports(type: string): boolean {
        return type !== 'image/png';
      }
    }
    await expect(
      adapterFor({ navigator: { clipboard }, ClipboardItem: NoPng }).write({ kind: 'image', blob: png() }),
    ).rejects.toMatchObject({ copyError: { type: 'unsupported-format' } });
  });

  it('refuses images without ClipboardItem', async () => {
    const { clipboard } = createClipboard();
    await expect(
      adapterFor({ navigator: { clipboard } }).write({ kind: 'image', blob: png() }),
    ).rejects.toMatchObject({ copyError: { type: 'unsupported-format' } });
  });

  it('writes multiple representations in one item', async () => {
    const { clipboard, written } = createClipboard();
    await adapterFor({ navigator: { clipboard }, ClipboardItem: FakeClipboardItem }).write({
      kind: 'multi',
      items: [
        { mimeType: 'text/plain', data: 'INV-1' },
        { mimeType: 'text/html', data: '<b>INV-1</b>' },
      ],
    });
    expect(Object.keys(written[0]?.[0]?.items ?? {})).toEqual(['text/plain', 'text/html']);
  });

  it('refuses multi items with types the browser cannot write', async () => {
    const { clipboard } = createClipboard();
    await expect(
      adapterFor({ navigator: { clipboard }, ClipboardItem: FakeClipboardItem }).write({
        kind: 'multi',
        items: [{ mimeType: 'application/x-custom', data: 'x' }],
      }),
    ).rejects.toMatchObject({ copyError: { type: 'unsupported-format' } });
  });
});
