import { describe, expect, it } from 'vitest';
import { METADATA_KINDS, readImageInfo, stripMetadata } from '../../src/image';
import { Bytes } from '../../src/image/bytes';
import { orientationTiff, readTiff } from '../../src/image/exif';
import {
  COMMENT,
  EOI,
  FRAME,
  FRAME_LOCAL_TABLE,
  GCE,
  GIF_HEADER,
  IDAT,
  IEND,
  IHDR,
  PNG_SIGNATURE,
  SCAN,
  SOF,
  VP8,
  VP8L,
  appExtension,
  box,
  bytes,
  chunk,
  fullBox,
  gif,
  infe,
  ispe,
  jpeg,
  png,
  riff,
  segment,
  tiff,
  u32be,
  vp8x,
  webp,
} from './fixtures';

const blob = (data: Uint8Array, type = '') => new Blob([data as BlobPart], { type });
const info = (data: Uint8Array) => readImageInfo(blob(data));
const typed = (type: string): unknown => expect.objectContaining({ copyError: expect.objectContaining({ type }) });

describe('readTiff', () => {
  it('reads orientation, GPS and thumbnails in both byte orders', () => {
    for (const bigEndian of [false, true]) {
      const data = tiff({ orientation: 6, gps: true, thumbnail: true, bigEndian });
      expect(readTiff(new Bytes(data), 0, data.length)).toEqual({ orientation: 6, gps: true, thumbnail: true, onlyOrientation: false });
    }
  });

  it('a GPS IFD without a position is not a location; odd orientations are ignored', () => {
    const data = tiff({ orientation: 9, gps: 'version-only' });
    expect(readTiff(new Bytes(data), 0, data.length)).toEqual({ orientation: 1, gps: false, thumbnail: false, onlyOrientation: false });
    const long = tiff({ orientation: 3, orientationAsLong: true });
    expect(readTiff(new Bytes(long), 0, long.length)?.orientation).toBe(3);
  });

  it('rejects what is not TIFF, and bounds every read', () => {
    const notTiff = bytes('XX', [42, 0, 8, 0, 0, 0]);
    expect(readTiff(new Bytes(notTiff), 0, notTiff.length)).toBeNull();
    const badMagic = bytes('II', [43, 0, 8, 0, 0, 0]);
    expect(readTiff(new Bytes(badMagic), 0, badMagic.length)).toBeNull();
    const data = tiff({ orientation: 6 });
    // Cut short: the IFD runs past the end.
    expect(readTiff(new Bytes(data), 0, 20)).toBeNull();
    // An IFD offset inside the header.
    const inside = bytes('II', [42, 0, 4, 0, 0, 0]);
    expect(readTiff(new Bytes(inside), 0, inside.length)).toBeNull();
    // A hostile entry count.
    const huge = bytes('II', [42, 0, 8, 0, 0, 0], [0xff, 0xff], new Uint8Array(0xffff * 12 + 4));
    expect(readTiff(new Bytes(huge), 0, huge.length)).toBeNull();
    // A GPS pointer to nowhere, and an IFD1 that points back to IFD0.
    const loop = bytes('II', [42, 0, 8, 0, 0, 0], [1, 0], [0x25, 0x88, 4, 0, 1, 0, 0, 0, 0xff, 0xff, 0, 0], [8, 0, 0, 0]);
    expect(readTiff(new Bytes(loop), 0, loop.length)).toEqual({ orientation: 1, gps: false, thumbnail: false, onlyOrientation: false });
  });

  it('writes a minimal orientation block that reads back', () => {
    const data = orientationTiff(8);
    expect(data).toHaveLength(26);
    expect(readTiff(new Bytes(data), 0, data.length)).toEqual({ orientation: 8, gps: false, thumbnail: false, onlyOrientation: true });
  });
});

describe('Bytes', () => {
  it('returns null for every read past the end', () => {
    const data = new Bytes(Uint8Array.of(1, 2, 3));
    expect([data.u8(-1), data.u8(3), data.u16(2, true), data.u24le(1), data.u32(0, false), data.ascii(2, 2)]).toEqual([null, null, null, null, null, null]);
    expect(data.u24le(0)).toBe(0x030201);
    expect(data.u16(0, false)).toBe(0x0102);
  });
});

describe('readImageInfo: JPEG', () => {
  it('reads size, orientation and every kind of metadata', async () => {
    const data = jpeg({
      jfifThumbnail: true,
      exif: tiff({ orientation: 6, gps: true, thumbnail: true }),
      extra: [
        segment(0xe1, bytes('http://ns.adobe.com/xap/1.0/\0', '<x:xmpmeta/>')),
        segment(0xe2, bytes('ICC_PROFILE\0', [1, 1], 'icc')),
        segment(0xe2, bytes('MPF\0', 'MM')),
        segment(0xeb, bytes('JP', 'c2pa')),
        segment(0xed, bytes('Photoshop 3.0\0', '8BIM')),
        segment(0xee, bytes('Adobe', [0, 100, 0, 0, 0, 0, 1])),
        segment(0xfe, 'shot on my phone'),
      ],
      trailing: bytes('motion-photo-video'),
    });
    expect(await info(data)).toEqual({
      format: 'jpeg',
      mimeType: 'image/jpeg',
      width: 40,
      height: 30,
      orientation: 6,
      animated: false,
      metadata: ['exif', 'gps', 'thumbnail', 'xmp', 'iptc', 'comment', 'icc', 'other'],
    });
  });

  it('reads a clean file as clean', async () => {
    expect(await info(jpeg())).toMatchObject({ format: 'jpeg', width: 40, height: 30, orientation: 1, metadata: [] });
  });

  it('recognises a JFXX thumbnail and an Exif block that is not TIFF', async () => {
    const data = jpeg({ extra: [segment(0xe0, bytes('JFXX\0', [0x10])), segment(0xe1, bytes('Exif\0\0', 'garbage!'))] });
    expect((await info(data)).metadata).toEqual(['exif', 'thumbnail']);
  });

  it('stops safely at corrupt or cut-off structure', async () => {
    const good = jpeg({ exif: tiff({ orientation: 3 }) });
    // A byte that is not a marker, a bad length, a length past the end, a truncated scan.
    const corrupt = bytes([0xff, 0xd8, 0xff], segment(0xe1, bytes('Exif\0\0', tiff({ orientation: 3 }))).subarray(1), [0x00, 0x11]);
    expect(await info(corrupt)).toMatchObject({ format: 'jpeg', orientation: 3 });
    expect(await info(bytes([0xff, 0xd8, 0xff, 0xe1, 0, 1]))).toMatchObject({ format: 'jpeg', width: null });
    expect(await info(bytes([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 0]))).toMatchObject({ format: 'jpeg', metadata: [] });
    expect(await info(good.subarray(0, good.length - 6))).toMatchObject({ orientation: 3, metadata: ['exif'] });
    expect(await info(bytes([0xff, 0xd8, 0xff, 0xd0, 0xff, 0x01, 0xff, 0xff, 0xff, 0xd8], SOF, EOI))).toMatchObject({ width: 40 });
  });
});

describe('readImageInfo: PNG', () => {
  it('reads size, animation, Exif, text, XMP, colour profile and unknown chunks', async () => {
    const data = bytes(
      PNG_SIGNATURE,
      IHDR,
      chunk('acTL', [...u32be(2), ...u32be(0)]),
      chunk('iCCP', bytes('sRGB\0\0', [0x78])),
      chunk('eXIf', tiff({ orientation: 8, gps: true, thumbnail: true })),
      chunk('tEXt', bytes('Author\0', 'me')),
      chunk('iTXt', bytes('XML:com.adobe.xmp\0', [0, 0, 0, 0], '<x/>')),
      chunk('tIME', [7, 234, 10, 18, 0, 0, 0]),
      chunk('caBX', 'c2pa'),
      IDAT,
      IEND,
      bytes('appended'),
    );
    expect(await info(data)).toEqual({
      format: 'png',
      mimeType: 'image/png',
      width: 40,
      height: 30,
      orientation: 8,
      animated: true,
      metadata: ['exif', 'gps', 'thumbnail', 'xmp', 'text', 'icc', 'other'],
    });
  });

  it('handles a bad Exif chunk and a chunk that runs past the end', async () => {
    expect(await info(png(chunk('eXIf', 'nope')))).toMatchObject({ metadata: ['exif'], orientation: 1 });
    const cut = bytes(PNG_SIGNATURE, IHDR, chunk('tEXt', 'abc').subarray(0, 9));
    expect(await info(cut)).toMatchObject({ format: 'png', metadata: [] });
  });
});

describe('readImageInfo: WebP', () => {
  it('reads lossy, lossless and extended files', async () => {
    expect(await info(webp(VP8))).toMatchObject({ format: 'webp', width: 40, height: 30, animated: false });
    expect(await info(webp(VP8L))).toMatchObject({ width: 40, height: 30 });
    expect(await info(webp(vp8x(0x2c), riff('ICCP', 'icc'), VP8, riff('EXIF', bytes('Exif\0\0', tiff({ orientation: 6, gps: true, thumbnail: true }))), riff('XMP ', '<x/>'), riff('JUNK', 'x')))).toMatchObject({
      width: 40,
      height: 30,
      orientation: 6,
      metadata: ['exif', 'gps', 'thumbnail', 'xmp', 'icc', 'other'],
    });
  });

  it('reads animation from VP8X and from ANIM; garbage Exif; data after the container', async () => {
    expect((await info(webp(vp8x(0x02), riff('ANMF', [0]))) ).animated).toBe(true);
    expect((await info(webp(vp8x(0), riff('ANIM', [0, 0, 0, 0, 0, 0])))).animated).toBe(true);
    expect(await info(webp(vp8x(0x08), VP8, riff('EXIF', 'nope')))).toMatchObject({ metadata: ['exif'], orientation: 1 });
    expect((await info(bytes(webp(VP8), 'tail'))).metadata).toEqual(['other']);
    // A chunk that claims more than the container holds.
    expect(await info(bytes('RIFF', [20, 0, 0, 0], 'WEBP', 'VP8 ', [99, 0, 0, 0], [0, 0, 0, 0]))).toMatchObject({ format: 'webp', width: null });
    // Chunks too short to hold their size: unknown, never read from the next chunk.
    expect(await info(webp(riff('VP8 ', [0, 0]), riff('JUNK', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])))).toMatchObject({ width: null, height: null });
    expect(await info(webp(riff('VP8L', [0x2f])))).toMatchObject({ width: null, height: null });
    expect(await info(webp(riff('VP8X', [0x02, 0, 0, 0])))).toMatchObject({ width: null, height: null, animated: true });
    expect(await info(webp(riff('VP8X', [])))).toMatchObject({ width: null, animated: false });
  });
});

describe('readImageInfo: GIF', () => {
  it('reads size, frames and metadata extensions', async () => {
    const data = gif(appExtension('NETSCAPE2.0'), appExtension('ICCRGBG1012'), appExtension('XMP DataXMP'), appExtension('MAGPIE  1.0'), COMMENT, GCE, FRAME, GCE, FRAME_LOCAL_TABLE);
    expect(await info(bytes(data, 'after'))).toEqual({
      format: 'gif',
      mimeType: 'image/gif',
      width: 40,
      height: 30,
      orientation: 1,
      animated: true,
      metadata: ['xmp', 'comment', 'icc', 'other'],
    });
  });

  it('reads a still GIF without a colour table, and stops at corrupt blocks', async () => {
    const noTable = bytes('GIF87a', [40, 0, 30, 0, 0, 0, 0], FRAME, [0x3b]);
    expect(await info(noTable)).toMatchObject({ format: 'gif', animated: false, metadata: [] });
    expect(await info(bytes(GIF_HEADER, FRAME, [0x99]))).toMatchObject({ animated: false });
    expect(await info(bytes(GIF_HEADER, COMMENT.subarray(0, 4)))).toMatchObject({ metadata: [] });
  });
});

describe('readImageInfo: AVIF and HEIC', () => {
  const ftyp = (...brands: string[]) => box('ftyp', bytes(brands[0] as string, [0, 0, 0, 0], ...brands));

  function heif(brand: string, ...metaChildren: Uint8Array[]): Uint8Array {
    return bytes(ftyp(brand, 'mif1'), fullBox('meta', 0, ...metaChildren));
  }

  it('reads the primary image size and colour profile', async () => {
    const data = heif('avif', box('iprp', box('ipco', ispe(64, 64), ispe(4032, 3024), box('colr', 'prof'), box('colr', 'nclx'))));
    expect(await info(data)).toMatchObject({ format: 'avif', mimeType: 'image/avif', width: 4032, height: 3024, animated: false, metadata: ['icc'] });
  });

  it('finds Exif items and reads GPS through iloc (versions 0, 1 and 2)', async () => {
    const exifPayload = bytes(u32be(6), 'Exif\0\0', tiff({ orientation: 6, gps: true, thumbnail: true }));
    for (const version of [0, 1, 2]) {
      const head = bytes(ftyp('heic'));
      const iinf = fullBox('iinf', version === 2 ? 1 : 0, version === 2 ? u32be(2) : [0, 2], infe(1, 'hvc1', version === 2 ? 3 : 2), infe(2, 'Exif', version === 2 ? 3 : 2));
      // iloc: offset 4 bytes, length 4 bytes, base offset 0, index 0 (v1/2).
      const idBytes = (id: number) => (version < 2 ? [0, id] : u32be(id));
      const method = version === 0 ? [] : [0, 0];
      const items = (offset: number) =>
        bytes(
          version < 2 ? [0, 2] : u32be(2),
          idBytes(1), method, [0, 0], [0, 1], u32be(0), u32be(1),
          idBytes(2), method, [0, 0], [0, 1], u32be(offset), u32be(exifPayload.length),
        );
      const build = (offset: number) => bytes(head, fullBox('meta', 0, iinf, fullBox('iloc', version, [0x44, 0x00], items(offset))));
      const offset = build(0).length;
      const data = bytes(build(offset), exifPayload);
      expect(await info(data)).toMatchObject({ format: 'heic', metadata: ['exif', 'gps', 'thumbnail'] });
    }
  });

  it('reports Exif it cannot locate, XMP items, animation and 64-bit box sizes', async () => {
    const iinf = fullBox('iinf', 0, [0, 2], infe(1, 'Exif'), infe(2, 'mime'), infe(3, 'old', 1));
    expect((await info(heif('heic', iinf))).metadata).toEqual(['exif', 'xmp']);
    // An iloc that stores the Exif item in an idat box (construction method 1) is not followed.
    const iloc = fullBox('iloc', 1, [0x44, 0x40], [0, 1], [0, 1], [0, 1], [0, 0], u32be(0), [0, 1], u32be(0), u32be(10));
    expect((await info(heif('heic', iinf, iloc))).metadata).toEqual(['exif', 'xmp']);
    // An Exif item whose bytes are not TIFF, and one that points past the end.
    const bad = (offset: number) => fullBox('iloc', 0, [0x44, 0x00], [0, 1], [0, 1], [0, 0], [0, 1], u32be(offset), u32be(8));
    expect((await info(heif('heic', iinf, bad(0)))).metadata).toEqual(['exif', 'xmp']);
    expect((await info(heif('heic', iinf, bad(1_000_000)))).metadata).toEqual(['exif', 'xmp']);
    // A large size with base offsets of 8 bytes, an odd size it can't read, and an unknown id.
    const wide = fullBox('iloc', 0, [0x88, 0x80], [0, 1], [0, 9], [0, 0], [0, 0, 0, 0, 0, 0, 0, 0], [0, 1], [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 4]);
    expect((await info(heif('heic', iinf, wide))).metadata).toEqual(['exif', 'xmp']);
    const odd = fullBox('iloc', 0, [0x22, 0x00], [0, 1], [0, 1], [0, 0], [0, 1], [0, 0], [0, 0]);
    expect((await info(heif('heic', iinf, odd))).metadata).toEqual(['exif', 'xmp']);
    const huge = fullBox('iloc', 0, [0x88, 0x00], [0, 1], [0, 1], [0, 0], [0, 1], [0, 0, 0, 1, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 4]);
    expect((await info(heif('heic', iinf, huge))).metadata).toEqual(['exif', 'xmp']);

    expect((await info(bytes(ftyp('avis', 'avif'))))).toMatchObject({ format: 'avif', animated: true });
    expect((await info(bytes(ftyp('heic'), box('moov'))))).toMatchObject({ format: 'heic', animated: true });
    const large = bytes(u32be(1), 'meta', u32be(0), u32be(16 + 4), [0, 0, 0, 0]);
    expect(await info(bytes(ftyp('heic'), large))).toMatchObject({ format: 'heic', width: null });
    const tooLarge = bytes(u32be(1), 'meta', u32be(1), u32be(0));
    expect(await info(bytes(ftyp('heic'), tooLarge))).toMatchObject({ format: 'heic' });
    const toEnd = bytes(u32be(0), 'meta', [0, 0, 0, 0], box('iprp', box('ipco', ispe(10, 20))));
    expect(await info(bytes(ftyp('heic'), toEnd))).toMatchObject({ width: 10, height: 20 });
    expect(await info(bytes(ftyp('heic'), u32be(4), 'bad!'))).toMatchObject({ format: 'heic' });
    expect(await info(bytes(ftyp('heic'), fullBox('meta', 0, box('iprp'))))).toMatchObject({ width: null });
  });

  it('leaves other ISO media (MP4) unrecognised', async () => {
    expect((await info(bytes(ftyp('isom', 'mp41')))).format).toBeNull();
  });
});

describe('readImageInfo: BMP and others', () => {
  it('reads BMP sizes, top-down included', async () => {
    const bmp = (height: number) => bytes('BM', new Uint8Array(16), [40, 0, 0, 0], [...new Uint8Array(new Int32Array([height]).buffer)], [0, 0]);
    expect(await info(bmp(30))).toMatchObject({ format: 'bmp', mimeType: 'image/bmp', width: 40, height: 30, metadata: [] });
    expect(await info(bmp(-30))).toMatchObject({ height: 30 });
  });

  it('never trusts the claimed type: a text file named image/png is no image', async () => {
    expect(await readImageInfo(blob(bytes('hello'), 'image/png'))).toEqual({
      format: null,
      mimeType: null,
      width: null,
      height: null,
      orientation: 1,
      animated: false,
      metadata: [],
    });
    expect((await info(bytes('BM'))).format).toBeNull();
  });

  it('refuses files over maxInputBytes and invalid input', async () => {
    await expect(readImageInfo(blob(jpeg()), { maxInputBytes: 10 })).rejects.toEqual(typed('too-large'));
    await expect(readImageInfo(blob(jpeg()), { maxInputBytes: 0 })).rejects.toEqual(typed('invalid-payload'));
    await expect(readImageInfo('x' as never)).rejects.toEqual(typed('invalid-payload'));
    await expect(readImageInfo(null as never)).rejects.toEqual(typed('invalid-payload'));
    expect(await readImageInfo(blob(jpeg()), { maxInputBytes: Infinity })).toMatchObject({ format: 'jpeg' });
  });

  it('lists metadata kinds in a stable order', () => {
    expect(METADATA_KINDS).toEqual(['exif', 'gps', 'thumbnail', 'xmp', 'iptc', 'comment', 'text', 'icc', 'other']);
  });
});

describe('stripMetadata rejects what it cannot strip', () => {
  it('AVIF, HEIC and non-images', async () => {
    await expect(stripMetadata(blob(bytes(box('ftyp', bytes('avif', [0, 0, 0, 0], 'avif')))))).rejects.toEqual(typed('unsupported-format'));
    await expect(stripMetadata(blob(bytes('hello')))).rejects.toEqual(typed('unsupported-format'));
    await expect(stripMetadata(blob(jpeg()), { keepOrientation: 'yes' as never })).rejects.toEqual(typed('invalid-payload'));
  });

  it('keeps a scan with fill bytes and restart markers intact', async () => {
    const { blob: out } = await stripMetadata(blob(jpeg({ exif: tiff({ gps: true }) })));
    const result = new Uint8Array(await out.arrayBuffer());
    const scanAt = result.findIndex((byte, at) => byte === 0xff && result[at + 1] === 0xda);
    expect(Array.from(result.subarray(scanAt, scanAt + SCAN.length))).toEqual(Array.from(SCAN));
  });
});

export { IDAT, IEND };
