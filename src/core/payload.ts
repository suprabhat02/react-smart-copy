import { CopyFailure, createCopyError, type CopyError } from './errors';

/** The only image MIME type with reliable cross-browser clipboard write support. */
export const IMAGE_MIME_TYPE = 'image/png';

/**
 * An image as a Blob, a promise of one, or a function producing one.
 * Prefer the function form: it is invoked synchronously inside the user
 * gesture, which Safari requires for async image generation.
 */
export type BlobSource = Blob | PromiseLike<Blob> | (() => Blob | PromiseLike<Blob>);

export interface TextPayload {
  readonly kind: 'text';
  readonly value: string;
}

export interface HtmlPayload {
  readonly kind: 'html';
  readonly html: string;
  /** Required plain-text fallback for targets that don't understand HTML. */
  readonly text: string;
}

export interface ImagePayload {
  readonly kind: 'image';
  readonly blob: BlobSource;
}

export interface JsonPayload {
  readonly kind: 'json';
  readonly value: unknown;
  /** `true` = 2-space indent, a number = that indent, falsy = compact. */
  readonly pretty?: boolean | number;
}

export interface MultiPayloadItem {
  readonly mimeType: string;
  readonly data: string | Blob;
}

export interface MultiPayload {
  readonly kind: 'multi';
  readonly items: readonly MultiPayloadItem[];
}

export type CopyPayload = TextPayload | HtmlPayload | ImagePayload | JsonPayload | MultiPayload;
export type CopyPayloadKind = CopyPayload['kind'];

/** A payload, or a bare string as shorthand for `{ kind: 'text' }`. */
export type CopyInput = string | CopyPayload;

/**
 * What `copy()` accepts. The function form is resolved synchronously at copy
 * time, so it always reads the latest value without re-rendering.
 */
export type CopySource = CopyInput | (() => CopyInput);

export function normalizePayload(input: CopyInput): CopyPayload {
  return typeof input === 'string' ? { kind: 'text', value: input } : input;
}

export function isBlob(value: unknown): value is Blob {
  if (typeof Blob !== 'undefined' && value instanceof Blob) return true;
  const tag = Object.prototype.toString.call(value);
  return tag === '[object Blob]' || tag === '[object File]';
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

const invalid = (message: string): CopyError => createCopyError('invalid-payload', message);

/**
 * Structural validation. Typed callers can't produce most of these states,
 * but plain-JS callers and runtime data can, so the check is always on.
 */
export function validatePayload(payload: unknown): CopyError | null {
  if (typeof payload !== 'object' || payload === null) {
    return invalid('Copy input must be a string or a payload object.');
  }
  const candidate = payload as Record<string, unknown>;

  switch (candidate['kind']) {
    case 'text':
      return typeof candidate['value'] === 'string' && candidate['value'].length > 0
        ? null
        : invalid('Text payload must be a non-empty string.');
    case 'html':
      if (typeof candidate['html'] !== 'string' || candidate['html'].length === 0) {
        return invalid('HTML payload requires a non-empty `html` string.');
      }
      return typeof candidate['text'] === 'string' && candidate['text'].length > 0
        ? null
        : invalid('HTML payload requires a non-empty plain-text `text` fallback.');
    case 'image': {
      const source = candidate['blob'];
      return isBlob(source) || typeof source === 'function' || isThenable(source)
        ? null
        : invalid('Image payload requires a Blob, a Promise<Blob> or a function returning one.');
    }
    case 'json':
      return candidate['value'] === undefined ? invalid('JSON payload value is undefined.') : null;
    case 'multi': {
      const items = candidate['items'];
      if (!Array.isArray(items) || items.length === 0) {
        return invalid('Multi payload requires at least one item.');
      }
      const seen = new Set<string>();
      for (const item of items as unknown[]) {
        const entry = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
        const mimeType = entry['mimeType'];
        const data = entry['data'];
        if (typeof mimeType !== 'string' || mimeType.length === 0) {
          return invalid('Every multi item needs a non-empty `mimeType`.');
        }
        if (seen.has(mimeType)) return invalid(`Duplicate MIME type "${mimeType}" in multi payload.`);
        seen.add(mimeType);
        if (typeof data !== 'string' && !isBlob(data)) {
          return invalid(`Multi item "${mimeType}" must contain a string or a Blob.`);
        }
      }
      return null;
    }
    default:
      return invalid(`Unknown payload kind: ${String(candidate['kind'])}.`);
  }
}

/** Serialises a JSON payload, throwing a classified failure instead of a raw TypeError. */
export function serializeJson(payload: JsonPayload): string {
  const indent =
    payload.pretty === true ? 2 : typeof payload.pretty === 'number' ? payload.pretty : undefined;
  // Typed as `string` by lib.d.ts, but returns undefined for functions, symbols and undefined.
  let text: unknown;
  try {
    text = JSON.stringify(payload.value, null, indent);
  } catch (cause) {
    throw new CopyFailure(
      createCopyError('invalid-payload', 'JSON payload could not be serialised (circular reference or BigInt?).', cause),
    );
  }
  if (typeof text !== 'string') {
    throw new CopyFailure(
      createCopyError('invalid-payload', 'JSON payload serialised to nothing (functions, symbols and undefined are not JSON).'),
    );
  }
  return text;
}
