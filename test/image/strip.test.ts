import { describe, expect, it } from 'vitest';
import { readImageInfo, stripMetadata } from '../../src/image';
import { Bytes } from '../../src/image/bytes';
import { crc32 } from '../../src/image/png';
import {
  COMMENT,
  FRAME,
  GCE,
  IDAT,
  IEND,
  IHDR,
  PNG_SIGNATURE,
  VP8,
  VP8L,
  appExtension,
  bytes,
  chunk,
  gif,
  jpeg,
  png,
  riff,
  segment,
  tiff,
  vp8x,
  webp,
} from './fixtures';

const blob = (data: Uint8Array, type = '') => new Blob([data as BlobPart], { type });
const read = async (value: Blob) => new Uint8Array(await value.arrayBuffer());

/** Strips, checks the result reads back clean, and that stripping again changes nothing. */
async function strip(data: Uint8Array, options?: Parameters<typeof stripMetadata>[1]) {
  const result = await stripMetadata(blob(data), options);
  const after = await readImageInfo(result.blob);
  const again = await stripMetadata(result.blob, options);
  expect(again.removed).toEqual([]);
  expect(again.blob).toBe(result.blob);
  return { ...result, after, out: await read(result.blob) };
}

const EVERYTHING_JPEG = jpeg({
  jfifThumbnail: true,
  exif: tiff({ orientation: 6, gps: true, thumbnail: true }),
  extra: [
    segment(0xe1, bytes('http://ns.adobe.com/xap/1.0/\0', '<x/>')),
    segment(0xe2, bytes('ICC_PROFILE\0', [1, 1], 'icc')),
    segment(0xe2, bytes('MPF\0', 'MM')),
    segment(0xeb, 'c2pa'),
    segment(0xed, 'Photoshop 3.0\0'),
    segment(0xee, bytes('Adobe', [0, 100, 0, 0, 0, 0, 1])),
    segment(0xfe, 'comment'),
  ],
  trailing: bytes('motion-photo-video'),
});

describe('stripMetadata: JPEG', () => {
  it('removes everything but the picture, the colour profile and the orientation', async () => {
    const { removed, after, out, info } = await strip(EVERYTHING_JPEG);
    expect(info.metadata).toEqual(['exif', 'gps', 'thumbnail', 'xmp', 'iptc', 'comment', 'icc', 'other']);
    expect(removed).toEqual(['exif', 'gps', 'thumbnail', 'xmp', 'iptc', 'comment', 'other']);
    // A 26-byte Exif block remains with only the orientation: not metadata.
    expect(after).toMatchObject({ width: 40, height: 30, orientation: 6, metadata: ['icc'] });
    expect(out.length).toBeLessThan(EVERYTHING_JPEG.length);
    // The Adobe segment (needed to decode CMYK) is kept, and the file ends at EOI.
    expect(new Bytes(out).ascii(0, out.length)).toContain('Adobe');
    expect(Array.from(out.subarray(-2))).toEqual([0xff, 0xd9]);
  });

  it('removes the colour profile and orientation when asked', async () => {
    const { removed, after } = await strip(EVERYTHING_JPEG, { keepColorProfile: false, keepOrientation: false });
    expect(removed).toContain('icc');
    expect(after).toMatchObject({ orientation: 1, metadata: [] });
  });

  it('puts the orientation right after SOI when there is no JFIF segment', async () => {
    const { out, after } = await strip(jpeg({ jfif: false, exif: tiff({ orientation: 3, gps: true }) }));
    expect(Array.from(out.subarray(0, 4))).toEqual([0xff, 0xd8, 0xff, 0xe1]);
    expect(after.orientation).toBe(3);
  });

  it('keeps a short JFIF segment as it is', async () => {
    const short = bytes([0xff, 0xd8], segment(0xe0, 'JFIF\0'), segment(0xfe, 'x'), segment(0xc0, [8, 0, 1, 0, 1, 1, 1, 0x11, 0]), [0xff, 0xd9]);
    const { out } = await strip(short);
    expect(new Bytes(out).ascii(4, 7)).toBe('\0\u0007JFIF\0');
  });

  it('an orientation-only Exif block is kept as it is, or removed when asked', async () => {
    const { blob: stripped } = await stripMetadata(blob(jpeg({ exif: tiff({ orientation: 6, gps: true }) })));
    const kept = await stripMetadata(stripped);
    expect(kept).toMatchObject({ removed: [], info: { orientation: 6, metadata: [] } });
    expect(kept.blob).toBe(stripped);
    const dropped = await stripMetadata(stripped, { keepOrientation: false });
    expect(dropped.removed).toEqual(['exif']);
    expect(await readImageInfo(dropped.blob)).toMatchObject({ orientation: 1, metadata: [] });
  });

  it('returns the same Blob when there is nothing to remove', async () => {
    const clean = blob(jpeg());
    const result = await stripMetadata(clean);
    expect(result.blob).toBe(clean);
    expect(result.removed).toEqual([]);
  });
});

describe('stripMetadata: PNG', () => {
  const EVERYTHING_PNG = bytes(
    PNG_SIGNATURE,
    IHDR,
    chunk('iCCP', bytes('sRGB\0\0', [0x78])),
    chunk('eXIf', tiff({ orientation: 8, gps: true })),
    chunk('tEXt', bytes('Author\0', 'me')),
    chunk('iTXt', bytes('XML:com.adobe.xmp\0', '<x/>')),
    chunk('pHYs', [0, 0, 11, 19, 0, 0, 11, 19, 1]),
    chunk('caBX', 'c2pa'),
    IDAT,
    IEND,
    bytes('appended'),
  );

  it('keeps image chunks, writes a valid eXIf for the orientation before IDAT', async () => {
    const { removed, after, out } = await strip(EVERYTHING_PNG);
    expect(removed).toEqual(['exif', 'gps', 'xmp', 'text', 'other']);
    expect(after).toMatchObject({ width: 40, height: 30, orientation: 8, metadata: ['icc'] });
    const view = new Bytes(out);
    const text = view.ascii(0, out.length) as string;
    expect(text.indexOf('eXIf')).toBeLessThan(text.indexOf('IDAT'));
    expect(text).toContain('pHYs');
    expect(text.endsWith('IEND\u00AEB`\u0082')).toBe(true);
    // Every chunk CRC is valid.
    for (let at = 8; at < out.length; ) {
      const length = view.u32(at, false) as number;
      expect(view.u32(at + 8 + length, false)).toBe(crc32(out.subarray(at + 4, at + 8 + length)));
      at += 12 + length;
    }
  });

  it('drops the colour profile and orientation when asked', async () => {
    const { after, removed } = await strip(EVERYTHING_PNG, { keepColorProfile: false, keepOrientation: false });
    expect(after.metadata).toEqual([]);
    expect(removed).toContain('icc');
  });

  it('computes CRC-32 like zlib', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('a PNG without metadata is returned as it is', async () => {
    const clean = blob(png());
    expect((await stripMetadata(clean)).blob).toBe(clean);
  });
});

describe('stripMetadata: WebP', () => {
  it('drops EXIF and XMP, updates VP8X flags and the RIFF size, keeps the orientation', async () => {
    const data = webp(vp8x(0x2c | 0x10), riff('ICCP', 'icc'), riff('ALPH', [0]), VP8, riff('EXIF', bytes('Exif\0\0', tiff({ orientation: 6, gps: true }))), riff('XMP ', '<x/>'), riff('JUNK', 'x'));
    const { removed, after, out } = await strip(data);
    expect(removed).toEqual(['exif', 'gps', 'xmp', 'other']);
    expect(after).toMatchObject({ width: 40, height: 30, orientation: 6, metadata: ['icc'] });
    const view = new Bytes(out);
    expect(view.u32(4, true)).toBe(out.length - 8);
    // ICC and EXIF flags set, XMP cleared, alpha kept.
    expect(view.u8(20)).toBe(0x20 | 0x08 | 0x10);
  });

  it('clears the flags it no longer needs', async () => {
    const data = webp(vp8x(0x2c), riff('ICCP', 'icc'), VP8, riff('EXIF', tiff({ orientation: 1, gps: true })));
    const { out, after } = await strip(data, { keepColorProfile: false });
    expect(new Bytes(out).u8(20)).toBe(0);
    expect(after.metadata).toEqual([]);
  });

  it('pads odd-sized chunks and keeps simple files clean', async () => {
    const data = webp(vp8x(0x08), VP8L, riff('EXIF', tiff({ orientation: 5 })));
    const { out } = await strip(data);
    expect(out.length % 2).toBe(0);
    const clean = blob(webp(VP8));
    expect((await stripMetadata(clean)).blob).toBe(clean);
  });
});

describe('stripMetadata: GIF and BMP', () => {
  it('keeps frames, looping and the colour profile; drops comments, XMP and app data', async () => {
    const data = bytes(gif(appExtension('NETSCAPE2.0'), appExtension('ICCRGBG1012'), appExtension('XMP DataXMP'), COMMENT, GCE, FRAME, GCE, FRAME), 'tail');
    const { removed, after, out } = await strip(data);
    expect(removed).toEqual(['xmp', 'comment', 'other']);
    expect(after).toMatchObject({ animated: true, metadata: ['icc'] });
    expect(new Bytes(out).ascii(0, out.length)).toContain('NETSCAPE2.0');
    expect(out[out.length - 1]).toBe(0x3b);
    const { after: noIcc } = await strip(data, { keepColorProfile: false });
    expect(noIcc.metadata).toEqual([]);
  });

  it('a BMP has nothing to remove', async () => {
    const bmp = blob(bytes('BM', new Uint8Array(16), [40, 0, 0, 0, 30, 0, 0, 0], [0, 0]));
    const result = await stripMetadata(bmp);
    expect(result).toMatchObject({ removed: [], info: { format: 'bmp' } });
    expect(result.blob).toBe(bmp);
  });
});

describe('stripMetadata: Files', () => {
  it('returns a File with the same name, date and type', async () => {
    const file = new File([EVERYTHING_JPEG as BlobPart], 'IMG_0001.JPG', { type: 'image/jpeg', lastModified: 1234 });
    const { blob: out } = await stripMetadata(file);
    expect(out).toBeInstanceOf(File);
    expect(out).toMatchObject({ name: 'IMG_0001.JPG', lastModified: 1234, type: 'image/jpeg' });
  });

  it('labels the result by its real format, not the claimed type', async () => {
    const { blob: out } = await stripMetadata(blob(png(chunk('tEXt', 'a\0b')), 'image/jpeg'));
    expect(out.type).toBe('image/png');
  });
});

export { IDAT };
