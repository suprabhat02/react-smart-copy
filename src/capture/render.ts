import { copyFailure, isCopyFailure } from '../core/errors';
import { IMAGE_MIME_TYPE } from '../core/payload';
import { sniffImageType } from '../core/mime';
import { withDeadline } from './deadline';
import type { CaptureEnvironment } from './environment';
import { assertPixelBudget, type RenderSettings, type Size } from './options';

/** Maps anything unexpected to `blob-generation-failed`, keeping already-classified failures. */
export function classifyCaptureError(cause: unknown, label: string): unknown {
  return isCopyFailure(cause) ? cause : copyFailure('blob-generation-failed', `${label} failed.`, cause);
}

/**
 * Decodes an image Blob and re-encodes it as PNG at `target` (or its natural
 * size), within the deadline. The object URL is always revoked.
 */
export async function drawBlobToPng(
  blob: Blob,
  target: Size | null,
  settings: RenderSettings,
  environment: CaptureEnvironment,
  signal: AbortSignal | undefined,
  label: string,
): Promise<Blob> {
  const url = environment.createObjectURL(blob);
  try {
    return await withDeadline(
      async () => {
        const image = await environment.loadImage(url);
        const size = target ?? { width: image.width, height: image.height };
        assertPixelBudget(size.width, size.height, settings.maxPixels);
        return environment.encodePng(image, { ...size, background: settings.background });
      },
      { timeoutMs: settings.timeoutMs, signal, label },
    );
  } catch (cause) {
    throw classifyCaptureError(cause, label);
  } finally {
    environment.revokeObjectURL(url);
  }
}

/** Width and height from a PNG's IHDR chunk, read from the first 24 bytes only. */
export async function readPngSize(blob: Blob): Promise<Size | null> {
  const bytes = new Uint8Array(await blob.slice(0, 24).arrayBuffer());
  if (bytes.length < 24) return null;
  const view = new DataView(bytes.buffer);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/**
 * Guarantees the clipboard-safe result: a real PNG (verified by its bytes),
 * typed `image/png`, within the pixel budget. Other raster formats are re-encoded.
 */
export async function ensurePng(
  blob: Blob,
  settings: RenderSettings,
  environment: () => CaptureEnvironment,
  signal: AbortSignal | undefined,
  label: string,
): Promise<Blob> {
  const actual = await sniffImageType(blob);
  if (actual === null) {
    throw copyFailure('blob-generation-failed', `${label} did not produce an image.`);
  }
  if (actual !== IMAGE_MIME_TYPE) {
    return drawBlobToPng(blob, null, settings, environment(), signal, label);
  }
  const size = await readPngSize(blob);
  if (size === null) throw copyFailure('blob-generation-failed', `${label} produced a truncated PNG.`);
  assertPixelBudget(size.width, size.height, settings.maxPixels);
  return blob.type === IMAGE_MIME_TYPE ? blob : blob.slice(0, blob.size, IMAGE_MIME_TYPE);
}
