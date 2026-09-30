/**
 * Every way a clipboard operation can fail, as a closed union.
 *
 * `CopyError.message` is developer-facing (logs, telemetry). For user-facing
 * text use {@link describeCopyError} / {@link describePasteError}, or map
 * `type` through your own i18n layer.
 */
export type CopyErrorType =
  /** No Clipboard API (old browser, server, locked-down webview). Not retryable. */
  | 'unsupported'
  /** Page is not served over HTTPS/localhost. Not retryable. */
  | 'insecure-context'
  /** Browser or user blocked the operation. Also what Safari reports for a missing user gesture. */
  | 'permission-denied'
  /** The document lost focus mid-operation (Chromium). Retrying after refocus usually works. */
  | 'not-focused'
  /** Empty or malformed payload, or a lazy source that threw. Caught before touching the clipboard. */
  | 'invalid-payload'
  /** The browser cannot handle this MIME type (e.g. non-PNG image, HTML without ClipboardItem). */
  | 'unsupported-format'
  /** A lazy image source (or capture) threw, rejected or did not produce a Blob. */
  | 'blob-generation-failed'
  /** `retry()` was called after `maxRetries` was reached. Terminal. */
  | 'max-retries-exceeded'
  /** Paste: the clipboard held nothing matching `accept`. */
  | 'no-content'
  /** Content exceeded a configured safety limit (bytes, items or pixels). Not retryable. */
  | 'too-large'
  /** An operation did not settle within its deadline. Retryable. */
  | 'timeout'
  /** The caller aborted the operation through an `AbortSignal`. Not retryable. */
  | 'aborted'
  /** Anything the platform threw that we could not classify. */
  | 'unknown';

/** Which clipboard direction failed; only changes developer-facing messages. */
export type ClipboardOperation = 'write' | 'read';

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
  'timeout',
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

/** Shorthand for throwing a classified failure. */
export function copyFailure(type: CopyErrorType, message: string, cause?: unknown): CopyFailure {
  return new CopyFailure(createCopyError(type, message, cause));
}

function readString(value: unknown, key: string): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === 'string' ? field : undefined;
}

/**
 * Classifies anything thrown by the platform or an adapter into a {@link CopyError}.
 * `operation` only tailors the developer-facing message.
 */
export function toCopyError(cause: unknown, operation: ClipboardOperation = 'write'): CopyError {
  if (isCopyFailure(cause)) return cause.copyError;

  const name = readString(cause, 'name');
  const message = readString(cause, 'message') ?? '';
  const verb = operation === 'read' ? 'read' : 'write';

  switch (name) {
    case 'NotAllowedError':
      return /focus/i.test(message)
        ? createCopyError('not-focused', `The document was not focused during the clipboard ${verb}.`, cause)
        : createCopyError('permission-denied', `Clipboard ${verb} permission was denied.`, cause);
    case 'SecurityError':
      return createCopyError('insecure-context', 'The clipboard is blocked in this context.', cause);
    case 'NotSupportedError':
    case 'DataError':
      return createCopyError('unsupported-format', 'The browser rejected this clipboard format.', cause);
    case 'AbortError':
      return createCopyError('aborted', `The clipboard ${verb} was aborted.`, cause);
    case 'TimeoutError':
      return createCopyError('timeout', `The clipboard ${verb} timed out.`, cause);
    default:
      return createCopyError('unknown', message || `The clipboard ${verb} failed for an unknown reason.`, cause);
  }
}

const COPY_DESCRIPTIONS: Readonly<Record<CopyErrorType, string>> = {
  unsupported: "Copying isn't supported in this browser.",
  'insecure-context': 'Copying requires a secure (HTTPS) connection.',
  'permission-denied': 'Clipboard access was blocked. Allow it and try again.',
  'not-focused': 'The page lost focus while copying. Try again.',
  'invalid-payload': 'There is nothing to copy.',
  'unsupported-format': "This content can't be copied in this browser.",
  'blob-generation-failed': "The image couldn't be prepared for copying.",
  'max-retries-exceeded': 'Copying failed after several attempts.',
  'no-content': 'There is nothing to copy.',
  'too-large': 'This content is too large to copy.',
  timeout: 'Copying took too long. Try again.',
  aborted: 'Copying was cancelled.',
  unknown: "Couldn't copy to the clipboard. Try again.",
};

const PASTE_DESCRIPTIONS: Readonly<Record<CopyErrorType, string>> = {
  unsupported: "Pasting isn't supported in this browser.",
  'insecure-context': 'Pasting requires a secure (HTTPS) connection.',
  'permission-denied': 'Clipboard access was blocked. Allow it and try again.',
  'not-focused': 'The page lost focus while pasting. Try again.',
  'invalid-payload': "The clipboard content couldn't be read.",
  'unsupported-format': "This clipboard content isn't supported here.",
  'blob-generation-failed': "The pasted image couldn't be read.",
  'max-retries-exceeded': 'Pasting failed after several attempts.',
  'no-content': "The clipboard doesn't contain anything that can be pasted here.",
  'too-large': 'The clipboard content is too large to paste.',
  timeout: 'Pasting took too long. Try again.',
  aborted: 'Pasting was cancelled.',
  unknown: "Couldn't read the clipboard. Try again.",
};

/** Default English, user-facing sentence for a copy error. Replace for i18n. */
export function describeCopyError(error: CopyError): string {
  return COPY_DESCRIPTIONS[error.type];
}

/** Default English, user-facing sentence for a paste error. Replace for i18n. */
export function describePasteError(error: CopyError): string {
  return PASTE_DESCRIPTIONS[error.type];
}
