import { isCanvasBlocked } from './canvas-blocked';
import { copyFailure, type CopyFailure } from './errors';

/** The failure for a picture that could not be made; it says so when another site's image blocked the canvas. */
export function blobFailure(what: string, cause: unknown): CopyFailure {
  return copyFailure(
    'blob-generation-failed',
    isCanvasBlocked(cause) ? `${what} was blocked by an image from another site that does not allow it (CORS).` : `${what} failed.`,
    cause,
  );
}
