import { describe, expect, it } from 'vitest';
import { isCopyFailure } from '../src/core/errors';
import {
  DEFAULT_PASTE_MAX_BYTES,
  DEFAULT_PASTE_MAX_ITEMS,
  collectClipboardItems,
  enforcePasteLimits,
  finalizePaste,
  isAccepted,
  resolvePasteReadOptions,
  snapshotDataTransfer,
  utf8ByteLength,
  type PasteAccept,
  type PasteEntry,
} from '../src/core/paste-reader';
import { fakeClipboardItem, fakeDataTransfer, jpegBlob, pngBlob, pngFile } from './fixtures';

const failureType = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (error) {
    return isCopyFailure(error) ? error.copyError.type : 'not-a-copy-failure';
  }
  return undefined;
};

const asyncFailureType = async (promise: Promise<unknown>): Promise<string | undefined> => {
  try {
    await promise;
  } catch (error) {
    return isCopyFailure(error) ? error.copyError.type : 'not-a-copy-failure';
  }
  return undefined;
};

describe('resolvePasteReadOptions', () => {
  it('defaults to plain text only with safe limits', () => {
    expect(resolvePasteReadOptions()).toEqual({
      accept: ['text/plain'],
      maxBytes: DEFAULT_PASTE_MAX_BYTES,
      maxItems: DEFAULT_PASTE_MAX_ITEMS,
    });
  });

  it('expands shorthands, normalises MIME types and wildcards, and de-duplicates', () => {
    const { accept } = resolvePasteReadOptions({
      accept: ['text', 'html', 'image', 'any', 'IMAGE/PNG', 'Text/*', '*/*', 'text/plain'],
    });
    expect(accept).toEqual(['text/plain', 'text/html', 'image/*', '*/*', 'image/png', 'text/*']);
  });

  const invalidAccepts: ReadonlyArray<readonly unknown[]> = [[], ['nope'], ['bad type/*'], [42]];
  it.each(invalidAccepts.map((accept) => [accept]))('rejects invalid accept %j', (accept) => {
    expect(failureType(() => resolvePasteReadOptions({ accept: accept as PasteAccept[] }))).toBe('invalid-payload');
  });

  it('accepts Infinity and positive integers as limits, rejects the rest', () => {
    expect(resolvePasteReadOptions({ maxBytes: Infinity, maxItems: 3 })).toMatchObject({ maxBytes: Infinity, maxItems: 3 });
    for (const bad of [0, -1, 1.5, NaN]) {
      expect(failureType(() => resolvePasteReadOptions({ maxBytes: bad }))).toBe('invalid-payload');
      expect(failureType(() => resolvePasteReadOptions({ maxItems: bad }))).toBe('invalid-payload');
    }
  });

  it('isAccepted checks against the resolved patterns', () => {
    const options = resolvePasteReadOptions({ accept: ['image'] });
    expect(isAccepted('image/png', options)).toBe(true);
    expect(isAccepted('text/plain', options)).toBe(false);
  });
});

describe('snapshotDataTransfer', () => {
  it('keeps accepted textual types and files, skipping everything else', () => {
    const file = pngFile();
    const pdf = new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' });
    const data = fakeDataTransfer(
      { 'text/plain': 'hello', 'text/html': '<b>hi</b>', 'text/rtf': '{\\rtf}', 'image/png': '', weird: 'x' },
      [file, pdf],
    );
    const entries = snapshotDataTransfer(data, resolvePasteReadOptions({ accept: ['text', 'html', 'image'] }));
    expect(entries).toEqual([
      { type: 'text/plain', data: 'hello', file: false },
      { type: 'text/html', data: '<b>hi</b>', file: false },
      { type: 'image/png', data: file, file: true },
    ]);
  });

  it('de-duplicates types that normalise to the same MIME type and skips empty strings', () => {
    const data = { types: ['text/plain', 'TEXT/PLAIN;charset=utf-8', 'text/html'], getData: (f: string) => (f === 'text/html' ? '' : 'a') };
    expect(snapshotDataTransfer(data, resolvePasteReadOptions({ accept: ['text', 'html'] }))).toEqual([
      { type: 'text/plain', data: 'a', file: false },
    ]);
  });

  it('types untyped files as application/octet-stream and tolerates a missing files list', () => {
    const blob = new File(['?'], 'mystery');
    const entries = snapshotDataTransfer(fakeDataTransfer({}, [blob]), resolvePasteReadOptions({ accept: ['any'] }));
    expect(entries).toEqual([{ type: 'application/octet-stream', data: blob, file: true }]);
    expect(snapshotDataTransfer({ types: [], getData: () => '', files: null }, resolvePasteReadOptions())).toEqual([]);
    expect(snapshotDataTransfer({ types: [], getData: () => '' }, resolvePasteReadOptions())).toEqual([]);
  });
});

describe('utf8ByteLength', () => {
  it.each([
    ['', 0],
    ['abc', 3],
    ['é', 2],
    ['日本', 6],
    ['😀', 4],
    ['a😀b', 6],
    ['\uD83D', 3],
    ['\uDE00', 3],
    ['\uD83Dx', 4],
    ['\uD83D\uD83D', 6],
  ])('measures %j as %i bytes, like TextEncoder', (text, bytes) => {
    expect(utf8ByteLength(text)).toBe(bytes);
    expect(utf8ByteLength(text)).toBe(new TextEncoder().encode(text).length);
  });
});

describe('enforcePasteLimits', () => {
  const entry = (data: string | Blob): PasteEntry => ({ type: 'text/plain', data, file: false });

  it('passes within limits', () => {
    expect(() => {
      enforcePasteLimits([entry('abc'), entry(new Blob(['de']))], resolvePasteReadOptions({ maxBytes: 5, maxItems: 2 }));
    }).not.toThrow();
  });

  it('throws too-large past maxBytes or maxItems', () => {
    expect(
      failureType(() => {
        enforcePasteLimits([entry('abcdef')], resolvePasteReadOptions({ maxBytes: 5 }));
      }),
    ).toBe('too-large');
    expect(
      failureType(() => {
        enforcePasteLimits([entry('a'), entry('b')], resolvePasteReadOptions({ maxItems: 1 }));
      }),
    ).toBe('too-large');
  });

  it('counts strings in UTF-8 bytes, the same unit as Blob.size', () => {
    // '日本' is 2 UTF-16 code units but 6 UTF-8 bytes; the Blob of it is 6 bytes too.
    const limits = resolvePasteReadOptions({ maxBytes: 5 });
    expect(new Blob(['日本']).size).toBe(6);
    expect(
      failureType(() => {
        enforcePasteLimits([entry('日本')], limits);
      }),
    ).toBe('too-large');
    expect(
      failureType(() => {
        enforcePasteLimits([entry(new Blob(['日本']))], limits);
      }),
    ).toBe('too-large');
    expect(() => {
      enforcePasteLimits([entry('日本')], resolvePasteReadOptions({ maxBytes: 6 }));
    }).not.toThrow();
  });
});

describe('collectClipboardItems', () => {
  it('decodes textual types, keeps binary blobs, and skips types that fail, are empty or unaccepted', async () => {
    const png = pngBlob();
    const items = [
      fakeClipboardItem({ 'text/plain': 'hello', 'text/html': '<i>x</i>', 'image/png': png, 'text/rtf': 'r' }, ['web custom']),
      fakeClipboardItem({ 'text/plain': 'duplicate', 'image/gif': new Blob([]) }, ['image/jpeg']),
    ];
    const entries = await collectClipboardItems(items, resolvePasteReadOptions({ accept: ['text', 'html', 'image', 'web/custom'] }));
    expect(entries).toEqual([
      { type: 'text/plain', data: 'hello', file: false },
      { type: 'text/html', data: '<i>x</i>', file: false },
      { type: 'image/png', data: png, file: false },
    ]);
  });

  it('enforces limits before decoding', async () => {
    const items = [fakeClipboardItem({ 'text/plain': 'too long' })];
    expect(await asyncFailureType(collectClipboardItems(items, resolvePasteReadOptions({ maxBytes: 3 })))).toBe('too-large');
  });
});

describe('finalizePaste', () => {
  const options = resolvePasteReadOptions({ accept: ['text', 'html', 'image', 'application/pdf'] });

  it('builds text/html/images/files views', async () => {
    const png = pngBlob();
    const file = pngFile();
    const pdf = new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' });
    const result = await finalizePaste(
      [
        { type: 'text/plain', data: 'plain', file: false },
        { type: 'text/html', data: '<b>x</b>', file: false },
        { type: 'image/png', data: png, file: false },
        { type: 'image/png', data: file, file: true },
        { type: 'application/pdf', data: pdf, file: true },
      ],
      'event',
      options,
    );
    expect(result.source).toBe('event');
    expect(result.text).toBe('plain');
    expect(result.html).toBe('<b>x</b>');
    expect(result.images).toEqual([png, file]);
    expect(result.files).toEqual([file, pdf]);
    expect(result.items).toHaveLength(5);
  });

  it('re-types images whose bytes disagree with their claimed type, for blobs and files', async () => {
    const blob = jpegBlob('image/png');
    const file = new File([await jpegBlob().arrayBuffer()], 'x.png', { type: 'image/png', lastModified: 42 });
    const result = await finalizePaste(
      [
        { type: 'image/png', data: blob, file: false },
        { type: 'image/png', data: file, file: true },
      ],
      'clipboard',
      options,
    );
    expect(result.images.map((image) => image.type)).toEqual(['image/jpeg', 'image/jpeg']);
    const [retypedFile] = result.files;
    expect(retypedFile).toBeInstanceOf(File);
    expect(retypedFile?.name).toBe('x.png');
    expect(retypedFile?.lastModified).toBe(42);
  });

  it('drops fake images and images whose real format is not accepted', async () => {
    const onlyPng = resolvePasteReadOptions({ accept: ['image/png', 'text'] });
    const result = await finalizePaste(
      [
        { type: 'image/png', data: new Blob(['<html>'], { type: 'image/png' }), file: false },
        { type: 'image/png', data: jpegBlob('image/png'), file: false },
        { type: 'text/plain', data: 'kept', file: false },
      ],
      'clipboard',
      onlyPng,
    );
    expect(result.items).toEqual([{ type: 'text/plain', data: 'kept' }]);
    expect(result.images).toEqual([]);
  });

  it('keeps other textual types as strings without setting text/html', async () => {
    const svg = resolvePasteReadOptions({ accept: ['image/svg+xml'] });
    const result = await finalizePaste([{ type: 'image/svg+xml', data: '<svg/>', file: false }], 'event', svg);
    expect(result).toMatchObject({ text: null, html: null, images: [], items: [{ type: 'image/svg+xml', data: '<svg/>' }] });
  });

  it('throws no-content when nothing survives', async () => {
    expect(await asyncFailureType(finalizePaste([], 'clipboard', options))).toBe('no-content');
  });
});
