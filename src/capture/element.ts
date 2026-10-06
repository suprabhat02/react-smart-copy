import { copyFailure } from '../core/errors';
import type { OperationContext } from '../core/machine-shared';
import { SVG_MIME_TYPE } from '../core/mime';
import { isBlob, type ImagePayload } from '../core/payload';
import { withDeadline } from './deadline';
import { resolveCaptureEnvironment, type CaptureEnvironment } from './environment';
import {
  resolveRenderSettings,
  resolveSize,
  toPixelSize,
  type RenderOptions,
  type RenderSettings,
  type Size,
} from './options';
import { classifyCaptureError, ensurePng } from './render';
import { svgToPngBlob } from './svg';

/** Anything with `canvas.toBlob()`: `HTMLCanvasElement`, or a compatible object. */
export interface CanvasLike {
  toBlob(callback: (blob: Blob | null) => void, type?: string, quality?: number): void;
}

/**
 * What a rasteriser may return: a Blob (any raster format), a canvas, or a
 * base64 `data:image/…` URL. Network URLs are refused (never fetched).
 */
export type RasterizeOutput = Blob | CanvasLike | string;

export interface RasterizeContext {
  /** Pixel density to render at. */
  readonly scale: number;
  /** CSS size of the element (or the requested size). */
  readonly width: number;
  readonly height: number;
  readonly backgroundColor: string | null;
  /** Fires on timeout or caller abort: stop work early if you can. */
  readonly signal: AbortSignal;
}

/**
 * Turns a DOM node into pixels. Bring your own engine, e.g.
 * `(node, { scale }) => domToBlob(node, { scale })` from `modern-screenshot`.
 */
export type Rasterizer = (node: Element, context: RasterizeContext) => PromiseLike<RasterizeOutput> | RasterizeOutput;

export interface CaptureElementOptions extends RenderOptions {
  /** Required for HTML elements. `<svg>` elements are rasterised natively when omitted. */
  readonly rasterize?: Rasterizer;
}

const LABEL = 'Element capture';
const DATA_URL = /^data:(image\/[a-z0-9.+-]+)((?:;[a-z0-9-]+=[a-z0-9.+-]+)*)(;base64)?,/i;

function decodeBase64(payload: string, type: string): Blob {
  let binary: string;
  try {
    binary = atob(payload);
  } catch (cause) {
    throw copyFailure('blob-generation-failed', 'The rasteriser returned malformed base64.', cause);
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type });
}

function canvasToBlob(canvas: CanvasLike): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(copyFailure('blob-generation-failed', 'canvas.toBlob() produced nothing.'));
    }, 'image/png');
  });
}

const isCanvasLike = (value: unknown): value is CanvasLike =>
  typeof value === 'object' && value !== null && typeof (value as { toBlob?: unknown }).toBlob === 'function';

async function toPng(
  output: unknown,
  options: CaptureElementOptions,
  settings: RenderSettings,
  size: Size,
  signal: AbortSignal,
): Promise<Blob> {
  const environment = (): CaptureEnvironment => resolveCaptureEnvironment(options.environment);

  if (isBlob(output)) return ensurePng(output, settings, environment, signal, LABEL);
  if (isCanvasLike(output)) return ensurePng(await canvasToBlob(output), settings, environment, signal, LABEL);
  if (typeof output !== 'string') {
    throw copyFailure('blob-generation-failed', 'The rasteriser must return a Blob, a canvas or a data:image URL.');
  }

  const match = DATA_URL.exec(output);
  if (match === null) {
    throw copyFailure('blob-generation-failed', 'The rasteriser returned a string that is not a data:image URL.');
  }
  const type = String(match[1]).toLowerCase();
  const base64 = match[3] !== undefined;
  const body = output.slice(match[0].length);

  if (type === SVG_MIME_TYPE) {
    // e.g. modern-screenshot's domToSvg: rasterise it natively at the element's size.
    const markup = base64 ? await decodeBase64(body, type).text() : decodeURIComponent(body);
    return svgToPngBlob(markup, {
      ...settings,
      width: size.width,
      height: size.height,
      signal,
      environment: environment(),
    });
  }
  if (!base64) throw copyFailure('blob-generation-failed', 'Raster data URLs must be base64-encoded.');
  return ensurePng(decodeBase64(body, type), settings, environment, signal, LABEL);
}

/**
 * Captures an element as a PNG Blob, ready for `copy({ kind: 'image', blob })`.
 * Output is verified to be a real PNG within `maxPixels`, or a classified
 * `CopyFailure` is thrown (`invalid-payload`, `unsupported`, `too-large`,
 * `timeout`, `aborted`, `blob-generation-failed`).
 */
export async function captureElement(node: Element | null | undefined, options: CaptureElementOptions = {}): Promise<Blob> {
  if (!node) throw copyFailure('invalid-payload', 'There is no element to capture (is the ref attached yet?).');

  const { rasterize } = options;
  if (!rasterize) {
    if (node.localName === 'svg') return svgToPngBlob(node, options);
    throw copyFailure(
      'unsupported',
      'Capturing HTML needs a `rasterize` function, e.g. `domToBlob` from modern-screenshot. Only <svg> works without one.',
    );
  }

  const settings = resolveRenderSettings(options);
  const rect = node.getBoundingClientRect();
  const intrinsic = rect.width > 0 && rect.height > 0 ? { width: rect.width, height: rect.height } : null;
  const size = resolveSize(intrinsic, options.width, options.height);
  toPixelSize(size, settings); // Refuse before rendering anything.

  try {
    return await withDeadline(
      async (signal) => {
        const output = await rasterize(node, {
          scale: settings.scale,
          width: size.width,
          height: size.height,
          backgroundColor: settings.background,
          signal,
        });
        return toPng(output, options, settings, size, signal);
      },
      { timeoutMs: settings.timeoutMs, signal: options.signal, label: LABEL },
    );
  } catch (cause) {
    throw classifyCaptureError(cause, LABEL);
  }
}

/**
 * A lazy `BlobSource` for `copy()`. Resolving the element at click time and
 * starting inside the gesture keeps Safari happy. Rasterising stops when the
 * copy is reset or its component unmounts, or when `options.signal` aborts.
 *
 * @example copy({ kind: 'image', blob: captureSource(() => cardRef.current, { rasterize }) })
 */
export function captureSource(
  getNode: () => Element | null | undefined,
  options: CaptureElementOptions = {},
): (context?: OperationContext) => Promise<Blob> {
  return (context) => {
    const a = options.signal;
    const b = context?.signal;
    if (!a || !b) {
      const signal = a ?? b;
      return captureElement(getNode(), signal ? { ...options, signal } : options);
    }
    const any = (AbortSignal as { any?: (signals: AbortSignal[]) => AbortSignal }).any;
    if (typeof any === 'function') return captureElement(getNode(), { ...options, signal: any([a, b]) });

    // Older browsers: forward both, and detach once settled so a long-lived
    // caller signal doesn't accumulate a listener per copy.
    const controller = new AbortController();
    const onAbortA = (): void => {
      controller.abort(a.reason);
    };
    const onAbortB = (): void => {
      controller.abort(b.reason);
    };
    if (a.aborted) onAbortA();
    else if (b.aborted) onAbortB();
    a.addEventListener('abort', onAbortA);
    b.addEventListener('abort', onAbortB);
    return captureElement(getNode(), { ...options, signal: controller.signal }).finally(() => {
      a.removeEventListener('abort', onAbortA);
      b.removeEventListener('abort', onAbortB);
    });
  };
}

/** Shorthand for `{ kind: 'image', blob: captureSource(getNode, options) }`. */
export function captureImage(
  getNode: () => Element | null | undefined,
  options: CaptureElementOptions = {},
): ImagePayload {
  return { kind: 'image', blob: captureSource(getNode, options) };
}
