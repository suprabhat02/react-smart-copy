import { copyFailure } from './errors';
import { isTextualMimeType, matchesMimePattern, normalizeMimeType, sniffImageType } from './mime';

/* ------------------------------------------------------------------ Types */

/** Friendly names for the common cases. */
export type PasteAcceptShorthand = 'text' | 'html' | 'image' | 'any';

/**
 * What a paste may contain, in any order: a shorthand, an exact MIME type
 * (`'image/png'`) or a wildcard (`'image/*'`, `'*\/*'`).
 * `image/svg+xml` is only accepted when listed exactly (it is scriptable XML).
 */
export type PasteAccept = PasteAcceptShorthand | `${string}/${string}`;

export interface PasteLimits {
  /** Total size cap across all accepted items. Strings count UTF-16 code units. Default 32 MiB. */
  readonly maxBytes?: number;
  /** Max number of accepted items (types + files). Default 32. */
  readonly maxItems?: number;
}

export interface PasteReadOptions extends PasteLimits {
  /** Default `['text']` (plain text only): the safest choice. */
  readonly accept?: readonly PasteAccept[];
}

/** Validated, normalised options that adapters receive. */
export interface ResolvedPasteReadOptions {
  /** Normalised patterns: `type/subtype`, `type/*` or `*\/*`. */
  readonly accept: readonly string[];
  readonly maxBytes: number;
  readonly maxItems: number;
}

/** Where the content came from. */
export type PasteSource = 'clipboard' | 'event';

/** One accepted clipboard entry. Textual types are decoded to `string`, everything else stays a `Blob`. */
export interface PasteItem {
  readonly type: string;
  readonly data: string | Blob;
}

/**
 * Everything the paste produced. Treat all of it as untrusted user input:
 * in particular never inject `html` into the DOM without sanitising it.
 */
export interface PasteResult {
  readonly source: PasteSource;
  /** Every accepted entry, in clipboard order. */
  readonly items: readonly PasteItem[];
  /** `text/plain`, when accepted and present. */
  readonly text: string | null;
  /** `text/html`, when accepted and present. UNTRUSTED markup: sanitise before rendering. */
  readonly html: string | null;
  /** Raster images, verified from their bytes (PNG, JPEG, GIF, WebP, AVIF, BMP), typed accordingly. */
  readonly images: readonly Blob[];
  /** Files from a paste event (e.g. copied in the OS file manager). Includes image files. */
  readonly files: readonly File[];
}

/* -------------------------------------------------------- Option handling */

export const DEFAULT_PASTE_ACCEPT: readonly PasteAccept[] = /* @__PURE__ */ Object.freeze(['text'] as const);
export const DEFAULT_PASTE_MAX_BYTES = 32 * 1024 * 1024;
export const DEFAULT_PASTE_MAX_ITEMS = 32;

const SHORTHANDS: ReadonlyMap<string, string> = /* @__PURE__ */ new Map([
  ['text', 'text/plain'],
  ['html', 'text/html'],
  ['image', 'image/*'],
  ['any', '*/*'],
]);

const TYPE_TOKEN = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/;

function resolvePattern(entry: unknown): string | null {
  if (typeof entry !== 'string') return null;
  const shorthand = SHORTHANDS.get(entry);
  if (shorthand !== undefined) return shorthand;
  if (entry === '*/*') return entry;
  if (entry.endsWith('/*')) {
    const type = entry.slice(0, -2).toLowerCase();
    return TYPE_TOKEN.test(type) ? `${type}/*` : null;
  }
  return normalizeMimeType(entry);
}

function resolveLimit(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (value === Infinity || (Number.isInteger(value) && value > 0)) return value;
  throw copyFailure('invalid-payload', `\`${name}\` must be a positive integer or Infinity (received ${String(value)}).`);
}

/** Validates and normalises paste options. Throws a classified `invalid-payload` failure. */
export function resolvePasteReadOptions(options: PasteReadOptions = {}): ResolvedPasteReadOptions {
  const accept: string[] = [];
  for (const entry of options.accept ?? DEFAULT_PASTE_ACCEPT) {
    const pattern = resolvePattern(entry);
    if (pattern === null) throw copyFailure('invalid-payload', `Invalid \`accept\` entry: ${JSON.stringify(entry)}.`);
    if (!accept.includes(pattern)) accept.push(pattern);
  }
  if (accept.length === 0) throw copyFailure('invalid-payload', '`accept` must list at least one type.');
  return {
    accept,
    maxBytes: resolveLimit(options.maxBytes, DEFAULT_PASTE_MAX_BYTES, 'maxBytes'),
    maxItems: resolveLimit(options.maxItems, DEFAULT_PASTE_MAX_ITEMS, 'maxItems'),
  };
}

/** Whether a normalised MIME type is allowed by the resolved `accept` list. */
export function isAccepted(mimeType: string, options: ResolvedPasteReadOptions): boolean {
  return options.accept.some((pattern) => matchesMimePattern(mimeType, pattern));
}

/* -------------------------------------------------------------- Entries */

/** An accepted, not-yet-verified entry. */
export interface PasteEntry {
  readonly type: string;
  readonly data: string | Blob;
  /** Came from `DataTransfer.files`, i.e. `data` is a `File`. */
  readonly file: boolean;
}

interface Budget {
  readonly charge: (size: number) => void;
}

function createBudget(options: ResolvedPasteReadOptions): Budget {
  let bytes = 0;
  let items = 0;
  return {
    charge: (size) => {
      items += 1;
      bytes += size;
      if (items > options.maxItems) {
        throw copyFailure('too-large', `The paste has more than ${String(options.maxItems)} accepted items.`);
      }
      if (bytes > options.maxBytes) {
        throw copyFailure('too-large', `The paste exceeds the ${String(options.maxBytes)}-byte limit.`);
      }
    },
  };
}

const sizeOf = (data: string | Blob): number => (typeof data === 'string' ? data.length : data.size);

/** Throws `too-large` when the entries break `maxItems` / `maxBytes`. */
export function enforcePasteLimits(entries: readonly PasteEntry[], options: ResolvedPasteReadOptions): void {
  const budget = createBudget(options);
  for (const entry of entries) budget.charge(sizeOf(entry.data));
}

/** Structural view of `DataTransfer` (paste events). */
export interface DataTransferLike {
  readonly types: ArrayLike<string>;
  getData(format: string): string;
  readonly files?: ArrayLike<File> | null;
}

/**
 * Synchronously copies the accepted parts of a paste event's `DataTransfer`.
 * It must run during the event: browsers empty the object afterwards.
 */
export function snapshotDataTransfer(data: DataTransferLike, options: ResolvedPasteReadOptions): PasteEntry[] {
  const entries: PasteEntry[] = [];
  const seen = new Set<string>();

  for (const raw of Array.from(data.types)) {
    const type = normalizeMimeType(raw);
    // Binary types are delivered through `files`; `getData` only returns strings.
    if (type === null || seen.has(type) || !isTextualMimeType(type) || !isAccepted(type, options)) continue;
    seen.add(type);
    const text = data.getData(raw);
    if (text.length > 0) entries.push({ type, data: text, file: false });
  }

  for (const file of Array.from(data.files ?? [])) {
    const type = normalizeMimeType(file.type) ?? 'application/octet-stream';
    if (isAccepted(type, options)) entries.push({ type, data: file, file: true });
  }

  return entries;
}

/** Structural view of a `ClipboardItem` as returned by `navigator.clipboard.read()`. */
export interface ClipboardItemLike {
  readonly types: readonly string[];
  getType(type: string): Promise<Blob>;
}

/**
 * Reads the accepted types from `navigator.clipboard.read()` items, enforcing
 * the limits *before* decoding any text so an oversized paste is never buffered twice.
 */
export async function collectClipboardItems(
  items: readonly ClipboardItemLike[],
  options: ResolvedPasteReadOptions,
): Promise<PasteEntry[]> {
  const budget = createBudget(options);
  const entries: PasteEntry[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    for (const raw of item.types) {
      const type = normalizeMimeType(raw);
      if (type === null || seen.has(type) || !isAccepted(type, options)) continue;
      seen.add(type);

      let blob: Blob;
      try {
        blob = await item.getType(raw);
      } catch {
        // Chromium lists some types it then refuses to hand over; skip them, don't fail the paste.
        continue;
      }
      if (blob.size === 0) continue;
      budget.charge(blob.size);
      entries.push({ type, data: isTextualMimeType(type) ? await blob.text() : blob, file: false });
    }
  }
  return entries;
}

/* ------------------------------------------------------------ Finalising */

function retype(entry: PasteEntry, data: Blob, type: string): Blob {
  if (entry.file) {
    const file = data as File;
    return new File([file], file.name, { type, lastModified: file.lastModified });
  }
  return data.slice(0, data.size, type);
}

/**
 * Verifies image bytes, then builds the result. Blobs that claim to be images
 * but aren't (or whose real format is not accepted) are dropped. Throws
 * `no-content` when nothing survives.
 */
export async function finalizePaste(
  entries: readonly PasteEntry[],
  source: PasteSource,
  options: ResolvedPasteReadOptions,
): Promise<PasteResult> {
  const items: PasteItem[] = [];
  const images: Blob[] = [];
  const files: File[] = [];
  let text: string | null = null;
  let html: string | null = null;

  for (const entry of entries) {
    let { type, data } = entry;

    if (typeof data === 'string') {
      // Types are de-duplicated upstream, so each of these is seen at most once.
      if (type === 'text/plain') text = data;
      else if (type === 'text/html') html = data;
    } else if (type.startsWith('image/')) {
      const actual = await sniffImageType(data);
      if (actual === null || !isAccepted(actual, options)) continue;
      if (actual !== type) {
        data = retype(entry, data, actual);
        type = actual;
      }
      images.push(data);
    }

    if (entry.file) files.push(data as File);
    items.push({ type, data });
  }

  if (items.length === 0) {
    throw copyFailure('no-content', 'The clipboard holds nothing that matches `accept`.');
  }
  return { source, items, text, html, images, files };
}
