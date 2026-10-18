import { CopyFailure, copyFailure } from '../core/errors';
import { withDeadline } from '../capture/deadline';
import { Bytes, readBlob } from './bytes';
import { flag, inputLimit, parse, stripParsed } from './info';
import { METADATA_KINDS, type ImageInfo, type MetadataKind } from './types';

/** Formats `prepareImage` can write. */
export type OutputImageType = 'image/png' | 'image/jpeg' | 'image/webp';

/** A decoded picture, already turned the right way up. */
export interface DecodedImage {
  readonly width: number;
  readonly height: number;
  /** Platform-specific (an `ImageBitmap` in browsers). */
  readonly source: unknown;
  /** Frees the decoded pixels. */
  readonly close: () => void;
}

export interface EncodeTarget {
  readonly width: number;
  readonly height: number;
  readonly type: OutputImageType;
  /** 0-1, for JPEG and WebP. */
  readonly quality: number;
  /** CSS colour painted under transparent pixels; always set for JPEG, which has no transparency. */
  readonly background: string | null;
}

/**
 * Everything `prepareImage` needs from the platform. The default uses
 * `createImageBitmap` and a canvas (`OffscreenCanvas` when there is one, so it
 * also works in workers). Inject your own for other decoders (e.g. a WebAssembly
 * HEIC decoder), native shells or tests.
 */
export interface ImageEnvironment {
  readonly decode: (blob: Blob, signal: AbortSignal) => Promise<DecodedImage>;
  /** Draws the image at the target size and encodes it. May return another type when the browser can't encode the one asked for. */
  readonly encode: (image: DecodedImage, target: EncodeTarget, signal: AbortSignal) => Promise<Blob>;
}

type Canvas = OffscreenCanvas | HTMLCanvasElement;

function createCanvas(width: number, height: number): Canvas {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function context(canvas: Canvas): OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw copyFailure('unsupported', 'Canvas 2D rendering is not available.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return ctx;
}

function toBlob(canvas: Canvas, type: string, quality: number): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(copyFailure('blob-generation-failed', 'The canvas produced no image (too large for this browser?).'));
      },
      type,
      quality,
    );
  });
}

/**
 * Draws `image` at the target size. Large reductions halve the size in steps, as
 * one big reduction skips pixels and makes text and edges shimmer.
 */
function draw(image: DecodedImage, target: EncodeTarget): Canvas {
  let source = image.source as CanvasImageSource;
  let width = image.width;
  let height = image.height;
  while (width / 2 >= target.width && height / 2 >= target.height) {
    width = Math.round(width / 2);
    height = Math.round(height / 2);
    const step = createCanvas(width, height);
    context(step).drawImage(source, 0, 0, width, height);
    source = step;
  }
  const canvas = createCanvas(target.width, target.height);
  const ctx = context(canvas);
  if (target.background !== null) {
    ctx.fillStyle = target.background;
    ctx.fillRect(0, 0, target.width, target.height);
  }
  ctx.drawImage(source, 0, 0, target.width, target.height);
  return canvas;
}

/** The browser environment, or `null` where there is no `createImageBitmap` or canvas (servers, old browsers). */
export function getDefaultImageEnvironment(): ImageEnvironment | null {
  if (typeof createImageBitmap !== 'function' || (typeof OffscreenCanvas !== 'function' && typeof document === 'undefined')) return null;
  return {
    decode: async (blob) => {
      // `from-image` turns the picture by its Exif orientation, so the result is upright.
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      return { width: bitmap.width, height: bitmap.height, source: bitmap, close: () => { bitmap.close(); } };
    },
    encode: (image, target) => toBlob(draw(image, target), target.type, target.quality),
  };
}

/* ------------------------------------------------------------------ Options */

export const DEFAULT_IMAGE_MAX_INPUT_PIXELS = 100_000_000;
/** 4096 x 4096: the canvas area limit of Safari and iOS, the strictest mainstream engine. */
export const DEFAULT_IMAGE_MAX_PIXELS = 16_777_216;
export const DEFAULT_IMAGE_QUALITY = 0.85;
export const DEFAULT_IMAGE_MIN_QUALITY = 0.5;
export const DEFAULT_IMAGE_TIMEOUT_MS = 30_000;

export interface PrepareImageOptions {
  /** Largest width and height of the result, in pixels. Default: no limit. Images are only made smaller, never larger. */
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  /** Largest pixel area of the result. Default {@link DEFAULT_IMAGE_MAX_PIXELS} (fits Safari's canvas limit). */
  readonly maxPixels?: number;
  /**
   * Largest file size of the result, in bytes. Default: no limit. Lossy formats
   * lower their quality down to `minQuality` first, then the size is reduced.
   * When it can't be met, a `too-large` error says so; the file is never left too big.
   */
  readonly maxBytes?: number;
  /**
   * The format to write. `'auto'` (the default) keeps PNG, JPEG and WebP as they
   * are; GIF and BMP become PNG, AVIF and HEIC become JPEG; and a PNG that can't
   * fit `maxBytes` becomes WebP (or JPEG where WebP can't be encoded).
   */
  readonly type?: 'auto' | OutputImageType;
  /** Quality to start from for JPEG and WebP, 0-1. Default 0.85. */
  readonly quality?: number;
  /** Lowest quality to go to before reducing the size. Default 0.5. */
  readonly minQuality?: number;
  /** CSS colour under transparent pixels when writing JPEG. Default `'#fff'`. */
  readonly background?: string;
  /**
   * Animated GIF, PNG and WebP: `'keep'` (the default) keeps every frame and only
   * removes metadata, so a resize or `maxBytes` it can't meet is a `too-large` error;
   * `'first-frame'` turns it into a still image; `'reject'` refuses it with `unsupported-format`.
   */
  readonly animated?: 'keep' | 'first-frame' | 'reject';
  /** Keep the colour profile when no re-encoding is needed. Re-encoded images are written in sRGB. Default `true`. */
  readonly keepColorProfile?: boolean;
  /** Refuse inputs with more pixels than this, before decoding them (decompression bombs). Default 100 000 000. */
  readonly maxInputPixels?: number;
  /** Refuse files larger than this. Default 100 MiB. */
  readonly maxInputBytes?: number;
  /** Give up after this long. Default 30 000 ms. `Infinity` disables. */
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  /** Platform hooks. Defaults to the browser. */
  readonly environment?: ImageEnvironment;
}

export interface PreparedImage {
  /** The result: a File (named like the input, with the new extension) when given a File, else a Blob. */
  readonly file: Blob;
  readonly type: string;
  /** Pixel size as displayed (orientation applied). `null` when the image was only stripped and its size is unknown. */
  readonly width: number | null;
  readonly height: number | null;
  /** Bytes. */
  readonly size: number;
  /** Whether the picture was decoded and written again (`false`: only metadata was removed, losslessly). */
  readonly reencoded: boolean;
  /** Whether it was made smaller. */
  readonly resized: boolean;
  /** The JPEG or WebP quality used, else `null`. */
  readonly quality: number | null;
  /** Metadata the input had and the result doesn't, in the order of {@link METADATA_KINDS}. */
  readonly removed: readonly MetadataKind[];
  /** The input. */
  readonly original: { readonly info: ImageInfo; readonly size: number };
}

const invalid = (message: string): CopyFailure => copyFailure('invalid-payload', message);

function limit(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (value === Infinity || (Number.isInteger(value) && value > 0)) return value;
  throw invalid(`\`${name}\` must be a positive integer or Infinity (received ${String(value)}).`);
}

function unit(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (typeof value === 'number' && value > 0 && value <= 1) return value;
  throw invalid(`\`${name}\` must be greater than 0 and at most 1 (received ${String(value)}).`);
}

function oneOf<const T extends string>(value: unknown, allowed: readonly T[], fallback: NoInfer<T>, name: string): T {
  if (value === undefined) return fallback;
  if ((allowed as readonly unknown[]).includes(value)) return value as T;
  throw invalid(`\`${name}\` must be one of: ${allowed.map((option) => JSON.stringify(option)).join(', ')}.`);
}

const EXTENSIONS: Readonly<Record<OutputImageType, string>> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const LOSSLESS: ReadonlySet<string> = new Set(['image/png']);

/** The input's name with the extension of `type`. */
function renamed(source: Blob, type: OutputImageType): string | undefined {
  const name = (source as Partial<File>).name;
  if (typeof name !== 'string') return undefined;
  const dot = name.lastIndexOf('.');
  return `${dot > 0 ? name.slice(0, dot) : name}.${EXTENSIONS[type]}`;
}

/** Output types to try, best first. */
function candidates(requested: 'auto' | OutputImageType, info: ImageInfo): OutputImageType[] {
  if (requested !== 'auto') return [requested];
  switch (info.format) {
    case 'jpeg':
      return ['image/jpeg'];
    case 'webp':
      return ['image/webp', 'image/jpeg'];
    case 'png':
    case 'gif':
    case 'bmp':
      return ['image/png', 'image/webp', 'image/jpeg'];
    default:
      return ['image/jpeg'];
  }
}

/**
 * Prepares an image for upload: removes metadata (location, camera, thumbnails),
 * makes it fit `maxWidth` / `maxHeight` / `maxPixels`, and compresses it under
 * `maxBytes`. When nothing has to change but the metadata, the picture is not
 * re-encoded at all, so screenshots and photos keep every pixel. Inputs are
 * checked against `maxInputPixels` from their header, before decoding.
 *
 * Needs a browser (`createImageBitmap` and a canvas) only when it has to
 * re-encode; elsewhere that is an `unsupported` error. Every failure is a typed
 * `CopyFailure`: `too-large`, `unsupported-format`, `timeout`, `aborted`, ...
 *
 * @example
 * usePaste({ accept: ['image'], onPaste: async ({ imageFiles }) => {
 *   const image = await prepareImage(imageFiles[0], { maxWidth: 2048, maxBytes: 1_000_000 });
 *   upload(image.file);
 * } });
 */
export async function prepareImage(source: Blob, options: PrepareImageOptions = {}): Promise<PreparedImage> {
  const maxWidth = limit(options.maxWidth, Infinity, 'maxWidth');
  const maxHeight = limit(options.maxHeight, Infinity, 'maxHeight');
  const maxPixels = limit(options.maxPixels, DEFAULT_IMAGE_MAX_PIXELS, 'maxPixels');
  const maxBytes = limit(options.maxBytes, Infinity, 'maxBytes');
  const maxInputPixels = limit(options.maxInputPixels, DEFAULT_IMAGE_MAX_INPUT_PIXELS, 'maxInputPixels');
  const timeoutMs = options.timeoutMs ?? DEFAULT_IMAGE_TIMEOUT_MS;
  if (timeoutMs !== Infinity && !(typeof timeoutMs === 'number' && timeoutMs > 0 && Number.isFinite(timeoutMs))) {
    throw invalid(`\`timeoutMs\` must be > 0 or Infinity (received ${String(timeoutMs)}).`);
  }
  const quality = unit(options.quality, DEFAULT_IMAGE_QUALITY, 'quality');
  const minQuality = unit(options.minQuality, Math.min(DEFAULT_IMAGE_MIN_QUALITY, quality), 'minQuality');
  if (minQuality > quality) throw invalid('`minQuality` must not be above `quality`.');
  const requested = oneOf(options.type, ['auto', 'image/png', 'image/jpeg', 'image/webp'], 'auto', 'type');
  const animated = oneOf(options.animated, ['keep', 'first-frame', 'reject'], 'keep', 'animated');
  const keepColorProfile = flag(options.keepColorProfile, true, 'keepColorProfile');
  const background = options.background ?? '#fff';
  if (typeof background !== 'string') throw invalid('`background` must be a CSS colour string.');
  const maxInputBytes = inputLimit(options.maxInputBytes);

  return withDeadline(
    async (signal) => {
      const parsed = parse(await readBlob(source, maxInputBytes));
      const { info } = parsed;
      const original = { info, size: source.size };
      if (info.format === null && !source.type.startsWith('image/')) {
        throw copyFailure('unsupported-format', 'Not an image: the bytes match no image format and the type is not image/*.');
      }
      if (info.width !== null && info.height !== null && info.width * info.height > maxInputPixels) {
        throw copyFailure('too-large', `The image has ${String(info.width * info.height)} pixels; maxInputPixels is ${String(maxInputPixels)}.`);
      }
      if (info.animated && animated === 'reject') throw copyFailure('unsupported-format', 'Animated images are not accepted (animated: "reject").');

      const fits = (width: number | null, height: number | null): boolean =>
        width === null || height === null || (width <= maxWidth && height <= maxHeight && width * height <= maxPixels);
      // Orientations 5-8 swap width and height when displayed. Browsers apply Exif orientation to JPEG and PNG
      // (Chromium doesn't to WebP), so only those are swapped here.
      const swapped = info.orientation >= 5 && (info.format === 'jpeg' || info.format === 'png');
      const shownWidth = swapped ? info.height : info.width;
      const shownHeight = swapped ? info.width : info.height;

      // Lossless first: when only the metadata has to go, the pixels stay exactly as they are.
      const keepsType = requested === 'auto' || requested === info.mimeType;
      const keepAnimation = info.animated && animated === 'keep';
      if (keepsType && (fits(shownWidth, shownHeight) || keepAnimation)) {
        const stripped = stripParsed(parsed, source, keepColorProfile, true);
        if (stripped !== null && stripped.blob.size <= maxBytes && fits(shownWidth, shownHeight)) {
          return {
            file: stripped.blob,
            type: info.mimeType as string,
            width: shownWidth,
            height: shownHeight,
            size: stripped.blob.size,
            reencoded: false,
            resized: false,
            quality: null,
            removed: stripped.removed,
            original,
          };
        }
      }
      if (keepAnimation) {
        throw copyFailure('too-large', 'An animated image can only fit the size limits by losing its frames: use animated: "first-frame".');
      }

      const environment = options.environment ?? getDefaultImageEnvironment();
      if (environment === null) throw copyFailure('unsupported', 'Re-encoding an image needs createImageBitmap and a canvas (a browser).');
      let image: DecodedImage;
      try {
        image = await environment.decode(source, signal);
      } catch (cause) {
        throw cause instanceof CopyFailure ? cause : copyFailure('unsupported-format', 'This browser could not decode the image.', cause);
      }
      try {
        if (image.width * image.height > maxInputPixels) {
          throw copyFailure('too-large', `The image has ${String(image.width * image.height)} pixels; maxInputPixels is ${String(maxInputPixels)}.`);
        }
        const fit = Math.min(1, maxWidth / image.width, maxHeight / image.height, Math.sqrt(maxPixels / (image.width * image.height)));
        return await encodeWithin(environment, image, { info, source, requested, quality, minQuality, maxBytes, background, fit, signal, original });
      } finally {
        image.close();
      }
    },
    { timeoutMs, signal: options.signal, label: 'Preparing the image' },
  );
}

interface EncodeSettings {
  readonly info: ImageInfo;
  readonly source: Blob;
  readonly requested: 'auto' | OutputImageType;
  readonly quality: number;
  readonly minQuality: number;
  readonly maxBytes: number;
  readonly background: string;
  readonly fit: number;
  readonly signal: AbortSignal;
  readonly original: PreparedImage['original'];
}

/** Most encodes one image may take: a few quality steps at a few sizes. */
const MAX_ENCODES = 24;

/**
 * Thrown inside the search, never out of it: `unavailable` (this type can't be
 * encoded here, so 'auto' tries the next one) or `exhausted` (the encode budget is spent).
 */
class SearchSignal extends Error {
  constructor(readonly reason: 'unavailable' | 'exhausted') {
    super(reason);
  }
}

/** Finds the best result under `maxBytes`: highest quality first, then the largest size. */
async function encodeWithin(environment: ImageEnvironment, image: DecodedImage, settings: EncodeSettings): Promise<PreparedImage> {
  const { info, requested, maxBytes, signal } = settings;
  let encodes = 0;
  let smallest = Infinity;
  const encode = async (type: OutputImageType, scale: number, quality: number): Promise<Blob> => {
    if (signal.aborted) throw copyFailure('aborted', 'Preparing the image was aborted.');
    if (encodes >= MAX_ENCODES) throw new SearchSignal('exhausted');
    encodes += 1;
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    let blob: Blob;
    try {
      blob = await environment.encode(image, { width, height, type, quality, background: type === 'image/jpeg' ? settings.background : null }, signal);
    } catch (cause) {
      throw cause instanceof CopyFailure ? cause : copyFailure('blob-generation-failed', `Encoding ${type} failed.`, cause);
    }
    if (blob.type !== type) {
      if (requested !== 'auto') throw copyFailure('unsupported-format', `This browser can't encode ${type}.`);
      throw new SearchSignal('unavailable');
    }
    smallest = Math.min(smallest, blob.size);
    return blob;
  };
  const done = async (blob: Blob, type: OutputImageType, scale: number, quality: number | null): Promise<PreparedImage> => {
    const written = parse(new Bytes(new Uint8Array(await blob.arrayBuffer()))).info;
    const name = renamed(settings.source, type);
    const file =
      typeof File === 'function' && name !== undefined
        ? new File([blob], name, { type, lastModified: (settings.source as Partial<File>).lastModified ?? Date.now() })
        : blob;
    return {
      file,
      type,
      width: Math.max(1, Math.round(image.width * scale)),
      height: Math.max(1, Math.round(image.height * scale)),
      size: blob.size,
      reencoded: true,
      resized: scale < 1,
      quality,
      // Read from the output, not assumed: some encoders add their own colour profile.
      removed: METADATA_KINDS.filter((kind) => info.metadata.includes(kind) && !written.metadata.includes(kind)),
      original: settings.original,
    };
  };
  /** Shrinks the scale by what the bytes say, between 50 % and 90 % per step. */
  const shrink = (scale: number, size: number): number => scale * Math.max(0.5, Math.min(0.9, Math.sqrt(maxBytes / size) * 0.95));

  /** One output type: the best fit, or `null` when it can't fit. */
  const search = async (type: OutputImageType): Promise<PreparedImage | null> => {
    let scale = settings.fit;
    if (LOSSLESS.has(type)) {
      // 'auto' tries a lossless format once, at full size, before going lossy.
      for (let attempt = 0; attempt < (requested === 'auto' ? 1 : 8); attempt += 1) {
        const blob = await encode(type, scale, settings.quality);
        if (blob.size <= maxBytes) return done(blob, type, scale, null);
        scale = shrink(scale, blob.size);
      }
      return null;
    }
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const top = await encode(type, scale, settings.quality);
      if (top.size <= maxBytes) return done(top, type, scale, settings.quality);
      let low = settings.minQuality;
      let high = settings.quality;
      const floor = await encode(type, scale, low);
      if (floor.size > maxBytes) {
        scale = shrink(scale, floor.size);
        continue;
      }
      // Binary search for the highest quality that fits.
      let best = { blob: floor, quality: low };
      for (let step = 0; step < 4 && high - low > 0.02 && encodes < MAX_ENCODES; step += 1) {
        const middle = Math.round(((low + high) / 2) * 100) / 100;
        const blob = await encode(type, scale, middle);
        if (blob.size <= maxBytes) {
          best = { blob, quality: middle };
          low = middle;
        } else {
          high = middle;
        }
      }
      return done(best.blob, type, scale, best.quality);
    }
    return null;
  };

  for (const type of candidates(requested, info)) {
    try {
      const result = await search(type);
      if (result !== null) return result;
    } catch (signalled) {
      if (!(signalled instanceof SearchSignal)) throw signalled;
      if (signalled.reason === 'exhausted') break;
    }
  }
  throw copyFailure(
    'too-large',
    smallest === Infinity
      ? 'No output format could be encoded here.'
      : `Could not get the image under maxBytes (${String(maxBytes)}); the smallest result was ${String(smallest)} bytes.`,
  );
}
