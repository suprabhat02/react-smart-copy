/**
 * Byte builders for image files with exactly the structure a test needs. The
 * image data itself is a placeholder: parsing and stripping never decode it.
 */

export const bytes = (...parts: (Uint8Array | number[] | string)[]): Uint8Array => {
  const arrays = parts.map((part) => (typeof part === 'string' ? Uint8Array.from(part, (char) => char.charCodeAt(0)) : Uint8Array.from(part)));
  const out = new Uint8Array(arrays.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of arrays) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

const u16be = (value: number) => [(value >> 8) & 0xff, value & 0xff];
const u16le = (value: number) => [value & 0xff, (value >> 8) & 0xff];
export const u32be = (value: number) => [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
export const u32le = (value: number) => [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];

export interface TiffSpec {
  readonly orientation?: number;
  /** `true`: latitude and longitude; `'version-only'`: a GPS IFD with only GPSVersionID. */
  readonly gps?: boolean | 'version-only';
  /** `true`: a JPEG thumbnail (JPEGInterchangeFormat); `'strips'`: an uncompressed one (StripOffsets). */
  readonly thumbnail?: boolean | 'strips';
  readonly bigEndian?: boolean;
  /** Write the orientation as a LONG, as some broken writers do. */
  readonly orientationAsLong?: boolean;
}

/** A TIFF (Exif) block: IFD0 with Orientation and a GPS pointer, optional GPS IFD and IFD1 thumbnail. */
export function tiff(spec: TiffSpec = {}): Uint8Array {
  const le = spec.bigEndian !== true;
  const w16 = le ? u16le : u16be;
  const w32 = le ? u32le : u32be;
  const entry = (tag: number, type: number, value: number) => [...w16(tag), ...w16(type), ...w32(1), ...(type === 3 ? [...w16(value), 0, 0] : w32(value))];
  const ifd0Entries: number[][] = [entry(0x010f, 2, 0)]; // Make (value ignored)
  if (spec.orientation !== undefined) ifd0Entries.push(entry(0x0112, spec.orientationAsLong === true ? 4 : 3, spec.orientation));
  const ifd0Size = 2 + (ifd0Entries.length + (spec.gps === undefined || spec.gps === false ? 0 : 1)) * 12 + 4;
  const gpsAt = 8 + ifd0Size;
  if (spec.gps !== undefined && spec.gps !== false) ifd0Entries.push(entry(0x8825, 4, gpsAt));
  const gpsEntries = spec.gps === true ? [entry(0x0000, 1, 0), entry(0x0002, 5, 0), entry(0x0004, 5, 0)] : spec.gps === 'version-only' ? [entry(0x0000, 1, 0)] : [];
  const gpsSize = gpsEntries.length > 0 ? 2 + gpsEntries.length * 12 + 4 : 0;
  const ifd1At = gpsAt + gpsSize;
  const ifd0 = [...w16(ifd0Entries.length), ...ifd0Entries.flat(), ...w32(spec.thumbnail === undefined || spec.thumbnail === false ? 0 : ifd1At)];
  const gpsIfd = gpsEntries.length > 0 ? [...w16(gpsEntries.length), ...gpsEntries.flat(), ...w32(0)] : [];
  const ifd1 = spec.thumbnail === undefined || spec.thumbnail === false ? [] : [...w16(1), ...entry(spec.thumbnail === 'strips' ? 0x0111 : 0x0201, 4, 0), ...w32(0)];
  return bytes(le ? 'II' : 'MM', w16(42), w32(8), ifd0, gpsIfd, ifd1);
}

/* --------------------------------------------------------------------- JPEG */

export const segment = (marker: number, body: Uint8Array | string | number[]) => {
  const data = bytes(body);
  return bytes([0xff, marker], u16be(data.length + 2), data);
};

export const SOF = segment(0xc0, [8, ...u16be(30), ...u16be(40), 1, 1, 0x11, 0]); // 40 x 30
export const DQT = segment(0xdb, [0, ...Array.from({ length: 64 }, () => 1)]);
/** A scan whose data holds a stuffed 0xFF00 and a restart marker. */
export const SCAN = bytes(segment(0xda, [1, 1, 0, 0, 63, 0]), [0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56, 0x78]);
/** End of image, after a fill byte. */
export const EOI = bytes([0xff, 0xff, 0xd9]);
export const JFIF = segment(0xe0, bytes('JFIF\0', [1, 1, 0, 0, 1, 0, 1, 0, 0]));

export interface JpegSpec {
  readonly exif?: Uint8Array;
  readonly jfifThumbnail?: boolean;
  readonly extra?: readonly Uint8Array[];
  readonly trailing?: Uint8Array;
  /** Default true. */
  readonly jfif?: boolean;
}

export function jpeg(spec: JpegSpec = {}): Uint8Array {
  const jfif = spec.jfifThumbnail === true ? segment(0xe0, bytes('JFIF\0', [1, 1, 0, 0, 1, 0, 1, 2, 1], [1, 2, 3, 4, 5, 6])) : JFIF;
  return bytes(
    [0xff, 0xd8],
    spec.jfif === false ? [] : jfif,
    spec.exif === undefined ? [] : segment(0xe1, bytes('Exif\0\0', spec.exif)),
    ...(spec.extra ?? []),
    DQT,
    SOF,
    SCAN,
    EOI,
    spec.trailing ?? [],
  );
}

/* ---------------------------------------------------------------------- PNG */

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let k = 0; k < 8; k += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export const chunk = (type: string, data: Uint8Array | string | number[] = []) => {
  const body = bytes(type, bytes(data));
  return bytes(u32be(body.length - 4), body, u32be(crc32(body)));
};

export const IHDR = chunk('IHDR', [...u32be(40), ...u32be(30), 8, 6, 0, 0, 0]);
export const IDAT = chunk('IDAT', [0x78, 0x9c, 0x63, 0, 0, 0, 1, 0, 1]);
export const IEND = chunk('IEND');
export const PNG_SIGNATURE = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function png(...middle: Uint8Array[]): Uint8Array {
  return bytes(PNG_SIGNATURE, IHDR, ...middle, IDAT, IEND);
}

/* --------------------------------------------------------------------- WebP */

export const riff = (type: string, data: Uint8Array | string | number[]) => {
  const body = bytes(data);
  return bytes(type, u32le(body.length), body, body.length % 2 === 1 ? [0] : []);
};

export const VP8 = riff('VP8 ', [0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a, ...u16le(40), ...u16le(30), 0, 0]);
export const VP8L = riff('VP8L', [0x2f, ...u32le((40 - 1) | ((30 - 1) << 14))]);
export const vp8x = (flags: number) => riff('VP8X', [flags, 0, 0, 0, 39, 0, 0, 29, 0, 0]);

export function webp(...chunks: Uint8Array[]): Uint8Array {
  const body = bytes(...chunks);
  return bytes('RIFF', u32le(body.length + 4), 'WEBP', body);
}

/* ---------------------------------------------------------------------- GIF */

export const GIF_HEADER = bytes('GIF89a', u16le(40), u16le(30), [0x80, 0, 0], [0, 0, 0, 255, 255, 255]);
export const FRAME = bytes([0x2c, 0, 0, 0, 0, ...u16le(40), ...u16le(30), 0], [2, 2, 0x4c, 0x01, 0]);
export const FRAME_LOCAL_TABLE = bytes([0x2c, 0, 0, 0, 0, ...u16le(40), ...u16le(30), 0x80], [0, 0, 0, 1, 1, 1], [2, 1, 0, 0]);
export const appExtension = (id: string, data: number[] = [1, 0, 0]) => bytes([0x21, 0xff, 11], id, [data.length], data, [0]);
export const COMMENT = bytes([0x21, 0xfe, 5], 'hello', [0]);
export const GCE = bytes([0x21, 0xf9, 4, 0, 10, 0, 0, 0]);

export function gif(...blocks: Uint8Array[]): Uint8Array {
  return bytes(GIF_HEADER, ...blocks, [0x3b]);
}

/* -------------------------------------------------------------- AVIF / HEIC */

export const box = (type: string, ...children: (Uint8Array | number[] | string)[]) => {
  const body = bytes(...children);
  return bytes(u32be(body.length + 8), type, body);
};
export const fullBox = (type: string, version: number, ...children: (Uint8Array | number[])[]) => box(type, [version, 0, 0, 0], ...children);
export const ispe = (width: number, height: number) => fullBox('ispe', 0, u32be(width), u32be(height));
export const infe = (id: number, type: string, version = 2) =>
  fullBox('infe', version, version === 2 ? u16be(id) : u32be(id), u16be(0), bytes(type), [0], type === 'mime' ? bytes('application/rdf+xml\0') : []);
