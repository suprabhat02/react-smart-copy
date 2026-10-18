import type { Bytes } from './bytes';
import { Found, type MetadataKind, type Parsed } from './types';

interface Block {
  readonly start: number;
  readonly end: number;
  /** Metadata kind when the block is metadata, `null` for image data and rendering blocks. */
  readonly kind: MetadataKind | null;
}

/** The end of a run of data sub-blocks starting at `at` (after its terminating zero), or `null` if cut off. */
function skipSubBlocks(bytes: Bytes, at: number): number | null {
  let position = at;
  for (;;) {
    const size = bytes.u8(position);
    if (size === null) return null;
    position += 1 + size;
    if (size === 0) return position;
  }
}

/** Application extensions that are part of the picture: looping and the colour profile. */
const ANIMATION_APPS = new Set(['NETSCAPE2.0', 'ANIMEXTS1.0']);

export function parseGif(bytes: Bytes): Parsed {
  const found = new Found();
  found.width = bytes.u16(6, true);
  found.height = bytes.u16(8, true);
  const packed = bytes.u8(10) ?? 0;
  const header = 13 + ((packed & 0x80) !== 0 ? 3 * 2 ** ((packed & 0x07) + 1) : 0);
  const blocks: Block[] = [];
  let frames = 0;
  let at = header;
  let trailer = -1;
  while (at < bytes.length) {
    const introducer = bytes.u8(at);
    if (introducer === 0x3b) {
      trailer = at;
      break;
    }
    let end: number | null = null;
    let kind: MetadataKind | null = null;
    if (introducer === 0x2c) {
      frames += 1;
      const flags = bytes.u8(at + 9) ?? 0;
      const table = (flags & 0x80) !== 0 ? 3 * 2 ** ((flags & 0x07) + 1) : 0;
      // Descriptor (10 bytes), local colour table, LZW minimum code size, then the data sub-blocks.
      end = skipSubBlocks(bytes, at + 10 + table + 1);
    } else if (introducer === 0x21) {
      const label = bytes.u8(at + 1);
      if (label === 0xfe) {
        kind = 'comment';
      } else if (label === 0xff) {
        const app = bytes.ascii(at + 3, 11) ?? '';
        if (app === 'ICCRGBG1012') kind = 'icc';
        else if (app === 'XMP DataXMP') kind = 'xmp';
        else if (!ANIMATION_APPS.has(app)) kind = 'other';
      }
      end = skipSubBlocks(bytes, at + 2);
    }
    if (end === null || end > bytes.length) break; // Corrupt or cut off: keep what was read.
    if (kind !== null) found.add(kind);
    blocks.push({ start: at, end, kind });
    at = end;
  }
  found.animated = frames > 1;
  if (trailer >= 0 && trailer + 1 < bytes.length) found.add('other'); // Data after the trailer.

  const strip = (settings: { readonly colorProfile: boolean }) => {
    const removed = new Set<MetadataKind>(found.kinds);
    const parts: Uint8Array[] = [bytes.slice(0, header)];
    for (const block of blocks) {
      if (block.kind === 'icc' && settings.colorProfile) removed.delete('icc');
      else if (block.kind !== null) continue;
      parts.push(bytes.slice(block.start, block.end));
    }
    parts.push(Uint8Array.of(0x3b));
    return { parts, removed };
  };
  return { info: found.info('gif'), strip };
}
