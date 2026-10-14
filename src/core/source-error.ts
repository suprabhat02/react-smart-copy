import { createCopyError, isCopyFailure, type CopyError } from './errors';

/**
 * The error for a user-supplied source (copy source, drag source, copy transform)
 * that threw. A thrown `CopyFailure` keeps its classification, so a helper such as
 * `tablePayload()` can report `too-large` instead of a generic `invalid-payload`.
 * Internal: not part of the public API.
 */
export function sourceError(cause: unknown, message: string): CopyError {
  return isCopyFailure(cause) ? cause.copyError : createCopyError('invalid-payload', message, cause);
}
