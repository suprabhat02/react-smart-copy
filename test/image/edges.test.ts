import { describe, expect, it } from 'vitest';
import { prepareImage, readImageInfo, stripMetadata, type ImageEnvironment } from '../../src/image';
import { Bytes } from '../../src/image/bytes';
import { readTiff } from '../../src/image/exif';
import { VP8, box, bytes, chunk, fullBox, infe, ispe, jpeg, png, riff, segment, tiff, u32be, vp8x, webp } from './fixtures';

const blob = (data: Uint8Array) => new Blob([data as BlobPart]);
const info = (data: Uint8Array) => readImageInfo(blob(data));
const ftyp = (brand: string) => box('ftyp', brand, [0, 0, 0, 0], brand);
const heic = (...meta: Uint8Array[]) => bytes(ftyp('heic'), fullBox('meta', 0, ...meta));

describe('edge cases: AVIF and HEIC structure', () => {
  it('survives empty and truncated boxes', async () => {
    expect(await info(bytes(ftyp('heic'), u32be(1), 'meta', u32be(0)))).toMatchObject({ format: 'heic', width: null });
    expect(await info(bytes(ftyp('heic'), box('iinf')))).toMatchObject({ metadata: [] });
    expect((await info(heic(box('iinf')))).metadata).toEqual([]);
    expect((await info(heic(fullBox('iinf', 0, [0, 1], box('free', [1]), box('infe'))))).metadata).toEqual([]);
    const items = fullBox('iinf', 0, [0, 1], infe(1, 'Exif'));
    expect((await info(heic(items, box('iloc')))).metadata).toEqual(['exif']);
    // A version-1 iloc cut off after the item id, and one cut off before its extent count.
    expect((await info(heic(items, fullBox('iloc', 1, [0x44, 0x00], [0, 1], [0, 1])))).metadata).toEqual(['exif']);
    expect((await info(heic(items, fullBox('iloc', 0, [0x44, 0x00], [0, 1], [0, 1], [0, 0])))).metadata).toEqual(['exif']);
    expect(await info(heic(box('iprp', box('ipco', box('ispe', [0, 0, 0, 0]), box('colr')))))).toMatchObject({ width: null, height: null, metadata: ['icc'] });
    expect((await info(bytes(u32be(8), 'ftyp'))).format).toBeNull();
  });

  it('reads an Exif item without a location or thumbnail', async () => {
    const payload = bytes(u32be(0), tiff({ orientation: 1 }));
    const items = fullBox('iinf', 0, [0, 1], infe(1, 'Exif'));
    const build = (offset: number) => heic(items, fullBox('iloc', 0, [0x44, 0x00], [0, 1], [0, 1], [0, 0], [0, 1], u32be(offset), u32be(payload.length)));
    const data = bytes(build(build(0).length), payload);
    expect((await info(data)).metadata).toEqual(['exif']);
    expect((await info(bytes(ftyp('avif'), fullBox('meta', 0, box('iprp', box('ipco', ispe(5, 5))))))).width).toBe(5);
    // The primary image is the largest, whichever comes first.
    expect((await info(bytes(ftyp('avif'), fullBox('meta', 0, box('iprp', box('ipco', ispe(100, 80), ispe(10, 8))))))).width).toBe(100);
  });
});

describe('edge cases: other formats', () => {
  it('reads a thumbnail stored as strips', () => {
    const data = tiff({ thumbnail: 'strips' });
    expect(readTiff(new Bytes(data), 0, data.length)?.thumbnail).toBe(true);
  });

  it('reads a GIF header too short for its flags, and an APP1 that is neither Exif nor XMP', async () => {
    expect(await info(bytes('GIF89a', [1, 0, 1, 0]))).toMatchObject({ format: 'gif', width: 1, height: 1 });
    // An image descriptor cut off before its flags.
    expect(await info(bytes('GIF89a', [1, 0, 1, 0, 0, 0, 0], [0x2c, 0, 0, 0]))).toMatchObject({ format: 'gif', animated: false });
    // An application extension cut off inside its identifier.
    expect(await info(bytes('GIF89a', [1, 0, 1, 0, 0, 0, 0], [0x21, 0xff, 11], 'NET'))).toMatchObject({ format: 'gif', metadata: [] });
    expect((await info(jpeg({ extra: [segment(0xe1, 'vendor data')] }))).metadata).toEqual(['other']);
  });

  it('keeps the name of a named Blob without a date', async () => {
    const named = Object.assign(blob(png(chunk('tEXt', 'a\0b'))), { name: 'shot.png' });
    const { blob: out } = await stripMetadata(named);
    expect(out).toMatchObject({ name: 'shot.png' });
    expect((out as File).lastModified).toBeGreaterThan(0);
  });
});

describe('edge cases: prepareImage', () => {
  it('reports displayed sizes: JPEG and PNG turn by their orientation, WebP does not', async () => {
    const turnedPng = png(chunk('eXIf', tiff({ orientation: 8, gps: true })));
    expect(await prepareImage(blob(turnedPng))).toMatchObject({ width: 30, height: 40, reencoded: false });
    const turnedWebp = webp(vp8x(0x08), VP8, riff('EXIF', tiff({ orientation: 6, gps: true })));
    expect(await prepareImage(blob(turnedWebp))).toMatchObject({ width: 40, height: 30, reencoded: false });
  });

  it('stops at the encode budget, and names a named Blob without a date', async () => {
    let encodes = 0;
    const environment: ImageEnvironment = {
      decode: () => Promise.resolve({ width: 100, height: 100, source: null, close: () => undefined }),
      encode: (_image, target) => {
        encodes += 1;
        return Promise.resolve(new Blob([new Uint8Array(1_000_000) as BlobPart], { type: target.type }));
      },
    };
    const header = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], u32be(13), 'IHDR', u32be(100), u32be(100), [8, 6, 0, 0, 0], u32be(0), chunk('IDAT', new Uint8Array(200)));
    await expect(prepareImage(blob(header), { maxBytes: 100, environment })).rejects.toEqual(expect.objectContaining({ copyError: expect.objectContaining({ type: 'too-large' }) }));
    expect(encodes).toBe(24);

    // A budget that runs out inside the quality search still returns the best fit found.
    let calls = 0;
    const tight: ImageEnvironment = {
      decode: environment.decode,
      encode: (_image, target) => {
        calls += 1;
        const size = calls <= 22 ? 1_000_000 : Math.round(target.quality * 1000);
        return Promise.resolve(new Blob([new Uint8Array(size) as BlobPart], { type: target.type }));
      },
    };
    const named = Object.assign(blob(bytes(header, chunk('IDAT', new Uint8Array(2000)))), { name: 'shot.png' });
    const result = await prepareImage(named, { maxBytes: 700, environment: tight });
    expect(result).toMatchObject({ type: 'image/jpeg', file: { name: 'shot.jpg' } });
    expect(calls).toBe(24);
  });
});
