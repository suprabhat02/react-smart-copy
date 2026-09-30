import { afterEach, describe, expect, it, vi } from 'vitest';
import { isCopyFailure } from '../src/core/errors';
import { createBrowserPasteAdapter, type PasteClipboardLike, type PasteEnvironment } from '../src/core/paste-adapter';
import { resolvePasteReadOptions, type PasteReadOptions } from '../src/core/paste-reader';
import { fakeClipboardItem, pngBlob } from './fixtures';

const readWith = (env: PasteEnvironment | undefined, options: PasteReadOptions = {}) =>
  createBrowserPasteAdapter({ getEnvironment: () => env }).read(resolvePasteReadOptions(options));

const envWith = (clipboard: PasteClipboardLike | undefined): PasteEnvironment => ({
  isSecureContext: true,
  navigator: { clipboard },
});

const failureType = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
  } catch (error) {
    return isCopyFailure(error) ? error.copyError.type : 'not-a-copy-failure';
  }
  return 'resolved';
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createBrowserPasteAdapter — environment checks', () => {
  it('rejects without a browser, in an insecure context, or without navigator.clipboard', async () => {
    expect(await failureType(readWith(undefined))).toBe('unsupported');
    expect(await failureType(readWith({ isSecureContext: false }))).toBe('insecure-context');
    expect(await failureType(readWith({ navigator: {} }))).toBe('unsupported');
  });

  it('reports unsupported when neither read() nor readText() exist', async () => {
    expect(await failureType(readWith(envWith({})))).toBe('unsupported');
  });

  it('reports unsupported-format when only readText() exists but text is not accepted', async () => {
    const readText = vi.fn(() => Promise.resolve('x'));
    expect(await failureType(readWith(envWith({ readText }), { accept: ['image'] }))).toBe('unsupported-format');
    expect(readText).not.toHaveBeenCalled();
  });

  it('uses window by default', async () => {
    const readText = vi.fn(() => Promise.resolve('from window'));
    vi.stubGlobal('isSecureContext', true);
    Object.defineProperty(navigator, 'clipboard', { value: { readText }, configurable: true });
    const result = await createBrowserPasteAdapter().read(resolvePasteReadOptions());
    expect(result.text).toBe('from window');
    Reflect.deleteProperty(navigator, 'clipboard');
  });
});

describe('createBrowserPasteAdapter — plain text', () => {
  it('prefers readText() for plain-text-only reads, even when read() exists', async () => {
    const read = vi.fn();
    const readText = vi.fn(() => Promise.resolve('hello'));
    const result = await readWith(envWith({ read, readText }));
    expect(result).toMatchObject({ source: 'clipboard', text: 'hello', items: [{ type: 'text/plain', data: 'hello' }] });
    expect(read).not.toHaveBeenCalled();
  });

  it('falls back to readText() when read() is missing and text is accepted', async () => {
    const readText = vi.fn(() => Promise.resolve('fallback'));
    const result = await readWith(envWith({ readText }), { accept: ['text', 'image'] });
    expect(result.text).toBe('fallback');
  });

  it('classifies readText() rejections as read errors', async () => {
    const readText = () => Promise.reject(Object.assign(new Error('Read permission denied.'), { name: 'NotAllowedError' }));
    const promise = readWith(envWith({ readText }));
    await expect(promise).rejects.toMatchObject({
      copyError: { type: 'permission-denied', message: 'Clipboard read permission was denied.' },
    });
  });

  it('turns an empty clipboard into no-content and enforces limits', async () => {
    expect(await failureType(readWith(envWith({ readText: () => Promise.resolve('') })))).toBe('no-content');
    expect(await failureType(readWith(envWith({ readText: () => Promise.resolve('12345') }), { maxBytes: 4 }))).toBe(
      'too-large',
    );
  });

  it('calls readText() synchronously (inside the user gesture) and bound to the clipboard', () => {
    const clipboard = {
      calledWith: null as unknown,
      readText(this: unknown) {
        clipboard.calledWith = this;
        return Promise.resolve('x');
      },
    };
    void readWith(envWith(clipboard));
    expect(clipboard.calledWith).toBe(clipboard);
  });
});

describe('createBrowserPasteAdapter — rich read()', () => {
  it('reads images and text through read() when non-text types are accepted', async () => {
    const png = pngBlob();
    const read = vi.fn(() => Promise.resolve([fakeClipboardItem({ 'text/plain': 'caption', 'image/png': png })]));
    const result = await readWith(envWith({ read, readText: vi.fn() }), { accept: ['text', 'image'] });
    expect(result.text).toBe('caption');
    expect(result.images).toEqual([png]);
    expect(result.files).toEqual([]);
  });

  it('uses read() for plain text when readText() is missing', async () => {
    const read = () => Promise.resolve([fakeClipboardItem({ 'text/plain': 'rich-only' })]);
    expect((await readWith(envWith({ read }))).text).toBe('rich-only');
  });

  it('classifies read() rejections', async () => {
    const read = () => Promise.reject(Object.assign(new Error('Document is not focused.'), { name: 'NotAllowedError' }));
    await expect(readWith(envWith({ read }), { accept: ['image'] })).rejects.toMatchObject({
      copyError: { type: 'not-focused' },
    });
  });

  it('reports no-content when nothing accepted is on the clipboard', async () => {
    const read = () => Promise.resolve([fakeClipboardItem({ 'text/plain': 'only text' })]);
    expect(await failureType(readWith(envWith({ read }), { accept: ['image'] }))).toBe('no-content');
  });
});
