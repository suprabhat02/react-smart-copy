import type { Bytes } from './bytes';
import { readTiff } from './exif';
import { Found, type ImageFormat, type Parsed } from './types';

interface Box {
  readonly type: string;
  /** Start of the payload (after the header). */
  readonly body: number;
  readonly end: number;
}

/** Boxes between `start` and `end`. Bounded: a hostile file can't make this loop forever. */
function boxes(bytes: Bytes, start: number, end: number): Box[] {
  const out: Box[] = [];
  for (let at = start; at + 8 <= end && out.length < 4096; ) {
    let size = bytes.u32(at, false) as number;
    const type = bytes.ascii(at + 4, 4) as string;
    let body = at + 8;
    if (size === 1) {
      // 64-bit size: files over 4 GiB are never read into memory here, so the high word must be 0.
      if (bytes.u32(at + 8, false) !== 0) break;
      size = bytes.u32(at + 12, false) ?? 0;
      body = at + 16;
    } else if (size === 0) {
      size = end - at;
    }
    if (size < body - at || at + size > end) break;
    out.push({ type, body, end: at + size });
    at += size;
  }
  return out;
}

const child = (bytes: Bytes, parent: Box, type: string, skip = 0): Box | undefined =>
  boxes(bytes, parent.body + skip, parent.end).find((box) => box.type === type);

/** Reads an unsigned big-endian integer of 0, 4 or 8 bytes (8-byte values must fit 32 bits). */
function sized(bytes: Bytes, at: number, size: number): number | null {
  if (size === 0) return 0;
  if (size === 4) return bytes.u32(at, false);
  if (size === 8) return bytes.u32(at, false) === 0 ? bytes.u32(at + 4, false) : null;
  return null;
}

/** Item ids of `Exif` items, and whether there is XMP (a `mime` item). */
function readItemInfo(file: Bytes, iinf: Box): { readonly exif: number[]; readonly xmp: boolean } {
  const bytes = file.until(iinf.end);
  const version = bytes.u8(iinf.body) ?? 0;
  const entriesAt = iinf.body + 4 + (version === 0 ? 2 : 4);
  const exif: number[] = [];
  let xmp = false;
  for (const infe of boxes(bytes, entriesAt, iinf.end)) {
    if (infe.type !== 'infe') continue;
    const view = bytes.until(infe.end);
    const infeVersion = view.u8(infe.body) ?? 0;
    if (infeVersion < 2) continue;
    const id = infeVersion === 2 ? view.u16(infe.body + 4, false) : view.u32(infe.body + 4, false);
    const typeAt = infe.body + 4 + (infeVersion === 2 ? 2 : 4) + 2;
    const itemType = view.ascii(typeAt, 4);
    if (itemType === 'Exif' && id !== null) exif.push(id);
    if (itemType === 'mime') xmp = true;
  }
  return { exif, xmp };
}

/** Where item `id` is stored in the file (construction method 0, first extent), or `null`. */
function itemLocation(file: Bytes, iloc: Box, id: number): { readonly start: number; readonly end: number } | null {
  const bytes = file.until(iloc.end);
  const version = bytes.u8(iloc.body) ?? 0;
  const sizes = bytes.u16(iloc.body + 4, false) ?? 0;
  const offsetSize = sizes >> 12;
  const lengthSize = (sizes >> 8) & 0x0f;
  const baseSize = (sizes >> 4) & 0x0f;
  const indexSize = version === 1 || version === 2 ? sizes & 0x0f : 0;
  let at = iloc.body + 6;
  const count = version < 2 ? bytes.u16(at, false) : bytes.u32(at, false);
  at += version < 2 ? 2 : 4;
  for (let item = 0; item < (count ?? 0) && item < 4096; item += 1) {
    const itemId = version < 2 ? bytes.u16(at, false) : bytes.u32(at, false);
    at += version < 2 ? 2 : 4;
    let method = 0;
    if (version === 1 || version === 2) {
      method = (bytes.u16(at, false) ?? 0) & 0x0f;
      at += 2;
    }
    at += 2; // data_reference_index
    const base = sized(bytes, at, baseSize);
    at += baseSize;
    const extents = bytes.u16(at, false) ?? 0;
    at += 2;
    let first: { start: number; end: number } | null = null;
    for (let extent = 0; extent < extents; extent += 1) {
      at += indexSize;
      const offset = sized(bytes, at, offsetSize);
      const length = sized(bytes, at + offsetSize, lengthSize);
      at += offsetSize + lengthSize;
      if (extent === 0 && base !== null && offset !== null && length !== null) first = { start: base + offset, end: base + offset + length };
    }
    if (itemId === id) return method === 0 ? first : null;
  }
  return null;
}

/** AVIF and HEIC (HEIF): size, animation and metadata. Not strippable without re-encoding. */
export function parseBmff(bytes: Bytes, format: ImageFormat): Parsed {
  const found = new Found();
  const top = boxes(bytes, 0, bytes.length);
  const ftyp = top[0] as Box;
  const brands = bytes.ascii(ftyp.body, Math.max(0, ftyp.end - ftyp.body)) as string; // Boxes never end past the data.
  found.animated = brands.includes('avis') || brands.includes('msf1') || brands.includes('hevs') || top.some((box) => box.type === 'moov');
  const meta = top.find((box) => box.type === 'meta');
  if (meta !== undefined) {
    // `meta` is a full box: version and flags come first.
    const ipco = ((iprp) => (iprp === undefined ? undefined : child(bytes, iprp, 'ipco')))(child(bytes, meta, 'iprp', 4));
    let area = 0;
    for (const property of ipco === undefined ? [] : boxes(bytes, ipco.body, ipco.end)) {
      if (property.type === 'colr') {
        if (bytes.ascii(property.body, 4) !== 'nclx') found.add('icc');
      }
      // A full box with a width and a height: anything shorter is skipped, never read past its end.
      if (property.type !== 'ispe' || property.end - property.body < 12) continue;
      // The largest image spatial extent is the primary image; smaller ones are thumbnails or tiles.
      const width = bytes.u32(property.body + 4, false) as number;
      const height = bytes.u32(property.body + 8, false) as number;
      if (width * height > area) {
        area = width * height;
        found.width = width;
        found.height = height;
      }
    }
    const iinf = child(bytes, meta, 'iinf', 4);
    const iloc = child(bytes, meta, 'iloc', 4);
    const items = iinf === undefined ? { exif: [], xmp: false } : readItemInfo(bytes, iinf);
    if (items.xmp) found.add('xmp');
    for (const id of items.exif) {
      found.add('exif');
      const location = iloc === undefined ? null : itemLocation(bytes, iloc, id);
      // An Exif item starts with the offset of the TIFF header within it.
      const skip = location === null ? null : bytes.u32(location.start, false);
      if (location === null || skip === null) continue;
      const summary = readTiff(bytes, location.start + 4 + skip, location.end);
      if (summary === null) continue;
      if (summary.gps) found.add('gps');
      if (summary.thumbnail) found.add('thumbnail');
    }
  }
  return { info: found.info(format), strip: null };
}

/** Which ISO BMFF image format the `ftyp` brands name, if any. */
export function bmffFormat(bytes: Bytes): ImageFormat | null {
  if (bytes.ascii(4, 4) !== 'ftyp') return null;
  // `ftyp` at 4 means at least 8 bytes: both reads are in range.
  const size = bytes.u32(0, false) as number;
  const brands = bytes.ascii(8, Math.max(0, Math.min(size, bytes.length) - 8)) as string;
  const list = brands.match(/.{4}/g) ?? [];
  if (list.some((brand) => brand === 'avif' || brand === 'avis')) return 'avif';
  if (list.some((brand) => ['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand))) return 'heic';
  return null;
}
