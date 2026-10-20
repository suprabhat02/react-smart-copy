import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDefaultImageEnvironment, prepareImage, type EncodeTarget, type ImageEnvironment } from '../../src/image';
import { CopyFailure, createCopyError } from '../../src/core';
import { box, bytes, chunk, gif, FRAME, GCE, jpeg, png, segment, tiff, u32be, webp, VP8, COMMENT, appExtension } from './fixtures';

const typed = (type: string): unknown => expect.objectContaining({ copyError: expect.objectContaining({ type }) });
const file = (data: Uint8Array, name = 'photo.jpg', type = '') => new File([data as BlobPart], name, { type, lastModified: 42 });

/**
 * A fake platform: decodes to the stored size, and encodes to a file whose size
 * is width x height x bytesPerPixel(type, quality). The output starts with that
 * type's signature, so the result reads back as a real (empty) image.
 */
function fakeEnvironment(options: { width?: number; height?: number; perPixel?: (target: EncodeTarget) => number; size?: number; refuse?: string[]; decodeError?: Error; encodeError?: Error } = {}) {
  const encodes: EncodeTarget[] = [];
  const closed = vi.fn();
  const SIGNATURES: Record<string, Uint8Array> = {
    'image/png': bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    'image/jpeg': bytes([0xff, 0xd8, 0xff, 0xd9]),
    'image/webp': webp(VP8),
  };
  const environment: ImageEnvironment = {
    decode: (blob) => {
      if (options.decodeError !== undefined) return Promise.reject(options.decodeError);
      expect(blob).toBeInstanceOf(Blob);
      return Promise.resolve({ width: options.width ?? 1000, height: options.height ?? 800, source: 'bitmap', close: closed });
    },
    encode: (_image, target) => {
      if (options.encodeError !== undefined) return Promise.reject(options.encodeError);
      encodes.push(target);
      const type = options.refuse?.includes(target.type) === true ? 'image/png' : target.type;
      const perPixel = options.perPixel?.(target) ?? (target.type === 'image/png' ? 3 : target.quality * 2);
      // `size` fixes the output size without allocating it per pixel (a huge per-pixel size would allocate hundreds of MB).
      const size = options.size ?? Math.max(16, Math.round(target.width * target.height * perPixel));
      const head = SIGNATURES[type] as Uint8Array;
      const out = new Uint8Array(size);
      out.set(head.subarray(0, Math.min(head.length, size)));
      return Promise.resolve(new Blob([out as BlobPart], { type }));
    },
  };
  return { environment, encodes, closed };
}

const GPS_JPEG = jpeg({ exif: tiff({ orientation: 6, gps: true }), extra: [segment(0xfe, 'secret')] });
/** A 1000 x 800 JPEG with 1.5 MB of (placeholder) image data: bigger than the byte budgets below. */
const BIG_JPEG = bytes([0xff, 0xd8], segment(0xc0, [8, ...[3, 0x20], ...[3, 0xe8], 1, 1, 0x11, 0]), segment(0xda, [1, 1, 0, 0, 63, 0]), new Uint8Array(1_500_000), [0xff, 0xd9]);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('prepareImage: lossless when only the metadata has to go', () => {
  it('strips without decoding, reports what it removed and the displayed size', async () => {
    const { environment, encodes } = fakeEnvironment();
    const result = await prepareImage(file(GPS_JPEG), { environment });
    expect(encodes).toHaveLength(0);
    expect(result).toMatchObject({ type: 'image/jpeg', width: 30, height: 40, reencoded: false, resized: false, quality: null, removed: ['exif', 'gps', 'comment'] });
    expect(result.file).toMatchObject({ name: 'photo.jpg', lastModified: 42 });
    expect(result.original).toMatchObject({ size: GPS_JPEG.length, info: { orientation: 6 } });
  });

  it('keeps WebP dimensions as stored (browsers do not turn WebP by its Exif)', async () => {
    const result = await prepareImage(new Blob([webp(VP8) as BlobPart]));
    expect(result).toMatchObject({ type: 'image/webp', width: 40, height: 30, reencoded: false });
  });

  it('keeps an animation when it fits, and refuses one that has to shrink', async () => {
    const anim = gif(appExtension('NETSCAPE2.0'), COMMENT, GCE, FRAME, GCE, FRAME);
    const kept = await prepareImage(file(anim, 'a.gif'));
    expect(kept).toMatchObject({ type: 'image/gif', reencoded: false, removed: ['comment'] });
    await expect(prepareImage(file(anim, 'a.gif'), { maxWidth: 10 })).rejects.toEqual(typed('too-large'));
    await expect(prepareImage(file(anim, 'a.gif'), { maxBytes: 10 })).rejects.toEqual(typed('too-large'));
    await expect(prepareImage(file(anim, 'a.gif'), { animated: 'reject' })).rejects.toEqual(typed('unsupported-format'));
    const { environment } = fakeEnvironment({ width: 40, height: 30 });
    expect(await prepareImage(file(anim, 'a.gif'), { animated: 'first-frame', maxWidth: 20, environment })).toMatchObject({ type: 'image/png', reencoded: true, width: 20, file: { name: 'a.png' } });
  });

  it('keeps the colour profile unless told not to', async () => {
    const withIcc = png(chunk('iCCP', bytes('p\0\0', [0x78])), chunk('tEXt', 'a\0b'));
    expect((await prepareImage(file(withIcc, 'a.png'))).removed).toEqual(['text']);
    expect((await prepareImage(file(withIcc, 'a.png'), { keepColorProfile: false })).removed).toEqual(['text', 'icc']);
  });
});

describe('prepareImage: re-encoding', () => {
  it('resizes to maxWidth / maxHeight / maxPixels, never larger', async () => {
    const { environment, encodes, closed } = fakeEnvironment();
    const result = await prepareImage(file(BIG_JPEG), { maxWidth: 500, environment });
    expect(result).toMatchObject({ type: 'image/jpeg', width: 500, height: 400, reencoded: true, resized: true, quality: 0.85 });
    expect(encodes[0]).toMatchObject({ width: 500, height: 400, type: 'image/jpeg', background: '#fff' });
    expect(closed).toHaveBeenCalledOnce();
    expect((await prepareImage(file(BIG_JPEG), { maxHeight: 200, environment })).height).toBe(200);
    expect((await prepareImage(file(BIG_JPEG), { maxPixels: 20_000, environment })).width).toBe(158);
  });

  it('finds the highest quality under maxBytes, then the largest size', async () => {
    const { environment, encodes } = fakeEnvironment();
    // At 1000 x 800, quality q costs 1.6 MB x q: 1 MB fits at q ~ 0.62.
    const fits = await prepareImage(file(BIG_JPEG), { maxBytes: 1_000_000, environment });
    expect(fits.quality).toBeGreaterThanOrEqual(0.6);
    expect(fits.quality).toBeLessThanOrEqual(0.625);
    expect(fits).toMatchObject({ width: 1000, resized: false });
    expect(encodes.length).toBeLessThanOrEqual(6);
    // 0.4 MB does not fit at 0.5 even: the size goes down too.
    const smaller = await prepareImage(file(BIG_JPEG), { maxBytes: 400_000, environment });
    expect(smaller.width).toBeLessThan(1000);
    expect(smaller.size).toBeLessThanOrEqual(400_000);
  });

  it("'auto' keeps a PNG lossless when it fits, and moves to WebP, then JPEG, when it doesn't", async () => {
    const pngHeader = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], u32be(13), 'IHDR', u32be(1000), u32be(800), [8, 6, 0, 0, 0], u32be(0), chunk('IDAT', new Uint8Array(1_500_000)));
    const { environment } = fakeEnvironment();
    expect(await prepareImage(file(pngHeader, 'shot.png'), { maxWidth: 400, environment })).toMatchObject({ type: 'image/png', quality: null, file: { name: 'shot.png' } });
    expect(await prepareImage(file(pngHeader, 'shot.png'), { maxBytes: 1_000_000, environment })).toMatchObject({ type: 'image/webp', file: { name: 'shot.webp' } });
    const noWebp = fakeEnvironment({ refuse: ['image/webp'] });
    expect(await prepareImage(file(pngHeader, 'shot.png'), { maxBytes: 1_000_000, environment: noWebp.environment })).toMatchObject({ type: 'image/jpeg', file: { name: 'shot.jpg' } });
  });

  it('writes the requested type, and says when the browser cannot', async () => {
    const { environment } = fakeEnvironment();
    expect(await prepareImage(file(BIG_JPEG), { type: 'image/webp', environment })).toMatchObject({ type: 'image/webp', reencoded: true });
    expect(await prepareImage(file(BIG_JPEG), { type: 'image/png', maxBytes: 600_000, environment })).toMatchObject({ type: 'image/png', resized: true });
    const refusing = fakeEnvironment({ refuse: ['image/webp'] });
    await expect(prepareImage(file(BIG_JPEG), { type: 'image/webp', environment: refusing.environment })).rejects.toEqual(typed('unsupported-format'));
  });

  it('re-encodes formats it cannot strip: AVIF and HEIC become JPEG, a WebP stays WebP', async () => {
    const avif = bytes(box('ftyp', 'avif', [0, 0, 0, 0], 'avif'));
    const { environment } = fakeEnvironment({ width: 40, height: 30 });
    expect(await prepareImage(file(avif, 'pic.avif'), { environment })).toMatchObject({ type: 'image/jpeg', reencoded: true, resized: false, file: { name: 'pic.jpg' } });
    expect(await prepareImage(file(webp(VP8), 'w.webp'), { maxWidth: 20, environment })).toMatchObject({ type: 'image/webp' });
    const noWebp = fakeEnvironment({ width: 40, height: 30, refuse: ['image/webp'] });
    expect(await prepareImage(file(webp(VP8), 'w.webp'), { maxWidth: 20, environment: noWebp.environment })).toMatchObject({ type: 'image/jpeg' });
    // An image type this module can't read, but the browser can decode.
    expect(await prepareImage(new Blob(['tiff-bytes'], { type: 'image/tiff' }), { environment })).toMatchObject({ type: 'image/jpeg', file: expect.any(Blob) as unknown });
  });

  it('reports what the output still holds: an encoder may add a colour profile', async () => {
    const withIcc = jpeg({ extra: [segment(0xe2, bytes('ICC_PROFILE\0', [1, 1]))] });
    const { environment } = fakeEnvironment({ width: 40, height: 30 });
    expect((await prepareImage(file(withIcc), { maxWidth: 20, environment })).removed).toEqual(['icc']);
    const keepsIcc: ImageEnvironment = {
      decode: environment.decode,
      encode: () => Promise.resolve(new Blob([jpeg({ extra: [segment(0xe2, bytes('ICC_PROFILE\0', [1, 1]))] }) as BlobPart], { type: 'image/jpeg' })),
    };
    expect((await prepareImage(file(withIcc), { maxWidth: 20, environment: keepsIcc })).removed).toEqual([]);
  });

  it('gives up with too-large when nothing fits, within a bounded number of encodes', async () => {
    // Every encode is 101 bytes, whatever the size and quality: nothing ever fits 100.
    const { environment, encodes } = fakeEnvironment({ size: 101 });
    await expect(prepareImage(file(BIG_JPEG), { maxBytes: 100, environment })).rejects.toEqual(typed('too-large'));
    expect(encodes.length).toBeLessThanOrEqual(24);
    const none = fakeEnvironment({ refuse: ['image/jpeg'] });
    await expect(prepareImage(file(bytes(box('ftyp', 'heic', [0, 0, 0, 0], 'heic'))), { environment: none.environment })).rejects.toEqual(typed('too-large'));
  });
});

describe('prepareImage: guards and errors', () => {
  it('checks the header size before decoding, and the decoded size after', async () => {
    const { environment, encodes } = fakeEnvironment({ width: 5000, height: 5000 });
    const decode = vi.spyOn(environment, 'decode');
    await expect(prepareImage(file(BIG_JPEG), { maxInputPixels: 500_000, environment })).rejects.toEqual(typed('too-large'));
    expect(decode).not.toHaveBeenCalled();
    // AVIF without a size in its header: checked once decoded, and the bitmap is freed.
    const { environment: env2, closed } = fakeEnvironment({ width: 5000, height: 5000 });
    await expect(prepareImage(file(bytes(box('ftyp', 'avif', [0, 0, 0, 0], 'avif'))), { maxInputPixels: 1_000_000, environment: env2 })).rejects.toEqual(typed('too-large'));
    expect(closed).toHaveBeenCalledOnce();
    expect(encodes).toHaveLength(0);
  });

  it('refuses what is not an image, and turns decode and encode failures into typed errors', async () => {
    await expect(prepareImage(new Blob(['hello'], { type: 'text/plain' }))).rejects.toEqual(typed('unsupported-format'));
    const broken = fakeEnvironment({ decodeError: new DOMException('bad', 'InvalidStateError') });
    await expect(prepareImage(file(BIG_JPEG), { maxWidth: 10, environment: broken.environment })).rejects.toEqual(typed('unsupported-format'));
    const timeout = fakeEnvironment({ decodeError: new CopyFailure(createCopyError('timeout', 'slow')) });
    await expect(prepareImage(file(BIG_JPEG), { maxWidth: 10, environment: timeout.environment })).rejects.toEqual(typed('timeout'));
    const tainted = fakeEnvironment({ encodeError: new DOMException('tainted', 'SecurityError') });
    await expect(prepareImage(file(BIG_JPEG), { maxWidth: 10, environment: tainted.environment })).rejects.toEqual(typed('blob-generation-failed'));
    const typedEncode = fakeEnvironment({ encodeError: new CopyFailure(createCopyError('unsupported', 'no canvas')) });
    await expect(prepareImage(file(BIG_JPEG), { maxWidth: 10, environment: typedEncode.environment })).rejects.toEqual(typed('unsupported'));
  });

  it('needs a browser only to re-encode', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    expect(getDefaultImageEnvironment()).toBeNull();
    await expect(prepareImage(file(BIG_JPEG), { maxWidth: 10 })).rejects.toEqual(typed('unsupported'));
    expect((await prepareImage(file(GPS_JPEG))).reencoded).toBe(false);
  });

  it('is cancelled by its signal and bounded by timeoutMs', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(prepareImage(file(GPS_JPEG), { signal: controller.signal })).rejects.toEqual(typed('aborted'));
    const slow: ImageEnvironment = { decode: () => new Promise(() => undefined), encode: () => Promise.reject(new Error('unused')) };
    await expect(prepareImage(file(BIG_JPEG), { maxWidth: 10, timeoutMs: 20, environment: slow })).rejects.toEqual(typed('timeout'));
    // Aborted between encodes: the search stops.
    const later = new AbortController();
    const { environment } = fakeEnvironment({ size: 101 });
    const encode = environment.encode;
    const aborting: ImageEnvironment = {
      decode: environment.decode,
      encode: (image, target, signal) => {
        later.abort();
        return encode(image, target, signal);
      },
    };
    await expect(prepareImage(file(BIG_JPEG), { maxBytes: 100, environment: aborting, signal: later.signal })).rejects.toEqual(typed('aborted'));
  });

  it('passes on a failure the environment throws, even one made by another copy of the library', async () => {
    // Another entry point (say react-smart-copy/core) bundles its own CopyFailure class: the brand is shared, the class is not.
    const foreign = Object.assign(new Error('Decoder ran out of memory.'), {
      copyError: { type: 'too-large', message: 'Decoder ran out of memory.' },
      [Symbol.for('react-smart-copy.CopyFailure')]: true,
    });
    const { environment } = fakeEnvironment();
    const failing = (step: 'decode' | 'encode'): ImageEnvironment => ({
      decode: step === 'decode' ? () => Promise.reject(foreign) : environment.decode,
      encode: step === 'encode' ? () => Promise.reject(foreign) : environment.encode,
    });
    await expect(prepareImage(file(BIG_JPEG), { maxWidth: 10, environment: failing('decode') })).rejects.toBe(foreign);
    await expect(prepareImage(file(BIG_JPEG), { maxWidth: 10, environment: failing('encode') })).rejects.toBe(foreign);
  });

  it('returns a Blob for a Blob input', async () => {
    const { environment } = fakeEnvironment();
    const result = await prepareImage(new Blob([BIG_JPEG as BlobPart]), { maxWidth: 10, environment });
    expect(result.file).not.toBeInstanceOf(File);
    expect(result.file.type).toBe('image/jpeg');
    const named = await prepareImage(file(BIG_JPEG, 'noextension'), { maxWidth: 10, environment });
    expect(named.file).toMatchObject({ name: 'noextension.jpg' });
    const input = file(BIG_JPEG);
    vi.stubGlobal('File', undefined);
    expect((await prepareImage(input, { maxWidth: 10, environment })).file).not.toHaveProperty('name');
  });

  it('rejects invalid options with a typed error', async () => {
    const options = [
      { maxWidth: 0 },
      { maxBytes: 1.5 },
      { quality: 0 },
      { quality: 1.1 },
      { minQuality: 0.9, quality: 0.8 },
      { type: 'image/gif' },
      { animated: 'loop' },
      { keepColorProfile: 1 },
      { background: 1 },
      { timeoutMs: 0 },
      { timeoutMs: Number.NaN },
      { maxInputBytes: -1 },
    ];
    for (const option of options) await expect(prepareImage(file(GPS_JPEG), option as never)).rejects.toEqual(typed('invalid-payload'));
    expect((await prepareImage(file(GPS_JPEG), { timeoutMs: Infinity, maxBytes: Infinity })).reencoded).toBe(false);
  });
});

describe('getDefaultImageEnvironment', () => {
  function fakeContext() {
    return { drawImage: vi.fn(), fillRect: vi.fn(), fillStyle: '', imageSmoothingEnabled: false, imageSmoothingQuality: 'low' };
  }

  it('decodes with createImageBitmap (upright) and encodes on an OffscreenCanvas, halving big reductions', async () => {
    const close = vi.fn();
    const createImageBitmap = vi.fn(() => Promise.resolve({ width: 1000, height: 800, close }));
    const contexts: ReturnType<typeof fakeContext>[] = [];
    class FakeOffscreenCanvas {
      constructor(
        public width: number,
        public height: number,
      ) {}
      getContext() {
        const context = fakeContext();
        contexts.push(context);
        return context;
      }
      convertToBlob(options: { type: string; quality: number }) {
        return Promise.resolve(new Blob(['x'], { type: options.type }));
      }
    }
    vi.stubGlobal('createImageBitmap', createImageBitmap);
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
    const environment = getDefaultImageEnvironment() as ImageEnvironment;
    const image = await environment.decode(new Blob(['x']), new AbortController().signal);
    expect(createImageBitmap).toHaveBeenCalledWith(expect.any(Blob), { imageOrientation: 'from-image' });
    expect(image).toMatchObject({ width: 1000, height: 800 });
    const blob = await environment.encode(image, { width: 200, height: 160, type: 'image/jpeg', quality: 0.8, background: '#fff' }, new AbortController().signal);
    expect(blob.type).toBe('image/jpeg');
    // 1000 -> 500 -> 250 by halving, then 200 on the final canvas, which is filled first.
    expect(contexts).toHaveLength(3);
    expect(contexts[2]?.fillRect).toHaveBeenCalledWith(0, 0, 200, 160);
    expect(contexts.every((context) => context.imageSmoothingQuality === 'high')).toBe(true);
    image.close();
    expect(close).toHaveBeenCalledOnce();
  });

  it('falls back to a DOM canvas, and reports a canvas without 2D or without output', async () => {
    vi.stubGlobal('createImageBitmap', () => Promise.resolve({ width: 10, height: 10, close: () => undefined }));
    vi.stubGlobal('OffscreenCanvas', undefined);
    const canvas = document.createElement('canvas');
    const context = fakeContext();
    vi.spyOn(canvas, 'getContext').mockReturnValue(context as never);
    let output: Blob | null = new Blob(['x'], { type: 'image/png' });
    vi.spyOn(canvas, 'toBlob').mockImplementation((callback) => {
      callback(output);
    });
    vi.spyOn(document, 'createElement').mockReturnValue(canvas);
    const environment = getDefaultImageEnvironment() as ImageEnvironment;
    const image = await environment.decode(new Blob(['x']), new AbortController().signal);
    const target = { width: 10, height: 10, type: 'image/png' as const, quality: 1, background: null };
    expect((await environment.encode(image, target, new AbortController().signal)).type).toBe('image/png');
    expect(context.fillRect).not.toHaveBeenCalled();
    output = null;
    await expect(environment.encode(image, target, new AbortController().signal)).rejects.toEqual(typed('blob-generation-failed'));
    vi.spyOn(canvas, 'getContext').mockReturnValue(null);
    expect(() => environment.encode(image, target, new AbortController().signal)).toThrow(CopyFailure);
  });

  it('is null without a canvas of any kind', () => {
    vi.stubGlobal('createImageBitmap', () => Promise.resolve({}));
    vi.stubGlobal('OffscreenCanvas', undefined);
    vi.stubGlobal('document', undefined);
    expect(getDefaultImageEnvironment()).toBeNull();
  });
});
