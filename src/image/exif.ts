import type { Bytes } from './bytes';

/** What an Exif (TIFF) block holds that matters for privacy and display. */
export interface TiffSummary {
  /** 1-8, as in the Exif Orientation tag; 1 when absent or invalid. */
  readonly orientation: number;
  /** A GPS IFD with a latitude or longitude. */
  readonly gps: boolean;
  /** A second IFD carrying a thumbnail image. */
  readonly thumbnail: boolean;
  /** Nothing but the orientation: what is left after stripping, not metadata. */
  readonly onlyOrientation: boolean;
}

const ORIENTATION = 0x0112;
const GPS_IFD = 0x8825;
const GPS_LATITUDE = 0x0002;
const GPS_LONGITUDE = 0x0004;
const THUMBNAIL_OFFSET = 0x0201;
const STRIP_OFFSETS = 0x0111;
/** Real files have a few dozen tags; a bound keeps hostile counts cheap. */
const MAX_ENTRIES = 512;

interface Ifd {
  readonly tags: ReadonlyMap<number, number>;
  /** Offset of the next IFD (relative to the TIFF header), 0 for none. */
  readonly next: number;
}

/** Reads an IFD's tags (value field only: enough for SHORT / LONG values and offsets). */
function readIfd(bytes: Bytes, base: number, end: number, offset: number, littleEndian: boolean): Ifd | null {
  const at = base + offset;
  const count = bytes.u16(at, littleEndian);
  if (count === null || offset < 8 || at + 2 + count * 12 + 4 > end || count > MAX_ENTRIES) return null;
  const tags = new Map<number, number>();
  for (let index = 0; index < count; index += 1) {
    const entry = at + 2 + index * 12;
    const tag = bytes.u16(entry, littleEndian) as number;
    const type = bytes.u16(entry + 2, littleEndian) as number;
    // SHORT values sit in the first two bytes of the value field; everything else is read as LONG.
    tags.set(tag, type === 3 ? (bytes.u16(entry + 8, littleEndian) as number) : (bytes.u32(entry + 8, littleEndian) as number));
  }
  return { tags, next: bytes.u32(at + 2 + count * 12, littleEndian) as number };
}

/** Summarises the TIFF structure at `start`-`end` (an Exif payload without its `Exif\0\0` prefix). */
export function readTiff(file: Bytes, start: number, end: number): TiffSummary | null {
  // Every read stays inside the Exif block: nothing past `end` is ever read.
  const bytes = file.until(end);
  const order = bytes.ascii(start, 2);
  if (order !== 'II' && order !== 'MM') return null;
  const littleEndian = order === 'II';
  if (bytes.u16(start + 2, littleEndian) !== 42) return null;
  const ifd0 = readIfd(bytes, start, end, bytes.u32(start + 4, littleEndian) as number, littleEndian);
  if (ifd0 === null) return null;
  const value = ifd0.tags.get(ORIENTATION);
  const orientation = value !== undefined && value >= 1 && value <= 8 ? value : 1;
  const gpsOffset = ifd0.tags.get(GPS_IFD);
  const gpsIfd = gpsOffset === undefined ? null : readIfd(bytes, start, end, gpsOffset, littleEndian);
  const gps = gpsIfd !== null && (gpsIfd.tags.has(GPS_LATITUDE) || gpsIfd.tags.has(GPS_LONGITUDE));
  const ifd1 = ifd0.next === 0 || ifd0.next === bytes.u32(start + 4, littleEndian) ? null : readIfd(bytes, start, end, ifd0.next, littleEndian);
  const thumbnail = ifd1 !== null && (ifd1.tags.has(THUMBNAIL_OFFSET) || ifd1.tags.has(STRIP_OFFSETS));
  const onlyOrientation = ifd0.tags.size === 1 && value !== undefined && ifd0.next === 0;
  return { orientation, gps, thumbnail, onlyOrientation };
}

/** Where the TIFF header starts in an Exif payload: after an optional `Exif\0\0` prefix. */
export function tiffStart(bytes: Bytes, start: number): number {
  return bytes.startsWith(start, 'Exif\0\0') ? start + 6 : start;
}

/**
 * The smallest valid TIFF block with only an Orientation tag: what is kept of
 * Exif so a photo still displays the right way up. 26 bytes, little-endian.
 */
export function orientationTiff(orientation: number): Uint8Array {
  return Uint8Array.of(
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, // "II", 42, IFD0 at 8
    0x01, 0x00, // one entry
    0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, orientation, 0x00, 0x00, 0x00, // Orientation, SHORT, 1
    0x00, 0x00, 0x00, 0x00, // no next IFD
  );
}
