/** A canvas that drew a cross-origin image without its consent refuses to hand out pixels: a `SecurityError`. */
export function isCanvasBlocked(cause: unknown): boolean {
  return typeof cause === 'object' && cause !== null && (cause as { name?: unknown }).name === 'SecurityError';
}
