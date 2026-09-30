import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MAX_SVG_LENGTH,
  captureElement,
  captureImage,
  captureSource,
  ensureSvgNamespace,
  readSvgSize,
  svgToPngBlob,
  type Rasterizer,
} from '../src/capture';
import { createCopyMachine } from '../src/core/copy-machine';
import { failureType, fakeEnvironment, jpegBlob, pngBlob, pngBytes } from './fixtures';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgElement(width: number, height: number): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.getBoundingClientRect = () => ({ width, height }) as DOMRect;
  return svg;
}

function htmlElement(width: number, height: number): HTMLDivElement {
  const div = document.createElement('div');
  div.getBoundingClientRect = () => ({ width, height }) as DOMRect;
  return div;
}

const base64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));

afterEach(() => {
  vi.useRealTimers();
});

describe('readSvgSize', () => {
  it.each([
    ['<svg width="20" height="10">', { width: 20, height: 10 }],
    ["<svg width='20px' height=' 10.5 '>", { width: 20, height: 10.5 }],
    ['<svg viewBox="0 0 40 20">', { width: 40, height: 20 }],
    ['<svg viewBox="0,0,40,20" width="80">', { width: 80, height: 40 }],
    ['<svg viewBox="0 0 40 20" height="10">', { width: 20, height: 10 }],
    ['<svg width="100%" height="10" viewBox="0 0 4 2">', { width: 20, height: 10 }],
    ['<?xml version="1.0"?><!-- c --><SVG WIDTH=".5" HEIGHT="2">', { width: 0.5, height: 2 }],
  ])('%s', (markup, expected) => {
    expect(readSvgSize(markup)).toEqual(expected);
  });

  it.each([
    '<div>',
    '<svg',
    '<svg>',
    '<svg width="10">',
    '<svg width="0" height="10">',
    '<svg viewBox="0 0 10">',
    '<svg viewBox="0 0 0 10">',
    '<svg viewBox="0 0 10 -1">',
    '<svg viewBox="a b c d">',
  ])('unknown for %s', (markup) => {
    expect(readSvgSize(markup)).toBeNull();
  });

  it('is linear-time on hostile input', () => {
    const hostile = `<svg width="${'1'.repeat(200_000)}x" ${'<svg'.repeat(50_000)}`;
    const started = performance.now();
    readSvgSize(hostile);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe('ensureSvgNamespace', () => {
  it('adds the namespace only when missing', () => {
    expect(ensureSvgNamespace('<svg width="1"></svg>')).toBe(`<svg xmlns="${SVG_NS}" width="1"></svg>`);
    const namespaced = `<svg xmlns="${SVG_NS}"></svg>`;
    expect(ensureSvgNamespace(namespaced)).toBe(namespaced);
  });

  it('throws invalid-payload without an <svg> root', async () => {
    expect(await failureType(Promise.resolve().then(() => ensureSvgNamespace('<div></div>')))).toBe('invalid-payload');
  });
});

describe('svgToPngBlob', () => {
  it('rasterises markup at its intrinsic size × scale, as an image, then revokes the URL', async () => {
    const { environment, encoded, revoked } = fakeEnvironment();
    const createObjectURL = vi.spyOn(environment, 'createObjectURL');
    const blob = await svgToPngBlob('<svg width="10" height="5"></svg>', { environment });
    expect(blob.type).toBe('image/png');
    expect(encoded).toEqual([{ width: 20, height: 10, background: null }]);
    const [svgBlob] = createObjectURL.mock.calls[0] ?? [];
    expect(svgBlob?.type).toBe('image/svg+xml');
    expect(await svgBlob?.text()).toContain(`xmlns="${SVG_NS}"`);
    expect(revoked).toHaveLength(1);
  });

  it('uses the element’s rendered size, explicit sizes, scale and background', async () => {
    const { environment, encoded } = fakeEnvironment();
    await svgToPngBlob(svgElement(30, 15), { environment, scale: 1, background: '#fff' });
    await svgToPngBlob(svgElement(30, 15), { environment, scale: 1, width: 60 });
    expect(encoded).toEqual([
      { width: 30, height: 15, background: '#fff' },
      { width: 60, height: 30, background: null },
    ]);
  });

  it('falls back to markup size for unrendered elements', async () => {
    const { encoded, environment } = fakeEnvironment({ serializeSvg: () => '<svg viewBox="0 0 8 4"/>' });
    await svgToPngBlob(svgElement(0, 0), { environment, scale: 1 });
    expect(encoded[0]).toMatchObject({ width: 8, height: 4 });
  });

  it('rejects non-svg elements, oversized markup, unknown sizes and pixel overruns', async () => {
    const { environment } = fakeEnvironment();
    expect(await failureType(svgToPngBlob(document.createElement('div'), { environment }))).toBe('invalid-payload');
    expect(await failureType(svgToPngBlob('<svg width="1" height="1">', { environment, maxLength: 5 }))).toBe('too-large');
    expect(await failureType(svgToPngBlob('<svg></svg>', { environment }))).toBe('invalid-payload');
    expect(await failureType(svgToPngBlob('<svg width="5000" height="5000"/>', { environment }))).toBe('too-large');
    expect(DEFAULT_MAX_SVG_LENGTH).toBe(10_000_000);
  });

  it('honours timeouts and abort signals', async () => {
    vi.useFakeTimers();
    const { environment, revoked } = fakeEnvironment({ loadImage: () => new Promise(() => undefined) });
    const promise = svgToPngBlob('<svg width="1" height="1"/>', { environment, timeoutMs: 100 });
    vi.advanceTimersByTime(100);
    expect(await failureType(promise)).toBe('timeout');
    expect(revoked).toHaveLength(1);
    expect(
      await failureType(svgToPngBlob('<svg width="1" height="1"/>', { environment, signal: AbortSignal.abort() })),
    ).toBe('aborted');
  });
});

describe('captureElement', () => {
  const rasterizeTo = (output: unknown): Rasterizer => vi.fn(() => output as Blob);

  it('rejects a missing node and HTML without a rasteriser', async () => {
    expect(await failureType(captureElement(null))).toBe('invalid-payload');
    expect(await failureType(captureElement(htmlElement(1, 1)))).toBe('unsupported');
  });

  it('rasterises <svg> natively when no rasteriser is given', async () => {
    const { environment, encoded } = fakeEnvironment();
    await captureElement(svgElement(10, 10), { environment, scale: 1 });
    expect(encoded[0]).toMatchObject({ width: 10, height: 10 });
  });

  it('passes size, scale, background and a signal to the rasteriser and returns its PNG', async () => {
    const png = pngBlob(20, 10);
    const rasterize = vi.fn<Rasterizer>(() => Promise.resolve(png));
    const result = await captureElement(htmlElement(10, 5), { rasterize, background: '#000' });
    expect(result).toBe(png);
    expect(rasterize).toHaveBeenCalledWith(expect.any(HTMLDivElement), {
      scale: 2,
      width: 10,
      height: 5,
      backgroundColor: '#000',
      signal: expect.any(AbortSignal),
    });
  });

  it('accepts canvases, base64 raster data URLs and SVG data URLs', async () => {
    const { environment, encoded } = fakeEnvironment();
    const canvas = {
      toBlob: (callback: (blob: Blob | null) => void, type?: string) => {
        callback(pngBlob(4, 4, type));
      },
    };
    expect((await captureElement(htmlElement(2, 2), { rasterize: rasterizeTo(canvas) })).type).toBe('image/png');

    const pngUrl = `data:image/png;base64,${base64(pngBytes(4, 4))}`;
    expect((await captureElement(htmlElement(2, 2), { rasterize: rasterizeTo(pngUrl) })).type).toBe('image/png');

    const jpegUrl = `data:image/jpeg;name=x;base64,${base64(new Uint8Array(await jpegBlob().arrayBuffer()))}`;
    await captureElement(htmlElement(2, 2), { rasterize: rasterizeTo(jpegUrl), environment });
    expect(encoded).toHaveLength(1); // re-encoded to PNG

    const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg width="2" height="2"/>')}`;
    await captureElement(htmlElement(3, 3), { rasterize: rasterizeTo(svgUrl), environment });
    const svgBase64 = `data:image/svg+xml;base64,${btoa('<svg width="2" height="2"/>')}`;
    await captureElement(htmlElement(3, 3), { rasterize: rasterizeTo(svgBase64), environment, scale: 1 });
    expect(encoded.slice(1)).toEqual([
      { width: 6, height: 6, background: null },
      { width: 3, height: 3, background: null },
    ]);
  });

  it.each([
    ['a network URL', 'https://evil.example/pixel.png'],
    ['a non-image data URL', 'data:text/html;base64,PGgxPg=='],
    ['a percent-encoded raster data URL', 'data:image/png,%89PNG'],
    ['malformed base64', 'data:image/png;base64,!!!'],
    ['a number', 42],
    ['null', null],
    ['a non-image blob', new Blob(['<html>'], { type: 'image/png' })],
  ])('rejects %s', async (_label, output) => {
    expect(await failureType(captureElement(htmlElement(2, 2), { rasterize: rasterizeTo(output) }))).toBe(
      'blob-generation-failed',
    );
  });

  it('rejects canvases that produce nothing and wraps rasteriser crashes', async () => {
    const empty = {
      toBlob: (callback: (blob: Blob | null) => void) => {
        callback(null);
      },
    };
    expect(await failureType(captureElement(htmlElement(2, 2), { rasterize: rasterizeTo(empty) }))).toBe(
      'blob-generation-failed',
    );
    const crash: Rasterizer = () => {
      throw new TypeError('font loading failed');
    };
    await expect(captureElement(htmlElement(2, 2), { rasterize: crash })).rejects.toMatchObject({
      copyError: { type: 'blob-generation-failed', cause: expect.any(TypeError) },
    });
  });

  it('refuses oversized elements before rendering, and oversized outputs after', async () => {
    const rasterize = vi.fn<Rasterizer>(() => pngBlob());
    expect(await failureType(captureElement(htmlElement(5000, 5000), { rasterize }))).toBe('too-large');
    expect(rasterize).not.toHaveBeenCalled();
    expect(await failureType(captureElement(htmlElement(10, 10), { rasterize: rasterizeTo(pngBlob(9000, 9000)) }))).toBe(
      'too-large',
    );
  });

  it('needs a size for unrendered elements, and uses explicit ones', async () => {
    const rasterize = vi.fn<Rasterizer>(() => pngBlob());
    expect(await failureType(captureElement(htmlElement(0, 0), { rasterize }))).toBe('invalid-payload');
    await captureElement(htmlElement(0, 0), { rasterize, width: 8, height: 4 });
    expect(rasterize).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ width: 8, height: 4 }));
  });

  it('times out slow rasterisers and aborts their signal', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const rasterize: Rasterizer = (_node, context) => {
      signal = context.signal;
      return new Promise(() => undefined);
    };
    const promise = captureElement(htmlElement(2, 2), { rasterize, timeoutMs: 1000 });
    vi.advanceTimersByTime(1000);
    expect(await failureType(promise)).toBe('timeout');
    expect(signal?.aborted).toBe(true);
  });
});

describe('captureSource / captureImage', () => {
  it('resolves the node lazily and plugs into copy()', async () => {
    const png = pngBlob();
    let node: Element | null = null;
    const source = captureSource(() => node, { rasterize: () => png });
    expect(await failureType(source())).toBe('invalid-payload');
    node = htmlElement(1, 1);
    expect(await source()).toBe(png);

    const written: unknown[] = [];
    const machine = createCopyMachine({
      adapter: {
        write: async (payload) => {
          written.push(payload.kind === 'image' && typeof payload.blob === 'function' ? await payload.blob() : payload);
        },
      },
    });
    await machine.copy(captureImage(() => node, { rasterize: () => png }));
    expect(written).toEqual([png]);
    expect(captureImage(() => node)).toMatchObject({ kind: 'image', blob: expect.any(Function) });
    expect(typeof captureSource(() => node)).toBe('function');
  });
});
