import { copyFailure } from '../core/errors';
import { CLIP_FORMAT_BRAND } from './guard';
import type { InferSchemaOutput, StandardSchemaV1 } from './standard-schema';

/** A plain validator: return the typed value, or throw when `data` is not valid. */
export type ClipValidator<Value> = (data: unknown) => Value;

/**
 * Validates pasted data. A Standard Schema (Zod, Valibot, ArkType, Effect Schema, …)
 * or a plain function that returns the value or throws.
 */
export type ClipSchema<Value> = StandardSchemaV1<unknown, Value> | ClipValidator<Value>;

/**
 * The value a schema produces. Standard Schemas are checked first: some (ArkType)
 * are also callable, and their call signature returns errors instead of throwing.
 */
export type ClipSchemaValue<Schema> = Schema extends StandardSchemaV1
  ? InferSchemaOutput<Schema>
  : Schema extends (data: unknown) => infer Value
    ? Value
    : never;

/** Upgrades data written by version `n` to version `n + 1`. Receives untrusted data: check before use. */
export type ClipMigration = (data: unknown) => unknown;

export interface ClipFormatOptions<Value> {
  /**
   * A namespaced id: lower-case words separated by dots, e.g. `'acme.invoice-rows'`.
   * It names the clipboard type (`application/vnd.acme.invoice-rows+json`), so keep it
   * stable and specific to your app; two apps sharing an id can read each other's data.
   */
  readonly id: string;
  /** The data version this app writes. Positive integer, default `1`. Bump it when the shape changes. */
  readonly version?: number;
  /**
   * Validates what is pasted, after migrations. The clipboard is untrusted input:
   * anything (another app, another tab, a malicious page) can put this format on it.
   */
  readonly schema: ClipSchema<Value>;
  /**
   * Migrations from older versions, keyed by the version they upgrade *from*:
   * `{ 1: (v1) => v2 }`. A paste from a version with no migration path is reported
   * as `unsupported-version`.
   */
  readonly migrate?: Readonly<Record<number, ClipMigration>>;
  /**
   * Turns the value into JSON-ready data. Default: the value itself. The result must
   * survive `JSON.stringify` unchanged (no Map, Set, functions, NaN or Infinity);
   * Dates become ISO strings, so validate them back with a coercing schema.
   */
  readonly encode?: (value: Value) => unknown;
  /** Plain text for other apps (editors, chat, terminals). Default: the encoded data as indented JSON. */
  readonly text?: (value: Value) => string;
  /**
   * Visible HTML for rich targets (Docs, Word, mail). Treat it like any HTML you
   * generate: escape what you interpolate. Default: the plain text.
   */
  readonly html?: (value: Value) => string;
  /** Size cap of the serialised data, in UTF-8 bytes, enforced on copy and paste. Default 8 MiB. */
  readonly maxBytes?: number;
  /**
   * Also embed the data, hidden, in the copied HTML: the carrier that works for every
   * paste path in every browser (keyboard paste, drag-and-drop, Safari, Firefox).
   * The embedded data travels wherever the HTML is pasted (a mail, a document), so
   * copy only what the user may share. Default `true`.
   */
  readonly embedInHtml?: boolean;
}

/** A validated, frozen clipboard format. Create one with {@link defineClipFormat} and share it. */
export interface ClipFormat<Value> {
  readonly id: string;
  readonly version: number;
  /** The clipboard type for copy and drag events, e.g. `application/vnd.acme.invoice-rows+json`. */
  readonly mimeType: string;
  /** The async Clipboard API's web custom format: `web ` + {@link mimeType}. */
  readonly webMimeType: string;
  readonly schema: ClipSchema<Value>;
  readonly migrate: Readonly<Record<number, ClipMigration>>;
  readonly encode: ((value: Value) => unknown) | undefined;
  readonly text: ((value: Value) => string) | undefined;
  readonly html: ((value: Value) => string) | undefined;
  readonly maxBytes: number;
  readonly embedInHtml: boolean;
}

/** The parts of a format that do not depend on its value type. */
export type ClipFormatInfo = Pick<ClipFormat<unknown>, 'id' | 'version' | 'mimeType' | 'webMimeType' | 'maxBytes'>;

/** The value type of a format: `ClipValue<typeof InvoiceRows>`. */
export type ClipValue<Format> = Format extends ClipFormat<infer Value> ? Value : never;

export const DEFAULT_CLIP_MAX_BYTES: number = 8 * 1024 * 1024;

/** `namespace.name`: at least two dot-separated parts of lower-case letters, digits and inner hyphens. */
const ID_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+$/;
const MAX_ID_LENGTH = 96;

const invalid = (message: string): never => {
  throw copyFailure('invalid-payload', message);
};

const isFunction = (value: unknown): value is (...args: never[]) => unknown => typeof value === 'function';

/** Checked before the function form: some Standard Schemas (ArkType) are callable but never throw. */
export function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) return false;
  const props = (value as { readonly '~standard'?: { readonly version?: unknown; readonly validate?: unknown } })['~standard'];
  return typeof props === 'object' && props.version === 1 && isFunction(props.validate);
}

function optionalFunction<Fn>(value: Fn | undefined, name: string): Fn | undefined {
  if (value !== undefined && !isFunction(value)) invalid(`\`${name}\` must be a function.`);
  return value;
}

function resolveMigrations(migrate: unknown, version: number): Readonly<Record<number, ClipMigration>> {
  const steps = Object.create(null) as Record<number, ClipMigration>;
  if (migrate === undefined) return Object.freeze(steps);
  if (typeof migrate !== 'object' || migrate === null) return invalid('`migrate` must be an object of functions.');
  for (const [key, step] of Object.entries(migrate)) {
    const from = Number(key);
    if (!Number.isInteger(from) || from < 1 || from >= version || String(from) !== key) {
      invalid(`\`migrate\` key "${key}" must be a version from 1 to ${String(version - 1)}.`);
    }
    if (!isFunction(step)) invalid(`\`migrate[${key}]\` must be a function.`);
    steps[from] = step as ClipMigration;
  }
  return Object.freeze(steps);
}

/**
 * Defines a typed clipboard format: copy it with {@link clipPayload}, read it back
 * with {@link readClip}. Define each format once, at module level, and share it
 * between the copying and the pasting code.
 *
 * Throws an `invalid-payload` `CopyFailure` when the definition is invalid.
 *
 * @example
 * const InvoiceRows = defineClipFormat({
 *   id: 'acme.invoice-rows',
 *   version: 2,
 *   schema: z.array(Invoice),
 *   migrate: { 1: (rows) => upgradeV1(rows) },
 *   text: (rows) => rows.map((row) => row.id).join('\n'),
 * });
 */
export function defineClipFormat<Schema extends ClipSchema<unknown>>(
  options: Omit<ClipFormatOptions<ClipSchemaValue<Schema>>, 'schema'> & { readonly schema: Schema },
): ClipFormat<ClipSchemaValue<Schema>> {
  type Value = ClipSchemaValue<Schema>;
  const { id, schema } = options;
  if (typeof id !== 'string' || id.length > MAX_ID_LENGTH || !ID_SHAPE.test(id)) {
    invalid(`Clip format id ${JSON.stringify(id)} must look like "namespace.name" (lower-case, at most ${String(MAX_ID_LENGTH)} characters).`);
  }
  const version = options.version ?? 1;
  if (!Number.isSafeInteger(version) || version < 1) invalid(`\`version\` must be a positive integer (received ${String(version)}).`);
  if (!isStandardSchema(schema) && !isFunction(schema)) {
    invalid('`schema` must be a Standard Schema (Zod, Valibot, ArkType, …) or a validator function.');
  }
  const maxBytes = options.maxBytes ?? DEFAULT_CLIP_MAX_BYTES;
  if (maxBytes !== Infinity && !(Number.isInteger(maxBytes) && maxBytes > 0)) {
    invalid(`\`maxBytes\` must be a positive integer or Infinity (received ${String(maxBytes)}).`);
  }
  const mimeType = `application/vnd.${id}+json`;
  const format: ClipFormat<Value> = {
    id,
    version,
    mimeType,
    webMimeType: `web ${mimeType}`,
    // `Schema` is exactly `ClipSchema<Value>` for its own value type; TypeScript cannot follow the conditional.
    schema: schema as ClipSchema<Value>,
    migrate: resolveMigrations(options.migrate, version),
    encode: optionalFunction(options.encode, 'encode'),
    text: optionalFunction(options.text, 'text'),
    html: optionalFunction(options.html, 'html'),
    maxBytes,
    embedInHtml: options.embedInHtml ?? true,
  };
  // Non-enumerable, so a spread copy (which could be edited out of sync) is not a format.
  Object.defineProperty(format, CLIP_FORMAT_BRAND, { value: true });
  return Object.freeze(format);
}
