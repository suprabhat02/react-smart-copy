import { copyFailure } from '../core/errors';
import type { CaptureEnvironment } from './environment';

export const DEFAULT_CAPTURE_SCALE = 2;
export const MAX_CAPTURE_SCALE = 10;
/** 4096 × 4096: the canvas area limit of Safari/iOS, the strictest mainstream engine. */
export const DEFAULT_MAX_PIXELS = 16_777_216;
export const DEFAULT_CAPTURE_TIMEOUT_MS = 15_000;

export interface RenderOptions {
  /** Output width in CSS px (before `scale`). Omit to use the intrinsic size; set one side to keep the aspect ratio. */
  readonly width?: number;
  /** Output height in CSS px (before `scale`). */
  readonly height?: number;
  /** Pixel density multiplier, e.g. `window.devicePixelRatio`. Default 2 (crisp on HiDPI). Max 10. */
  readonly scale?: number;
  /** CSS colour under the image. Default `null` (transparent). */
  readonly background?: string | null;
  /** Refuse outputs larger than this many pixels (memory / DoS guard). Default 16 777 216. */
  readonly maxPixels?: number;
  /** Give up after this long. Default 15 000 ms. `Infinity` disables. */
  readonly timeoutMs?: number;
  /** Cancel the capture. */
  readonly signal?: AbortSignal;
  /** Platform hooks. Defaults to the DOM. */
  readonly environment?: CaptureEnvironment;
}

export interface RenderSettings {
  readonly scale: number;
  readonly background: string | null;
  readonly maxPixels: number;
  readonly timeoutMs: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

const invalid = (message: string) => copyFailure('invalid-payload', message);

const isPositiveFinite = (value: number): boolean => Number.isFinite(value) && value > 0;

export function resolveRenderSettings(options: RenderOptions): RenderSettings {
  const scale = options.scale ?? DEFAULT_CAPTURE_SCALE;
  if (!isPositiveFinite(scale) || scale > MAX_CAPTURE_SCALE) {
    throw invalid(`\`scale\` must be > 0 and <= ${String(MAX_CAPTURE_SCALE)} (received ${String(scale)}).`);
  }
  const maxPixels = options.maxPixels ?? DEFAULT_MAX_PIXELS;
  if (!Number.isInteger(maxPixels) || maxPixels <= 0) {
    throw invalid(`\`maxPixels\` must be a positive integer (received ${String(maxPixels)}).`);
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_CAPTURE_TIMEOUT_MS;
  if (timeoutMs !== Infinity && !isPositiveFinite(timeoutMs)) {
    throw invalid(`\`timeoutMs\` must be > 0 or Infinity (received ${String(timeoutMs)}).`);
  }
  return { scale, background: options.background ?? null, maxPixels, timeoutMs };
}

/** Combines explicit `width`/`height` with an intrinsic size, keeping the aspect ratio when only one is set. */
export function resolveSize(intrinsic: Size | null, width: number | undefined, height: number | undefined): Size {
  for (const [name, value] of [
    ['width', width],
    ['height', height],
  ] as const) {
    if (value !== undefined && !isPositiveFinite(value)) {
      throw invalid(`\`${name}\` must be a positive number (received ${String(value)}).`);
    }
  }
  if (width !== undefined && height !== undefined) return { width, height };
  if (intrinsic === null) {
    throw invalid('The size to render is unknown: pass `width` and `height`, or give the source a size.');
  }
  if (width !== undefined) return { width, height: (width * intrinsic.height) / intrinsic.width };
  if (height !== undefined) return { width: (height * intrinsic.width) / intrinsic.height, height };
  return intrinsic;
}

/** Integer pixel size after scaling. Throws `too-large` past `maxPixels`. */
export function toPixelSize(size: Size, settings: Pick<RenderSettings, 'scale' | 'maxPixels'>): Size {
  const width = Math.max(1, Math.round(size.width * settings.scale));
  const height = Math.max(1, Math.round(size.height * settings.scale));
  assertPixelBudget(width, height, settings.maxPixels);
  return { width, height };
}

export function assertPixelBudget(width: number, height: number, maxPixels: number): void {
  if (width * height > maxPixels) {
    throw copyFailure(
      'too-large',
      `A ${String(width)}×${String(height)} image exceeds the ${String(maxPixels)}-pixel limit. Lower \`scale\` or raise \`maxPixels\`.`,
    );
  }
}
