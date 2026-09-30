import { afterEach, describe, expect, it, vi } from 'vitest';
import { withDeadline } from '../src/capture/deadline';
import { getDefaultCaptureEnvironment, resolveCaptureEnvironment } from '../src/capture/environment';
import {
  DEFAULT_CAPTURE_SCALE,
  DEFAULT_CAPTURE_TIMEOUT_MS,
  DEFAULT_MAX_PIXELS,
  resolveRenderSettings,
  resolveSize,
  toPixelSize,
} from '../src/capture/options';
import { classifyCaptureError, drawBlobToPng, ensurePng, readPngSize } from '../src/capture/render';
import { copyFailure } from '../src/core/errors';
import { failureType, fakeEnvironment, jpegBlob, pngBlob, pngBytes } from './fixtures';

const syncFailureType = (fn: () => unknown): Promise<string> => failureType(Promise.resolve().then(fn));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('withDeadline', () => {
  it('resolves with the task value and passes it a live signal', async () => {
    let received: AbortSignal | undefined;
    const value = await withDeadline(
      (signal) => {
        received = signal;
        return 7;
      },
      { timeoutMs: 1000, label: 'Task' },
    );
    expect(value).toBe(7);
    expect(received?.aborted).toBe(false);
  });

  it('propagates task failures unchanged (sync throw or rejection)', async () => {
    const boom = new Error('boom');
    await expect(
      withDeadline(
        () => {
          throw boom;
        },
        { timeoutMs: Infinity, label: 'Task' },
      ),
    ).rejects.toBe(boom);
    await expect(withDeadline(() => Promise.reject(boom), { timeoutMs: 10, label: 'Task' })).rejects.toBe(boom);
  });

  it('times out with a classified failure and aborts the task signal', async () => {
    vi.useFakeTimers();
    let received: AbortSignal | undefined;
    const promise = withDeadline(
      (signal) => {
        received = signal;
        return new Promise<never>(() => undefined);
      },
      { timeoutMs: 50, label: 'Slow task' },
    );
    vi.advanceTimersByTime(50);
    await expect(promise).rejects.toMatchObject({ copyError: { type: 'timeout', message: 'Slow task timed out after 50 ms.' } });
    expect(received?.aborted).toBe(true);
  });

  it('rejects immediately when already aborted, and on a later abort', async () => {
    const aborted = AbortSignal.abort('stop');
    const task = vi.fn();
    expect(await failureType(withDeadline(task, { timeoutMs: 10, signal: aborted, label: 'Task' }))).toBe('aborted');
    expect(task).not.toHaveBeenCalled();

    const controller = new AbortController();
    const promise = withDeadline(() => new Promise<never>(() => undefined), {
      timeoutMs: Infinity,
      signal: controller.signal,
      label: 'Task',
    });
    controller.abort('user');
    await expect(promise).rejects.toMatchObject({ copyError: { type: 'aborted', cause: 'user' } });
  });

  it('removes the abort listener after settling', async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    await withDeadline(() => 1, { timeoutMs: 10, signal: controller.signal, label: 'Task' });
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });
});

describe('render options', () => {
  it('has safe defaults', () => {
    expect(resolveRenderSettings({})).toEqual({
      scale: DEFAULT_CAPTURE_SCALE,
      background: null,
      maxPixels: DEFAULT_MAX_PIXELS,
      timeoutMs: DEFAULT_CAPTURE_TIMEOUT_MS,
    });
    expect(resolveRenderSettings({ timeoutMs: Infinity, background: '#fff', scale: 1, maxPixels: 4 })).toEqual({
      scale: 1,
      background: '#fff',
      maxPixels: 4,
      timeoutMs: Infinity,
    });
  });

  it.each([{ scale: 0 }, { scale: 11 }, { scale: NaN }, { maxPixels: 0 }, { maxPixels: 1.5 }, { timeoutMs: 0 }, { timeoutMs: NaN }])(
    'rejects %j',
    async (options) => {
      expect(await syncFailureType(() => resolveRenderSettings(options))).toBe('invalid-payload');
    },
  );

  it('resolveSize keeps the aspect ratio when one side is given', () => {
    const intrinsic = { width: 200, height: 100 };
    expect(resolveSize(intrinsic, undefined, undefined)).toEqual(intrinsic);
    expect(resolveSize(intrinsic, 100, undefined)).toEqual({ width: 100, height: 50 });
    expect(resolveSize(intrinsic, undefined, 50)).toEqual({ width: 100, height: 50 });
    expect(resolveSize(null, 10, 20)).toEqual({ width: 10, height: 20 });
  });

  it('resolveSize rejects unknown sizes and invalid dimensions', async () => {
    expect(await syncFailureType(() => resolveSize(null, 10, undefined))).toBe('invalid-payload');
    expect(await syncFailureType(() => resolveSize(null, -1, 10))).toBe('invalid-payload');
    expect(await syncFailureType(() => resolveSize(null, 10, Infinity))).toBe('invalid-payload');
  });

  it('toPixelSize rounds, never returns 0, and enforces maxPixels', async () => {
    expect(toPixelSize({ width: 10.4, height: 0.1 }, { scale: 2, maxPixels: 100 })).toEqual({ width: 21, height: 1 });
    expect(await syncFailureType(() => toPixelSize({ width: 10, height: 10 }, { scale: 2, maxPixels: 399 }))).toBe('too-large');
  });
});

describe('render helpers', () => {
  const settings = resolveRenderSettings({ maxPixels: 10_000 });

  it('classifyCaptureError keeps classified failures and wraps the rest', () => {
    const failure = copyFailure('timeout', 't');
    expect(classifyCaptureError(failure, 'X')).toBe(failure);
    expect(classifyCaptureError(new Error('raw'), 'X')).toMatchObject({ copyError: { type: 'blob-generation-failed' } });
  });

  it('drawBlobToPng decodes, re-encodes at the target (or natural) size and always revokes the URL', async () => {
    const { environment, revoked, encoded } = fakeEnvironment();
    await drawBlobToPng(jpegBlob(), { width: 20, height: 10 }, settings, environment, undefined, 'X');
    await drawBlobToPng(jpegBlob(), null, settings, environment, undefined, 'X');
    expect(encoded).toEqual([
      { width: 20, height: 10, background: null },
      { width: 100, height: 50, background: null },
    ]);
    expect(revoked).toEqual(['blob:fake/0', 'blob:fake/1']);
  });

  it('drawBlobToPng classifies decode errors and pixel overruns, still revoking', async () => {
    const decodeFails = fakeEnvironment({ loadImage: () => Promise.reject(new Error('bad image')) });
    expect(await failureType(drawBlobToPng(jpegBlob(), null, settings, decodeFails.environment, undefined, 'X'))).toBe(
      'blob-generation-failed',
    );
    expect(decodeFails.revoked).toHaveLength(1);

    const huge = fakeEnvironment({ loadImage: () => Promise.resolve({ source: 1, width: 1000, height: 1000 }) });
    expect(await failureType(drawBlobToPng(jpegBlob(), null, settings, huge.environment, undefined, 'X'))).toBe('too-large');
  });

  it('readPngSize reads IHDR and refuses truncated data', async () => {
    expect(await readPngSize(pngBlob(640, 480))).toEqual({ width: 640, height: 480 });
    expect(await readPngSize(new Blob([pngBytes().slice(0, 20)]))).toBeNull();
  });

  it('ensurePng passes real PNGs through, fixes their type, and re-encodes other rasters', async () => {
    const { environment, encoded } = fakeEnvironment();
    const env = () => environment;
    const png = pngBlob(10, 10);
    expect(await ensurePng(png, settings, env, undefined, 'X')).toBe(png);
    const mistyped = await ensurePng(pngBlob(10, 10, ''), settings, env, undefined, 'X');
    expect(mistyped.type).toBe('image/png');
    await ensurePng(jpegBlob(), settings, env, undefined, 'X');
    expect(encoded).toHaveLength(1);
  });

  it('ensurePng rejects non-images, truncated PNGs and oversized PNGs', async () => {
    const env = () => fakeEnvironment().environment;
    expect(await failureType(ensurePng(new Blob(['<html>']), settings, env, undefined, 'X'))).toBe('blob-generation-failed');
    expect(await failureType(ensurePng(new Blob([pngBytes().slice(0, 12)]), settings, env, undefined, 'X'))).toBe(
      'blob-generation-failed',
    );
    expect(await failureType(ensurePng(pngBlob(1000, 1000), settings, env, undefined, 'X'))).toBe('too-large');
  });
});

describe('default DOM environment', () => {
  class FakeImage {
    static fail = false;
    decoding = '';
    naturalWidth = 30;
    naturalHeight = 20;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_url: string) {
      queueMicrotask(() => {
        if (FakeImage.fail) this.onerror?.();
        else this.onload?.();
      });
    }
  }

  const stubBrowser = () => {
    FakeImage.fail = false;
    vi.stubGlobal('Image', FakeImage);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:dom/1');
    return { revoke: vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined) };
  };

  it('is null outside a browser, and resolveCaptureEnvironment then throws unsupported', async () => {
    vi.stubGlobal('document', undefined);
    expect(getDefaultCaptureEnvironment()).toBeNull();
    expect(await syncFailureType(() => resolveCaptureEnvironment(undefined))).toBe('unsupported');
    const injected = fakeEnvironment().environment;
    expect(resolveCaptureEnvironment(injected)).toBe(injected);
  });

  it('wires URL, XMLSerializer, Image and canvas', async () => {
    const { revoke } = stubBrowser();
    const environment = getDefaultCaptureEnvironment();
    if (!environment) throw new Error('expected an environment');

    expect(environment.createObjectURL(new Blob())).toBe('blob:dom/1');
    environment.revokeObjectURL('blob:dom/1');
    expect(revoke).toHaveBeenCalledWith('blob:dom/1');

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    expect(environment.serializeSvg(svg)).toContain('<svg');

    const image = await environment.loadImage('blob:dom/1');
    expect(image).toMatchObject({ width: 30, height: 20 });
    FakeImage.fail = true;
    expect(await failureType(environment.loadImage('blob:dom/1'))).toBe('blob-generation-failed');

    const context = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
    const toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((callback: BlobCallback) => {
        callback(pngBlob());
      });

    const withBackground = await environment.encodePng(image, { width: 4, height: 2, background: 'white' });
    expect(withBackground.type).toBe('image/png');
    expect(context.fillStyle).toBe('white');
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 4, 2);
    expect(context.drawImage).toHaveBeenCalledWith(image.source, 0, 0, 4, 2);

    context.fillRect.mockClear();
    await environment.encodePng(image, { width: 4, height: 2, background: null });
    expect(context.fillRect).not.toHaveBeenCalled();

    toBlob.mockImplementation((callback: BlobCallback) => {
      callback(null);
    });
    expect(await failureType(environment.encodePng(image, { width: 4, height: 2, background: null }))).toBe(
      'blob-generation-failed',
    );

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(await failureType(environment.encodePng(image, { width: 4, height: 2, background: null }))).toBe('unsupported');
  });

  it('reports each missing API', () => {
    stubBrowser();
    expect(getDefaultCaptureEnvironment()).not.toBeNull();
    vi.stubGlobal('XMLSerializer', undefined);
    expect(getDefaultCaptureEnvironment()).toBeNull();
    vi.stubGlobal('XMLSerializer', vi.fn());
    vi.stubGlobal('Image', undefined);
    expect(getDefaultCaptureEnvironment()).toBeNull();
    vi.stubGlobal('Image', FakeImage);
    const original = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    Object.defineProperty(URL, 'createObjectURL', { value: undefined, configurable: true });
    try {
      expect(getDefaultCaptureEnvironment()).toBeNull();
    } finally {
      if (original) Object.defineProperty(URL, 'createObjectURL', original);
    }
  });
});
