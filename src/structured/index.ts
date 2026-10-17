/**
 * `react-smart-copy/structured`
 *
 * Typed, versioned, validated application data on the clipboard: copy objects in
 * one place, paste them back as the same typed objects in another tab, window or
 * app, the way design tools and spreadsheets move their own content.
 *
 * - {@link defineClipFormat}: name a format, give it a schema (any Standard Schema
 *   or a validator function), a version and migrations.
 * - {@link clipPayload}: the payload to pass to `copy()`, a copy interceptor or a
 *   drag source. It carries the data three ways, so every browser and paste path
 *   gets at least one, plus readable text and HTML for every other app.
 * - {@link readClip} / {@link readClipSync}: read it back from a paste, drop or
 *   payload as a discriminated result: `ok`, `absent`, `invalid` or `unsupported-version`.
 * - {@link clipAccept}: the `accept` list for `usePaste` / `PasteField`.
 *
 * Pasted data is untrusted: it is size-limited, parsed without prototype keys,
 * migrated, then validated before your code sees it. The data is not authenticated,
 * so validate it as you would any user input.
 *
 * @module
 */

export {
  DEFAULT_CLIP_MAX_BYTES,
  defineClipFormat,
  type ClipFormat,
  type ClipFormatInfo,
  type ClipFormatOptions,
  type ClipMigration,
  type ClipSchema,
  type ClipSchemaValue,
  type ClipValidator,
  type ClipValue,
} from './format';
export { CLIP_HTML_ATTRIBUTE } from './envelope';
export { clipPayload, type ClipPayload, type ClipPayloadItem } from './write';
export {
  clipAccept,
  readClip,
  readClipSync,
  type ClipCarrier,
  type ClipDataTransfer,
  type ClipIssue,
  type ClipReadAbsent,
  type ClipReadInvalid,
  type ClipReadOk,
  type ClipReadResult,
  type ClipReadUnsupportedVersion,
  type ClipSource,
  type ClipSourceItem,
} from './read';
export type {
  InferSchemaOutput,
  StandardSchemaFailure,
  StandardSchemaIssue,
  StandardSchemaPathSegment,
  StandardSchemaProps,
  StandardSchemaResult,
  StandardSchemaSuccess,
  StandardSchemaTypes,
  StandardSchemaV1,
} from './standard-schema';
