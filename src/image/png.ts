import { concat, latin1, u32be, type Bytes } from './bytes';
import { orientationTiff, readTiff } from './exif';
import { Found, type MetadataKind, type Parsed, type StripSettings } from './types';

let table: Uint32Array | null = null;

/** CRC-32 (ISO 3309), as PNG chunks use it. */
export function crc32(data: Uint8Array): number {
  if (table === null) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of data) crc = (table[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const body = concat([latin1(type), data]);
  return concat([u32be(data.length), body, u32be(crc32(body))]);
}

/** Chunks that are part of the picture: how it is decoded, coloured, animated or sized. Everything else is dropped. */
const IMAGE_CHUNKS = new Set([
  'IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'sBIT', 'pHYs', 'bKGD', 'hIST', 'sPLT',
  'acTL', 'fcTL', 'fdAT', 'cICP', 'mDCV', 'cLLI',
]);

interface Chunk {
  readonly type: string;
  readonly start: number;
  readonly end: number;
}

export function parsePng(bytes: Bytes): Parsed {
  const found = new Found();
  const chunks: Chunk[] = [];
  found.width = bytes.u32(16, false);
  found.height = bytes.u32(20, false);
  for (let at = 8; at + 12 <= bytes.length; ) {
    const length = bytes.u32(at, false) as number;
    const type = bytes.ascii(at + 4, 4) as string;
    const end = at + 12 + length;
    if (end > bytes.length) break;
    chunks.push({ type, start: at, end });
    const data = at + 8;
    if (type === 'acTL') found.animated = true;
    else if (type === 'iCCP') found.add('icc');
    else if (type === 'eXIf') {
      found.exif(readTiff(bytes, data, data + length));
    } else if (type === 'iTXt' && bytes.startsWith(data, 'XML:com.adobe.xmp\0')) found.add('xmp');
    else if (type === 'tEXt' || type === 'zTXt' || type === 'iTXt' || type === 'tIME') found.add('text');
    else if (!IMAGE_CHUNKS.has(type)) found.add('other');
    at = end;
    if (type === 'IEND') {
      if (end < bytes.length) found.add('other'); // Data appended after the image.
      break;
    }
  }

  const strip = (settings: StripSettings) => {
    const removed = new Set<MetadataKind>(found.kinds);
    const parts: Uint8Array[] = [bytes.slice(0, 8)];
    for (const chunk of chunks) {
      const keepIcc = chunk.type === 'iCCP' && settings.colorProfile;
      if (!IMAGE_CHUNKS.has(chunk.type) && !keepIcc) continue;
      if (keepIcc) removed.delete('icc');
      parts.push(bytes.slice(chunk.start, chunk.end));
      // eXIf must come before the image data: right after the header.
      if (chunk.type === 'IHDR' && settings.orientation && found.orientation !== 1) parts.push(pngChunk('eXIf', orientationTiff(found.orientation)));
    }
    return { parts, removed };
  };
  return { info: found.info('png'), strip, orientationOnly: found.orientationOnly };
}
