import { copyFailure } from '../core/errors';
import { DEFAULT_IMAGE_MAX_INPUT_BYTES, outputBlob, readBlob, type Bytes } from './bytes';
import { bmffFormat, parseBmff } from './bmff';
import { parseGif } from './gif';
import { parseJpeg } from './jpeg';
import { parsePng } from './png';
import { MIME_TYPES, METADATA_KINDS, Found, type ImageInfo, type MetadataKind, type Parsed } from './types';
import { parseWebp } from './webp';

/** Recognises the format from the bytes and parses it. */
export function parse(bytes: Bytes): Parsed {
  if (bytes.u8(0) === 0xff && bytes.u8(1) === 0xd8 && bytes.u8(2) === 0xff) return parseJpeg(bytes);
  // The PNG signature (0x89 "PNG" CR LF 0x1A LF), compared as numbers so no control character is in the code.
  if (bytes.u32(0, false) === 0x89504e47 && bytes.u32(4, false) === 0x0d0a1a0a) return parsePng(bytes);
  if (bytes.startsWith(0, 'GIF87a') || bytes.startsWith(0, 'GIF89a')) return parseGif(bytes);
  if (bytes.startsWith(0, 'RIFF') && bytes.startsWith(8, 'WEBP')) return parseWebp(bytes);
  const bmff = bmffFormat(bytes);
  if (bmff !== null) return parseBmff(bytes, bmff);
  if (bytes.startsWith(0, 'BM') && bytes.length >= 26) {
    const found = new Found();
    found.width = bytes.u32(18, true);
    // Bottom-up files store a positive height, top-down ones a negative one.
    found.height = Math.abs((bytes.u32(22, true) as number) | 0);
    // No metadata to remove: the file is its own clean copy.
    return { info: found.info('bmp'), strip: () => ({ parts: [bytes.data], removed: new Set() }) };
  }
  return { info: new Found().info(null), strip: null };
}

export interface ReadImageInfoOptions {
  /** Refuse files larger than this. Default {@link DEFAULT_IMAGE_MAX_INPUT_BYTES} (100 MiB). */
  readonly maxInputBytes?: number;
}

export function inputLimit(value: number | undefined): number {
  if (value === undefined) return DEFAULT_IMAGE_MAX_INPUT_BYTES;
  if (value === Infinity || (Number.isInteger(value) && value > 0)) return value;
  throw copyFailure('invalid-payload', `\`maxInputBytes\` must be a positive integer or Infinity (received ${String(value)}).`);
}

/**
 * What an image file is and what it carries, read from its bytes without
 * decoding the picture: format, stored size, orientation, animation, and the
 * metadata in it (Exif, GPS location, thumbnails, XMP, IPTC, comments, colour
 * profile, appended data). The claimed MIME type and file name are never
 * trusted. Works anywhere, including on the server.
 *
 * @example
 * const info = await readImageInfo(file);
 * if (info.metadata.includes('gps')) warn('This photo contains its location.');
 */
export async function readImageInfo(blob: Blob, options: ReadImageInfoOptions = {}): Promise<ImageInfo> {
  return parse(await readBlob(blob, inputLimit(options.maxInputBytes))).info;
}

export interface StripMetadataOptions extends ReadImageInfoOptions {
  /** Keep the ICC colour profile, which changes how colours display. Default `true`. */
  readonly keepColorProfile?: boolean;
  /**
   * Keep the Exif orientation (as a 26-byte Exif block with nothing else), so a
   * photo still displays the right way up. Default `true`.
   */
  readonly keepOrientation?: boolean;
}

export interface StrippedImage {
  /** The image without its metadata: the same Blob when there was nothing to remove, a File when given one. */
  readonly blob: Blob;
  /** What the input held. */
  readonly info: ImageInfo;
  /** What was removed, in the order of {@link METADATA_KINDS}. */
  readonly removed: readonly MetadataKind[];
}

export function flag(value: unknown, fallback: boolean, name: string): boolean {
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  throw copyFailure('invalid-payload', `\`${name}\` must be a boolean.`);
}

/** Strips a parsed file; shared with `prepareImage`. Returns `null` when the format can't be stripped losslessly. */
export function stripParsed(parsed: Parsed, source: Blob, keepColorProfile: boolean, keepOrientation: boolean): StrippedImage | null {
  if (parsed.strip === null) return null;
  const { parts, removed } = parsed.strip({ colorProfile: keepColorProfile, orientation: keepOrientation });
  // An orientation-only Exif block is not reported as metadata, but removing it is a change.
  const kinds = METADATA_KINDS.filter((kind) => removed.has(kind) || (kind === 'exif' && !keepOrientation && parsed.orientationOnly === true));
  const blob = kinds.length === 0 ? source : outputBlob(parts, MIME_TYPES[parsed.info.format as keyof typeof MIME_TYPES], source);
  return { blob, info: parsed.info, removed: kinds };
}

/**
 * Removes metadata from a JPEG, PNG, WebP or GIF without re-encoding it: the
 * picture stays bit-for-bit the same. Removes Exif (camera, dates, serial
 * numbers, GPS location), embedded thumbnails, XMP, IPTC, comments, text chunks,
 * multi-picture and depth images, content credentials and data appended after
 * the image. Keeps the colour profile and orientation unless told otherwise.
 * Works anywhere, including on the server.
 *
 * AVIF and HEIC can't be stripped losslessly: this throws `unsupported-format`
 * for them (and for files that aren't images); `prepareImage` re-encodes them.
 *
 * @example
 * const { blob, removed } = await stripMetadata(file);
 * if (removed.includes('gps')) notice('Location removed from the photo.');
 */
export async function stripMetadata(blob: Blob, options: StripMetadataOptions = {}): Promise<StrippedImage> {
  const keepColorProfile = flag(options.keepColorProfile, true, 'keepColorProfile');
  const keepOrientation = flag(options.keepOrientation, true, 'keepOrientation');
  const parsed = parse(await readBlob(blob, inputLimit(options.maxInputBytes)));
  const stripped = stripParsed(parsed, blob, keepColorProfile, keepOrientation);
  if (stripped === null) {
    throw copyFailure(
      'unsupported-format',
      parsed.info.format === null
        ? 'Not an image this module can read (JPEG, PNG, WebP, GIF, BMP, AVIF or HEIC).'
        : `${(parsed.info.mimeType as string)} metadata can't be removed without re-encoding; use prepareImage().`,
    );
  }
  return stripped;
}
