import { copyFailure } from '../core/errors';
import type { HtmlPayload, TextPayload } from '../core/payload';
import { asTextField, insertText } from '../core/text-field';
import { toGamut, type Color } from './convert';
import { formatColor, toColor, type ColorFormat, type ColorInput, type FormatColorOptions } from './format';
import { parseColor } from './parse';

export interface ColorPayloadOptions extends FormatColorOptions {
  /** Default `"hex"`. */
  readonly format?: ColorFormat;
  /**
   * Add a small swatch of the colour for apps that paste rich text (Docs, Notion,
   * Slack, mail), next to the value. Editors and colour fields still get the value
   * alone. Default `true`.
   */
  readonly swatch?: boolean;
}

/** The sRGB hex of a colour for the swatch's inline style: always generated here, never user text. */
const swatchColor = (c: Color): string => formatColor(toGamut(c), 'hex');

/**
 * A colour to copy: its value in a CSS format as the plain text, and with
 * `swatch` (default) a small coloured square next to the value for rich-text apps.
 *
 * @example
 * copy(() => colorPayload('#3b82f6', { format: 'oklch' }));
 * // text: 'oklch(62.31% 0.188 259.81)', plus a blue swatch in Docs and Slack
 */
export function colorPayload(input: ColorInput, options: ColorPayloadOptions = {}): HtmlPayload | TextPayload {
  const { format = 'hex', swatch = true, ...formatOptions } = options;
  const c = toColor(input);
  const value = formatColor(c, format, formatOptions);
  const withSwatch: unknown = swatch; // Plain-JS callers can pass anything.
  if (typeof withSwatch !== 'boolean') throw copyFailure('invalid-payload', '`swatch` must be a boolean.');
  if (!withSwatch) return { kind: 'text', value };
  // The value is escaped although formatColor only writes [#a-z0-9 .%/(),-].
  const escaped = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const box = `display:inline-block;width:0.9em;height:0.9em;vertical-align:-0.1em;border:1px solid rgba(0,0,0,0.25);border-radius:2px;background:${swatchColor(c)}`;
  return { kind: 'html', html: `<span style="${box}"></span>&nbsp;<code>${escaped}</code>`, text: value };
}

export interface ReadColorOptions {
  /** Also read hex without its `#` (`ff8800`): 3, 6 or 8 digits. Off by default, since words like "decade" are hex. */
  readonly bareHex?: boolean;
}

/** Pasted content: a `PasteResult`, a `DataTransfer`-like source, or text. */
export type ColorSource = string | { readonly text?: string | null };

/** `name: value;` as copied from a stylesheet or the browser's developer tools. */
const DECLARATION = /^(?:--)?[a-z][\w-]*\s*:\s*(.+?)\s*(?:!important\s*)?;?$/i;

/**
 * The one colour that pasted text holds, or `null`: any CSS colour `parseColor`
 * reads, also as a declaration copied from a stylesheet or developer tools
 * (`background: #fff;`, `--brand: oklch(…)`). Never throws for content.
 *
 * @example
 * readColor('  rgb(59, 130, 246)  '); // a Color
 * readColor('color: #3b82f6 !important;'); // a Color
 */
export function readColor(source: ColorSource, options: ReadColorOptions = {}): Color | null {
  const raw = typeof source === 'string' ? source : source.text;
  if (typeof raw !== 'string' || raw.length > 512) return null;
  const text = raw.trim();
  const value = DECLARATION.exec(text)?.[1] ?? text;
  const direct = parseColor(value);
  if (direct !== null || options.bareHex !== true) return direct;
  return /^(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.test(value) ? parseColor(`#${value}`) : null;
}

/** Structural paste event: a DOM `ClipboardEvent` and React's `onPaste` event both fit. */
export interface ColorPasteEvent {
  readonly clipboardData: { getData(format: string): string } | null;
  readonly currentTarget: EventTarget | null;
  readonly target: EventTarget | null;
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}

export interface PasteAsColorOptions extends ReadColorOptions, FormatColorOptions {
  /** The format the field takes. Default `"hex"`. */
  readonly format?: ColorFormat;
  /** Called with the pasted colour before it is inserted; return `false` to leave the paste to the browser. */
  readonly onColor?: (color: Color) => boolean | undefined;
}

/**
 * A paste handler for colour fields: a pasted colour in any CSS format (or a
 * declaration copied from developer tools) is inserted in the field's format,
 * so `rgb(59 130 246)` pasted into a hex field becomes `#3b82f6`. Anything else
 * is left to the browser, and the browser's undo still works. Returns whether
 * it handled the paste.
 *
 * @example
 * <input value={hex} onChange={…} onPaste={(event) => pasteAsColor(event, { format: 'hex' })} />
 */
export function pasteAsColor(event: ColorPasteEvent, options: PasteAsColorOptions = {}): boolean {
  const { format = 'hex', onColor, bareHex, ...formatOptions } = options;
  // Invalid options are a programming error: they throw before the paste is touched.
  formatColor('#000', format, formatOptions);
  if (event.defaultPrevented || event.clipboardData === null) return false;
  const field = asTextField(event.currentTarget) ?? asTextField(event.target);
  if (field === null || field.disabled || field.readOnly) return false;
  const pasted = readColor(event.clipboardData.getData('text/plain'), bareHex === undefined ? {} : { bareHex });
  if (pasted === null || onColor?.(pasted) === false) return false;
  event.preventDefault();
  return insertText(field, formatColor(pasted, format, formatOptions));
}
