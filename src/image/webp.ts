import { latin1, u32le, type Bytes } from './bytes';
import { orientationTiff, readTiff, tiffStart } from './exif';
import { Found, type MetadataKind, type Parsed, type StripSettings } from './types';

const IMAGE_CHUNKS = new Set(['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ANIM', 'ANMF']);
const FLAG_ANIMATION = 0x02;
const FLAG_XMP = 0x04;
const FLAG_EXIF = 0x08;
const FLAG_ICC = 0x20;

interface Chunk {
  readonly type: string;
  readonly start: number;
  /** End including the padding byte of odd-sized chunks. */
  readonly end: number;
}

/** A RIFF chunk for data of even length (the orientation block is 26 bytes), so it needs no padding byte. */
function riffChunk(type: string, data: Uint8Array): Uint8Array[] {
  return [latin1(type), u32le(data.length), data];
}

export function parseWebp(bytes: Bytes): Parsed {
  const found = new Found();
  const chunks: Chunk[] = [];
  const riffEnd = Math.min(bytes.length, 8 + (bytes.u32(4, true) as number));
  for (let at = 12; at + 8 <= riffEnd; ) {
    const type = bytes.ascii(at, 4) as string;
    const size = bytes.u32(at + 4, true) as number;
    const data = at + 8;
    const end = Math.min(riffEnd, data + size + (size % 2));
    if (data + size > riffEnd) break;
    chunks.push({ type, start: at, end });
    const chunkBytes = bytes.until(data + size);
    if (type === 'VP8X') {
      found.animated = ((chunkBytes.u8(data) ?? 0) & FLAG_ANIMATION) !== 0;
      const width = chunkBytes.u24le(data + 4);
      const height = chunkBytes.u24le(data + 7);
      found.width = width === null ? null : width + 1;
      found.height = height === null ? null : height + 1;
    } else if (type === 'VP8 ' && found.width === null) {
      const width = chunkBytes.u16(data + 6, true);
      const height = chunkBytes.u16(data + 8, true);
      found.width = width === null ? null : width & 0x3fff;
      found.height = height === null ? null : height & 0x3fff;
    } else if (type === 'VP8L' && found.width === null) {
      const bits = chunkBytes.u32(data + 1, true);
      found.width = bits === null ? null : (bits & 0x3fff) + 1;
      found.height = bits === null ? null : ((bits >>> 14) & 0x3fff) + 1;
    } else if (type === 'ANIM') {
      found.animated = true;
    } else if (type === 'ICCP') {
      found.add('icc');
    } else if (type === 'EXIF') {
      found.exif(readTiff(bytes, tiffStart(bytes, data), data + size));
    } else if (type === 'XMP ') {
      found.add('xmp');
    } else if (!IMAGE_CHUNKS.has(type)) {
      found.add('other');
    }
    at = end;
  }
  if (riffEnd < bytes.length) found.add('other'); // Data after the RIFF container.

  const strip = (settings: StripSettings) => {
    const removed = new Set<MetadataKind>(found.kinds);
    const keepIcc = settings.colorProfile && found.kinds.has('icc');
    if (keepIcc) removed.delete('icc');
    const exif = settings.orientation && found.orientation !== 1 ? orientationTiff(found.orientation) : null;
    const body: Uint8Array[] = [];
    for (const chunk of chunks) {
      if (chunk.type === 'VP8X') {
        const header = new Uint8Array(bytes.slice(chunk.start, chunk.end));
        let flags = (header[8] as number) & ~(FLAG_XMP | FLAG_EXIF);
        if (!keepIcc) flags &= ~FLAG_ICC;
        if (exif !== null) flags |= FLAG_EXIF;
        header[8] = flags;
        body.push(header);
      } else if (IMAGE_CHUNKS.has(chunk.type) || (chunk.type === 'ICCP' && keepIcc)) {
        body.push(bytes.slice(chunk.start, chunk.end));
      }
    }
    // Exif comes after the image data in the extended format. It only exists in files that have VP8X.
    if (exif !== null) body.push(...riffChunk('EXIF', exif));
    let size = 4;
    for (const part of body) size += part.length;
    return { parts: [latin1('RIFF'), u32le(size), latin1('WEBP'), ...body], removed };
  };
  return { info: found.info('webp'), strip, orientationOnly: found.orientationOnly };
}
