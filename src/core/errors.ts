/**
 * Every way a copy can fail, as a closed union.
 *
 * `CopyError.message` is developer-facing (logs, telemetry). For user-facing
 * text use {@link describeCopyError} or map `type` through your own i18n layer.
 */
export type CopyErrorType =
  /** No Clipboard API (old browser, server, locked-down webview). Not retryable. */
  | 'unsupported'
  /** Page is not served over HTTPS/localhost. Not retryable. */
  | 'insecure-context'
  /** Browser or user blocked the write. Also what Safari reports for a missing user gesture. */
  | 'permission-denied'
  /** The document lost focus mid-copy (Chromium). Retrying after refocus usually works. */
  | 'not-focused'
  /** Empty or malformed payload, or a lazy source that threw. Caught before touching the clipboard. */
  | 'invalid-payload'
  /** The browser cannot write this MIME type (e.g. non-PNG image, HTML without ClipboardItem). */
  | 'unsupported-format'
  /** A lazy image source threw, rejected or did not produce a Blob. */
  | 'blob-generation-failed'
  /** `retry()` was called after `maxRetries` was reached. Terminal. */
  | 'max-retries-exceeded'
  /** Anything the platform threw that we could not classify. */
  | 'unknown';

export interface CopyError {
  readonly type: CopyErrorType;
  readonly message: string;
  readonly cause?: unknown;
}

export function createCopyError(type: CopyErrorType, message: string, cause?: unknown): CopyError {
  return cause === undefined ? { type, message } : { type, message, cause };
}

const RETRYABLE_ERRORS: ReadonlySet<CopyErrorType> = /* @__PURE__ */ new Set<CopyErrorType>([
  'permission-denied',
  'not-focused',
  'blob-generation-failed',
  'unknown',
]);

/** Whether retrying the same payload could plausibly succeed. */
export function isRetryableError(error: CopyError): boolean {
  return RETRYABLE_ERRORS.has(error.type);
}

/**
 * Branded (not `instanceof`) so failures stay recognisable even when the core
 * is bundled twice, e.g. `react-smart-copy` and `react-smart-copy/core` together.
 */
const COPY_FAILURE_BRAND = Symbol.for('react-smart-copy.CopyFailure');

/** Error thrown by adapters to carry a fully classified {@link CopyError}. */
export class CopyFailure extends Error {
  readonly copyError: CopyError;
  readonly [COPY_FAILURE_BRAND] = true;

  constructor(copyError: CopyError) {
    super(copyError.message);
    this.name = 'CopyFailure';
    this.copyError = copyError;
  }
}

export function isCopyFailure(value: unknown): value is CopyFailure {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<PropertyKey, unknown>)[COPY_FAILURE_BRAND] === true
  );
}

function readString(value: unknown, key: string): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === 'string' ? field : undefined;
}

/** Classifies anything thrown by the platform or an adapter into a {@link CopyError}. */
export function toCopyError(cause: unknown): CopyError {
  if (isCopyFailure(cause)) return cause.copyError;

  const name = readString(cause, 'name');
  const message = readString(cause, 'message') ?? '';

  switch (name) {
    case 'NotAllowedError':
      return /focus/i.test(message)
        ? createCopyError('not-focused', 'The document was not focused when the copy was attempted.', cause)
        : createCopyError('permission-denied', 'Clipboard write permission was denied.', cause);
    case 'SecurityError':
      return createCopyError('insecure-context', 'The clipboard is blocked in this context.', cause);
    case 'NotSupportedError':
    case 'DataError':
      return createCopyError('unsupported-format', 'The browser rejected this clipboard format.', cause);
    default:
      return createCopyError('unknown', message || 'The copy failed for an unknown reason.', cause);
  }
}

const DEFAULT_DESCRIPTIONS: Readonly<Record<CopyErrorType, string>> = {
  unsupported: "Copying isn't supported in this browser.",
  'insecure-context': 'Copying requires a secure (HTTPS) connection.',
  'permission-denied': 'Clipboard access was blocked. Allow it and try again.',
  'not-focused': 'The page lost focus while copying. Try again.',
  'invalid-payload': 'There is nothing to copy.',
  'unsupported-format': "This content can't be copied in this browser.",
  'blob-generation-failed': "The image couldn't be prepared for copying.",
  'max-retries-exceeded': 'Copying failed after several attempts.',
  unknown: "Couldn't copy to the clipboard. Try again.",
};

/** Default English, user-facing sentence for an error. Replace for i18n. */
export function describeCopyError(error: CopyError): string {
  return DEFAULT_DESCRIPTIONS[error.type];
}
