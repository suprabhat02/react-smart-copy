/**
 * MIME helpers shared by paste and capture. Everything that comes from the
 * clipboard is untrusted input, so types are normalised and validated before
 * they are compared, and image types are confirmed from the bytes themselves.
 */

/** RFC 6838 token shape, lower-cased. Parameters (`;charset=…`) are stripped first. */
const MIME_SHAPE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/;

/** SVG is XML that can carry scripts; it is never matched by a wildcard. */
export const SVG_MIME_TYPE = 'image/svg+xml';

/** Lower-cased `type/subtype` without parameters, or `null` if it is not a valid MIME type. */
export function normalizeMimeType(value: string): string | null {
  const separator = value.indexOf(';');
  const base = (separator === -1 ? value : value.slice(0, separator)).trim().toLowerCase();
  return MIME_SHAPE.test(base) ? base : null;
}

/**
 * Does `mimeType` (already normalised) match `pattern` (`type/subtype`, `type/*` or `*\/*`)?
 * Wildcards never match `image/svg+xml`: accepting SVG must be explicit.
 */
export function matchesMimePattern(mimeType: string, pattern: string): boolean {
  if (pattern === mimeType) return true;
  if (mimeType === SVG_MIME_TYPE) return false;
  if (pattern === '*/*') return true;
  return pattern.endsWith('/*') && mimeType.startsWith(pattern.slice(0, -1));
}

/** Types whose clipboard data is text and is therefore surfaced as a `string`. */
export function isTextualMimeType(mimeType: string): boolean {
  return (
    mimeType.startsWith('text/') ||
    mimeType === SVG_MIME_TYPE ||
    mimeType === 'application/json' ||
    mimeType === 'application/xml'
  );
}

/** Raster image formats recognised from their leading bytes. */
export type RasterImageMimeType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' | 'image/bmp' | 'image/avif';

const SNIFF_BYTES = 16;

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

const ascii = (text: string): number[] => Array.from(text, (char) => char.charCodeAt(0));

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const GIF = ascii('GIF8');
const RIFF = ascii('RIFF');
const WEBP = ascii('WEBP');
const BMP = ascii('BM');
const FTYP_AVIF = ascii('ftypavif');
const FTYP_AVIS = ascii('ftypavis');

/** Identifies a raster image from its magic bytes, ignoring whatever type the Blob claims. */
export function sniffImageBytes(bytes: Uint8Array): RasterImageMimeType | null {
  if (startsWith(bytes, PNG)) return 'image/png';
  if (startsWith(bytes, JPEG)) return 'image/jpeg';
  if (startsWith(bytes, GIF)) return 'image/gif';
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) return 'image/webp';
  if (startsWith(bytes, FTYP_AVIF, 4) || startsWith(bytes, FTYP_AVIS, 4)) return 'image/avif';
  if (startsWith(bytes, BMP)) return 'image/bmp';
  return null;
}

/** Reads only the first bytes of a Blob, so sniffing a 20 MB screenshot stays cheap. */
export async function sniffImageType(blob: Blob): Promise<RasterImageMimeType | null> {
  const head = await blob.slice(0, SNIFF_BYTES).arrayBuffer();
  return sniffImageBytes(new Uint8Array(head));
}
