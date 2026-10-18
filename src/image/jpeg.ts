import { latin1, type Bytes } from './bytes';
import { orientationTiff, readTiff, tiffStart } from './exif';
import { Found, type MetadataKind, type Parsed, type StripSettings } from './types';

interface Segment {
  readonly marker: number;
  /** From the 0xFF of the marker to the end of the segment (and, for SOS, its entropy-coded data). */
  readonly start: number;
  readonly end: number;
  /** What it is, when it is metadata; `null` for image data. */
  readonly kind: MetadataKind | null;
}

const SOI = 0xd8;
const EOI = 0xd9;
const SOS = 0xda;
const APP0 = 0xe0;
const APP1 = 0xe1;
const APP2 = 0xe2;
const APP13 = 0xed;
const APP14 = 0xee;
const COM = 0xfe;
/** SOF markers carry the frame size; C4 (DHT), C8 (JPG) and CC (DAC) are not frames. */
const isFrame = (marker: number): boolean => marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
/** Markers without a length: TEM and the restart markers. */
const isStandalone = (marker: number): boolean => marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7);

/** The JFIF APP0 segment with its thumbnail removed (the 14 fixed bytes after the identifier, size zeroed). */
function jfifWithoutThumbnail(bytes: Bytes, segment: Segment): Uint8Array {
  // Shorter than a full JFIF header: nothing to remove, keep it as it is.
  if (segment.end - segment.start < 18) return bytes.slice(segment.start, segment.end);
  const head = bytes.slice(segment.start, segment.start + 18);
  const out = new Uint8Array(head);
  out[2] = 0;
  out[3] = 16; // Length: 2 + 5 (identifier) + 9.
  out[16] = 0; // Thumbnail width and height.
  out[17] = 0;
  return out;
}

function classify(bytes: Bytes, marker: number, body: number, end: number, found: Found): MetadataKind | null {
  if (marker === APP1) {
    if (bytes.startsWith(body, 'Exif\0')) {
      found.exif(readTiff(bytes, tiffStart(bytes, body), end));
      return 'exif';
    }
    if (bytes.startsWith(body, 'http://ns.adobe.com/')) {
      found.add('xmp');
      return 'xmp';
    }
  }
  if (marker === APP0) {
    if (bytes.startsWith(body, 'JFIF\0')) {
      // Thumbnail width and height, when the segment is long enough to hold them.
      if (end - body >= 14 && (bytes.u8(body + 12) as number) * (bytes.u8(body + 13) as number) > 0) found.add('thumbnail');
      return null;
    }
    if (bytes.startsWith(body, 'JFXX\0')) {
      found.add('thumbnail');
      return 'thumbnail';
    }
  }
  if (marker === APP2 && bytes.startsWith(body, 'ICC_PROFILE\0')) {
    found.add('icc');
    return 'icc';
  }
  // Adobe's colour transform: needed to decode CMYK and YCCK files correctly.
  if (marker === APP14 && bytes.startsWith(body, 'Adobe')) return null;
  if (marker === APP13) {
    found.add('iptc');
    return 'iptc';
  }
  if (marker === COM) {
    found.add('comment');
    return 'comment';
  }
  // Other APPn: MPF (multi-picture: previews, depth maps), C2PA (APP11), vendor data.
  if (marker >= APP0 && marker <= 0xef) {
    found.add('other');
    return 'other';
  }
  return null;
}

/** Parses a JPEG from its markers: never decodes the image data, only skips over it. */
export function parseJpeg(bytes: Bytes): Parsed {
  const found = new Found();
  const segments: Segment[] = [];
  let at = 2;
  let end = bytes.length;
  while (at + 1 < bytes.length) {
    if (bytes.u8(at) !== 0xff) break; // Corrupt: keep what was read so far.
    const marker = bytes.u8(at + 1) as number;
    if (marker === 0xff) {
      at += 1; // Fill byte.
      continue;
    }
    if (marker === SOI || isStandalone(marker)) {
      segments.push({ marker, start: at, end: at + 2, kind: null });
      at += 2;
      continue;
    }
    if (marker === EOI) {
      end = at + 2;
      break;
    }
    const length = bytes.u16(at + 2, false);
    if (length === null || length < 2 || at + 2 + length > bytes.length) break;
    let segmentEnd = at + 2 + length;
    const body = at + 4;
    if (isFrame(marker)) {
      const frame = bytes.until(segmentEnd);
      found.height = frame.u16(body + 1, false);
      found.width = frame.u16(body + 3, false);
    }
    if (marker === SOS) {
      // Entropy-coded data runs to the next marker that is not a stuffed 0xFF00 or a restart marker.
      let scan = segmentEnd;
      while (scan + 1 < bytes.length) {
        if (bytes.u8(scan) === 0xff) {
          const next = bytes.u8(scan + 1) as number;
          if (next !== 0x00 && next !== 0xff && !isStandalone(next)) break;
        }
        scan += 1;
      }
      segmentEnd = scan + 1 < bytes.length ? scan : bytes.length;
    }
    // Classified from its own bytes only: an empty or short segment never borrows the next one's.
    segments.push({ marker, start: at, end: segmentEnd, kind: classify(bytes.until(segmentEnd), marker, body, segmentEnd, found) });
    at = segmentEnd;
  }
  // Data after the end of the image: motion-photo videos, MPF images, anything appended.
  if (end < bytes.length) found.add('other');

  const strip = (settings: StripSettings) => {
    const removed = new Set<MetadataKind>(found.kinds);
    const parts: Uint8Array[] = [Uint8Array.of(0xff, SOI)];
    let wroteExif = false;
    const writeOrientation = (): void => {
      if (wroteExif || !settings.orientation || found.orientation === 1) return;
      const payload = [latin1('Exif\0\0'), orientationTiff(found.orientation)];
      const length = 2 + 6 + 26;
      parts.push(Uint8Array.of(0xff, APP1, length >> 8, length & 0xff), ...payload);
      wroteExif = true;
    };
    for (const segment of segments) {
      const { marker, kind } = segment;
      if (marker === APP0 && kind === null) {
        parts.push(jfifWithoutThumbnail(bytes, segment));
        writeOrientation();
        continue;
      }
      if (kind === 'icc' && settings.colorProfile) {
        removed.delete('icc');
      } else if (kind !== null) {
        continue;
      }
      // The orientation block goes before the image data.
      if (marker !== APP0 && (marker < APP0 || marker > 0xef)) writeOrientation();
      parts.push(bytes.slice(segment.start, segment.end));
    }
    writeOrientation();
    parts.push(Uint8Array.of(0xff, EOI));
    return { parts, removed };
  };
  return { info: found.info('jpeg'), strip, orientationOnly: found.orientationOnly };
}
