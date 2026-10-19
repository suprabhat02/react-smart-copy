import { describe, expectTypeOf, it } from 'vitest';
import type { ImagePayload } from '../../src/core/payload';
import {
  DEFAULT_CAPTURE_SCALE,
  DEFAULT_CAPTURE_TIMEOUT_MS,
  DEFAULT_MAX_PIXELS,
  DEFAULT_MAX_SVG_LENGTH,
  MAX_CAPTURE_SCALE,
  SVG_NAMESPACE,
  captureElement,
  captureImage,
  captureSource,
  ensureSvgNamespace,
  getDefaultCaptureEnvironment,
  readSvgSize,
  svgToPngBlob,
  type CanvasLike,
  type CaptureElementOptions,
  type CaptureEnvironment,
  type RasterizeContext,
  type RasterizeOutput,
  type Rasterizer,
  type RenderOptions,
  type Size,
  type SvgToPngOptions,
} from '../../src/capture';

describe('capture types', () => {
  it('captures to a PNG Blob, or to an image payload for copying', () => {
    expectTypeOf(captureElement).parameter(0).toEqualTypeOf<Element | null | undefined>();
    expectTypeOf(captureElement(document.body)).toEqualTypeOf<Promise<Blob>>();
    expectTypeOf(captureSource(() => null)).returns.toEqualTypeOf<Promise<Blob>>();
    expectTypeOf(captureImage(() => document.body, { scale: 3 })).toEqualTypeOf<ImagePayload>();
    expectTypeOf(svgToPngBlob('<svg/>', { maxLength: 100 })).toEqualTypeOf<Promise<Blob>>();
    expectTypeOf(svgToPngBlob).parameter(0).toEqualTypeOf<Element | string>();
  });

  it('accepts every documented option, and nothing else', () => {
    const controller = new AbortController();
    expectTypeOf({
      width: 100,
      height: 50,
      scale: 2,
      background: null,
      maxPixels: 1000,
      timeoutMs: Infinity,
      signal: controller.signal,
    }).toExtend<RenderOptions>();
    expectTypeOf<CaptureElementOptions>().toExtend<RenderOptions>();
    expectTypeOf<SvgToPngOptions>().toExtend<RenderOptions>();
    // @ts-expect-error: options are typed, so a misspelt one is an error.
    void captureElement(document.body, { scal: 2 });
    // @ts-expect-error: the background is a CSS colour string or null.
    void captureElement(document.body, { background: 0xffffff });
  });

  it('types the rasteriser contract', () => {
    expectTypeOf<Rasterizer>().parameters.toEqualTypeOf<[Element, RasterizeContext]>();
    expectTypeOf<Rasterizer>().returns.toEqualTypeOf<PromiseLike<RasterizeOutput> | RasterizeOutput>();
    expectTypeOf<RasterizeOutput>().toEqualTypeOf<Blob | CanvasLike | string>();
    expectTypeOf<RasterizeContext>().toEqualTypeOf<{
      readonly scale: number;
      readonly width: number;
      readonly height: number;
      readonly backgroundColor: string | null;
      readonly signal: AbortSignal;
    }>();
    // A canvas qualifies as it is.
    expectTypeOf<HTMLCanvasElement>().toExtend<CanvasLike>();
    const rasterize: Rasterizer = (_node, { scale }) => `data:image/png;base64,${String(scale)}`;
    expectTypeOf(captureImage(() => null, { rasterize })).toEqualTypeOf<ImagePayload>();
  });

  it('exports the limits as numbers and the helpers with exact types', () => {
    expectTypeOf([DEFAULT_CAPTURE_SCALE, MAX_CAPTURE_SCALE, DEFAULT_MAX_PIXELS, DEFAULT_CAPTURE_TIMEOUT_MS, DEFAULT_MAX_SVG_LENGTH]).toEqualTypeOf<number[]>();
    expectTypeOf(SVG_NAMESPACE).toBeString();
    expectTypeOf(readSvgSize('<svg/>')).toEqualTypeOf<Size | null>();
    expectTypeOf(ensureSvgNamespace('<svg/>')).toBeString();
    expectTypeOf(getDefaultCaptureEnvironment()).toEqualTypeOf<CaptureEnvironment | null>();
  });
});
