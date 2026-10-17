import { copyFailure } from '../core/errors';
/**
 * Brands formats made by `defineClipFormat`. A registered symbol (not a WeakSet),
 * so a format still passes when the module is bundled twice (ESM and CJS copies).
 */
export const CLIP_FORMAT_BRAND = Symbol.for('react-smart-copy.ClipFormat');

/** Throws an `invalid-payload` failure unless `format` came from `defineClipFormat`. */
export function assertClipFormat(format: unknown): void {
  if (typeof format !== 'object' || format === null || (format as Record<symbol, unknown>)[CLIP_FORMAT_BRAND] !== true) {
    throw copyFailure('invalid-payload', 'Expected a clip format created with defineClipFormat().');
  }
}
