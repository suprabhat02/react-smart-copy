import { normalizeClipboardType } from '../core/mime';
import type { PasteAccept } from '../core/paste-reader';
import { utf8ByteLength } from '../core/paste-reader';
import { decodeBase64Url, decodedSize } from './base64url';
import { parseEnvelope, type ClipEnvelope } from './envelope';
import { isStandardSchema, type ClipFormat, type ClipFormatInfo } from './format';
import { assertClipFormat } from './guard';
import type { StandardSchemaResult } from './standard-schema';

/* ------------------------------------------------------------------ Types */

/** Which carrier the clip was read from, most to least specific. */
export type ClipCarrier = 'web' | 'custom' | 'html';

export interface ClipIssue {
  readonly message: string;
  /** Where in the data the problem is; empty for the data as a whole. */
  readonly path: readonly PropertyKey[];
}

export interface ClipReadOk<Value> {
  readonly status: 'ok';
  /** The validated (and, if needed, migrated) value. */
  readonly value: Value;
  /** The version the data was written with; lower than the format's when it was migrated. */
  readonly version: number;
  readonly carrier: ClipCarrier;
}

/** The source holds no data in this format. */
export interface ClipReadAbsent {
  readonly status: 'absent';
}

/** Data in this format was found but is malformed, too large, failed a migration or failed the schema. */
export interface ClipReadInvalid {
  readonly status: 'invalid';
  readonly carrier: ClipCarrier;
  readonly issues: readonly ClipIssue[];
  /** What a migration or validator threw, if anything. */
  readonly cause?: unknown;
}

/** Written by a newer version of the app, or by an older one with no migration path. */
export interface ClipReadUnsupportedVersion {
  readonly status: 'unsupported-version';
  readonly carrier: ClipCarrier;
  readonly version: number;
}

export type ClipReadResult<Value> = ClipReadOk<Value> | ClipReadAbsent | ClipReadInvalid | ClipReadUnsupportedVersion;

/** An entry of a paste result (`type`) or of a clip payload (`mimeType`). */
export type ClipSourceItem =
  | { readonly type: string; readonly data: string | Blob }
  | { readonly mimeType: string; readonly data: string | Blob };

/** The `DataTransfer` of a paste or drop event you handle yourself. */
export interface ClipDataTransfer {
  readonly types: ArrayLike<string>;
  getData(format: string): string;
}

/**
 * Where to read a clip from: a `PasteResult` (from `usePaste`, `PasteField` or a
 * paste adapter), a {@link ClipPayload} (round-trips, tests, in-app duplication), or
 * a raw `DataTransfer`.
 */
export type ClipSource = { readonly items: readonly ClipSourceItem[] } | ClipDataTransfer;

/* -------------------------------------------------------------- Helpers */

interface Candidate {
  readonly carrier: ClipCarrier;
  readonly data: string | Blob;
}

const CARRIERS: readonly ClipCarrier[] = ['web', 'custom', 'html'];

/** Envelope tokens are scanned for at most this many times per HTML string. */
const MAX_HTML_TOKENS = 64;

const messageOf = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));

const isTransfer = (source: ClipSource): source is ClipDataTransfer =>
  typeof (source as Partial<ClipDataTransfer>).getData === 'function';

const issue = (message: string): ClipIssue => ({ message, path: [] });

function invalid(carrier: ClipCarrier, issues: readonly ClipIssue[], cause?: unknown): ClipReadInvalid {
  return cause === undefined ? { status: 'invalid', carrier, issues } : { status: 'invalid', carrier, issues, cause };
}

/** The candidate entries in carrier order. Reads `DataTransfer` data only for types that match. */
function gather(source: ClipSource, format: ClipFormatInfo): Candidate[] {
  const found = new Map<ClipCarrier, string | Blob>();
  const consider = (raw: string, read: () => string | Blob): void => {
    const type = normalizeClipboardType(raw);
    const carrier: ClipCarrier | null =
      type === format.webMimeType ? 'web' : type === format.mimeType ? 'custom' : type === 'text/html' ? 'html' : null;
    if (carrier !== null && !found.has(carrier)) found.set(carrier, read());
  };
  if (isTransfer(source)) {
    for (const type of Array.from(source.types)) consider(type, () => source.getData(type));
  } else {
    for (const item of source.items) consider('type' in item ? item.type : item.mimeType, () => item.data);
  }
  const candidates: Candidate[] = [];
  for (const carrier of CARRIERS) {
    const data = found.get(carrier);
    if (data !== undefined) candidates.push({ carrier, data });
  }
  return candidates;
}

function findHtmlToken(html: string, id: string): string | null {
  // The token alphabet is closed (id: [a-z0-9.-], data: base64url), so a strict match is exact:
  // no HTML parsing, no DOM, linear time. Quotes may be single or double.
  const pattern = /data-rsc-clip\s*=\s*(["'])([a-z0-9.-]{1,96});([A-Za-z0-9_-]*)\1/g;
  for (let scanned = 0; scanned < MAX_HTML_TOKENS; scanned += 1) {
    const match = pattern.exec(html);
    if (match === null) return null;
    if (match[2] === id) return match[3] as string;
  }
  return null;
}

/** The envelope a carrier holds, `null` when it holds none for this format, or why it is unusable. */
function extract(candidate: Candidate, text: string, format: ClipFormatInfo): ClipEnvelope | ClipReadInvalid | null {
  const { carrier } = candidate;
  const tooLarge = (): ClipReadInvalid =>
    invalid(carrier, [issue(`The clip exceeds the ${String(format.maxBytes)}-byte limit.`)]);
  let json = text;
  if (carrier === 'html') {
    const token = findHtmlToken(text, format.id);
    if (token === null) return null;
    if (decodedSize(token) > format.maxBytes) return tooLarge();
    try {
      json = decodeBase64Url(token);
    } catch (cause) {
      return invalid(carrier, [issue('The clip embedded in the HTML is corrupted.')], cause);
    }
  } else if (utf8ByteLength(text) > format.maxBytes) {
    return tooLarge();
  }
  let envelope: ClipEnvelope;
  try {
    envelope = parseEnvelope(json);
  } catch (cause) {
    return invalid(carrier, [issue(messageOf(cause))], cause);
  }
  if (envelope.id !== format.id) {
    return invalid(carrier, [issue(`The clipboard holds "${envelope.id}" data under the "${format.id}" type.`)]);
  }
  return envelope;
}

function fromStandardResult<Value>(
  result: StandardSchemaResult<Value>,
  carrier: ClipCarrier,
  version: number,
): ClipReadResult<Value> {
  if (typeof (result as unknown) !== 'object' || (result as unknown) === null) {
    return invalid(carrier, [issue('The schema returned a malformed result.')]);
  }
  if (result.issues !== undefined) {
    // Schemas are third-party code: read their issues defensively, never throw.
    const raw: unknown = result.issues;
    const issues = Array.from(Array.isArray(raw) ? (raw as unknown[]) : [], (item): ClipIssue => {
      const entry = (typeof item === 'object' && item !== null ? item : {}) as { message?: unknown; path?: unknown };
      // Array.from, not .map: some libraries' paths are Array subclasses, and the result must be a plain array.
      const path = Array.isArray(entry.path)
        ? Array.from(entry.path as unknown[], (segment) =>
            typeof segment === 'object' && segment !== null ? (segment as { key: PropertyKey }).key : (segment as PropertyKey),
          )
        : [];
      return { message: typeof entry.message === 'string' ? entry.message : 'Invalid value.', path };
    });
    return invalid(carrier, issues.length > 0 ? issues : [issue('The schema rejected the data.')]);
  }
  return { status: 'ok', value: result.value, version, carrier };
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof value === 'object' && value !== null && typeof (value as { then?: unknown }).then === 'function';
}

/** Migrates and validates an envelope. Returns a promise only when the schema validates asynchronously. */
function settle<Value>(
  envelope: ClipEnvelope,
  carrier: ClipCarrier,
  format: ClipFormat<Value>,
): ClipReadResult<Value> | Promise<ClipReadResult<Value>> {
  const { version } = envelope;
  if (version > format.version) return { status: 'unsupported-version', carrier, version };

  let data = envelope.data;
  for (let from = version; from < format.version; from += 1) {
    const step = format.migrate[from];
    if (step === undefined) return { status: 'unsupported-version', carrier, version };
    try {
      data = step(data);
    } catch (cause) {
      return invalid(carrier, [issue(`Migrating from version ${String(from)} failed: ${messageOf(cause)}`)], cause);
    }
  }

  const { schema } = format;
  if (!isStandardSchema(schema)) {
    try {
      return { status: 'ok', value: schema(data), version, carrier };
    } catch (cause) {
      return invalid(carrier, [issue(messageOf(cause))], cause);
    }
  }
  let result: StandardSchemaResult<Value> | Promise<StandardSchemaResult<Value>>;
  try {
    result = schema['~standard'].validate(data);
  } catch (cause) {
    return invalid(carrier, [issue(`The schema threw: ${messageOf(cause)}`)], cause);
  }
  if (!isThenable(result)) return fromStandardResult(result, carrier, version);
  return Promise.resolve(result).then(
    (settled) => fromStandardResult(settled, carrier, version),
    (cause: unknown) => invalid(carrier, [issue(`The schema threw: ${messageOf(cause)}`)], cause),
  );
}

/* -------------------------------------------------------------- Reading */

/**
 * Reads a clip of `format` from a paste, a drop or a clip payload: finds it in the
 * first carrier that holds one, migrates it from older versions, and validates it.
 * Never throws for clipboard content; every outcome is a {@link ClipReadResult}.
 *
 * Supports asynchronous schemas and `Blob` entries. When you need a result
 * synchronously and your schema is synchronous, use {@link readClipSync}.
 *
 * @example
 * onPaste: async (result) => {
 *   const clip = await readClip(result, InvoiceRows);
 *   if (clip.status === 'ok') addRows(clip.value);
 * }
 */
export async function readClip<Value>(source: ClipSource, format: ClipFormat<Value>): Promise<ClipReadResult<Value>> {
  assertClipFormat(format);
  let firstInvalid: ClipReadInvalid | null = null;
  for (const candidate of gather(source, format)) {
    let text: string;
    try {
      text = typeof candidate.data === 'string' ? candidate.data : await candidate.data.text();
    } catch (cause) {
      firstInvalid ??= invalid(candidate.carrier, [issue('The clipboard entry could not be read.')], cause);
      continue;
    }
    const envelope = extract(candidate, text, format);
    if (envelope === null) continue;
    if ('status' in envelope) {
      firstInvalid ??= envelope;
      continue;
    }
    return settle(envelope, candidate.carrier, format);
  }
  return firstInvalid ?? { status: 'absent' };
}

/**
 * Synchronous {@link readClip}, e.g. to decide inside a paste or drop handler.
 * `Blob` entries are skipped, and an asynchronous schema yields `invalid`.
 */
export function readClipSync<Value>(source: ClipSource, format: ClipFormat<Value>): ClipReadResult<Value> {
  assertClipFormat(format);
  let firstInvalid: ClipReadInvalid | null = null;
  for (const candidate of gather(source, format)) {
    if (typeof candidate.data !== 'string') continue;
    const envelope = extract(candidate, candidate.data, format);
    if (envelope === null) continue;
    if ('status' in envelope) {
      firstInvalid ??= envelope;
      continue;
    }
    const result = settle(envelope, candidate.carrier, format);
    if (!(result instanceof Promise)) return result;
    // `settle` turns rejections into results, so the discarded promise never rejects unhandled.
    return invalid(candidate.carrier, [issue('The schema validates asynchronously: use readClip().')]);
  }
  return firstInvalid ?? { status: 'absent' };
}

/**
 * The `accept` list that lets a paste or drop carry these formats: each format's
 * web custom format and clipboard type, plus HTML. Add `'text'` (or more) if you
 * also handle other content.
 *
 * @example
 * usePaste({ accept: [...clipAccept(InvoiceRows), 'text'], onPaste })
 */
export function clipAccept(...formats: readonly ClipFormatInfo[]): PasteAccept[] {
  const accept: PasteAccept[] = [];
  for (const format of formats) {
    assertClipFormat(format);
    accept.push(format.webMimeType as PasteAccept, format.mimeType as PasteAccept);
  }
  accept.push('html');
  return accept;
}
