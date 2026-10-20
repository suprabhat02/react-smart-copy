import { copyFailure, isCopyFailure } from '../core/errors';
import { asTextField, insertText } from '../core/text-field';
import { extract } from './element';
import { inspectCode, positiveLimit, type CodeFinding } from './inspect';
import { lineText, toLines, type Line } from './lines';
import { render, resolveText, transform, type CodeTextOptions } from './normalize';
import { parseInertHtml } from '../core/inert-html';

export const DEFAULT_CODE_MAX_LENGTH = 2_000_000;

export interface PasteToCodeOptions extends Omit<CodeTextOptions, 'finalNewline'> {
  /**
   * Indentation for every line after the first, which lands where the cursor is.
   * `pasteAsCode` sets it to the cursor line's indentation.
   */
  readonly indent?: string;
  /**
   * Longest paste to process, in UTF-16 code units. Longer pastes throw a
   * `too-large` error (`pasteAsCode` leaves them to the browser): code is never cut.
   * Default {@link DEFAULT_CODE_MAX_LENGTH}.
   */
  readonly maxLength?: number;
}

export interface PasteCode {
  readonly code: string;
  /** `text` for the plain-text flavour; `html` when only HTML was on the clipboard. */
  readonly source: 'text' | 'html';
  /** What the pasted text held, before anything was fixed (positions in the pasted text, at most 1000). */
  readonly findings: readonly CodeFinding[];
  /** How many characters `clean` replaced or removed. */
  readonly fixed: number;
  /** What is still in `code` (positions in `code`), e.g. a non-Latin letter with no lookalike. */
  readonly remaining: readonly CodeFinding[];
  /** Whether `remaining` holds a `danger` finding. */
  readonly danger: boolean;
}

/** The clipboard flavours: a `PasteResult` from `usePaste`, or anything with `text` / `html`. */
export interface CodePasteSource {
  readonly text?: string | null;
  readonly html?: string | null;
}

const INDENT = /^[ \t]*$/;

function indentLines(lines: readonly Line[], indent: string): Line[] {
  if (indent === '') return [...lines];
  return lines.map((line, at) => (at === 0 || lineText(line) === '' ? line : [{ text: indent, style: '' }, ...line]));
}

/**
 * Code for what was pasted: the plain text (or, when only HTML was copied, the
 * text of its code), cleaned of invisible and lookalike characters, curly quotes
 * and odd spaces, dedented, and re-indented with `indent`. Every finding is
 * reported. Returns `null` when there is nothing to paste.
 *
 * @example
 * usePaste({ accept: ['text'], onPaste: (result) => {
 *   const pasted = pasteToCode(result);
 *   if (pasted?.danger) showWarning(pasted.remaining);
 * } });
 */
export function pasteToCode(source: CodePasteSource, options: PasteToCodeOptions = {}): PasteCode | null {
  const resolved = resolveText(options, { prompt: false, clean: true });
  const maxLength = positiveLimit(options.maxLength, DEFAULT_CODE_MAX_LENGTH, 'maxLength');
  const indent = options.indent ?? '';
  if (typeof indent !== 'string' || !INDENT.test(indent)) throw copyFailure('invalid-payload', '`indent` may only hold spaces and tabs.');
  let text = source.text ?? '';
  let from: PasteCode['source'] = 'text';
  if (text === '' && typeof source.html === 'string' && source.html.trim() !== '' && typeof DOMParser !== 'undefined') {
    if (source.html.length > maxLength) throw copyFailure('too-large', `The pasted HTML is longer than maxLength (${String(maxLength)}).`);
    const body = parseInertHtml(source.html).body;
    text = extract(body, { styles: false }).runs.map((run) => run.text).join('');
    from = 'html';
  }
  if (text.length > maxLength) throw copyFailure('too-large', `The pasted text is longer than maxLength (${String(maxLength)}).`);
  if (text.trim() === '') return null;
  const { lines, fixed } = transform(toLines([{ text, style: '' }]), resolved);
  const code = render(indentLines(lines, indent), { eol: resolved.eol, finalNewline: false });
  const remaining = inspectCode(code, { maxFindings: Infinity }).findings;
  return {
    code,
    source: from,
    findings: inspectCode(text).findings,
    fixed,
    remaining,
    danger: remaining.some((finding) => finding.severity === 'danger'),
  };
}

/** Structural paste event: a DOM `ClipboardEvent` and React's `onPaste` event both fit. */
export interface CodePasteEvent {
  readonly clipboardData: { getData(format: string): string } | null;
  readonly currentTarget: EventTarget | null;
  readonly target: EventTarget | null;
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}

export interface PasteAsCodeOptions extends Omit<PasteToCodeOptions, 'indent'> {
  /** Indent the pasted lines to the cursor line's indentation, as code editors do. Default `true`. */
  readonly indentToCursor?: boolean;
  /**
   * Called before the code is inserted. Return `false` to cancel the paste, e.g.
   * when `danger` is set and the user declines.
   */
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- the callback may return nothing
  readonly onPaste?: (result: PasteCode) => boolean | void;
}

/**
 * A paste handler for code fields (`<textarea>`, or a text `<input>` for one-line
 * commands): pastes the code from {@link pasteToCode} at the cursor with the
 * browser's undo intact. Returns whether it took over the paste: `false` leaves
 * the paste to the browser (nothing to paste, a field it can't write to, invalid
 * options, or a paste past `maxLength`).
 *
 * @example
 * <textarea onPaste={pasteAsCode} />
 * <textarea onPaste={(event) => pasteAsCode(event, { onPaste: (r) => !r.danger || confirm('Paste anyway?') })} />
 */
export function pasteAsCode(event: CodePasteEvent, options: PasteAsCodeOptions = {}): boolean {
  if (event.defaultPrevented || event.clipboardData === null) return false;
  const field = asTextField(event.currentTarget) ?? asTextField(event.target);
  if (field === null || field.disabled || field.readOnly) return false;
  const { indentToCursor, onPaste, ...rest } = options;
  let indent = '';
  if (indentToCursor !== false && field.nodeName === 'TEXTAREA' && field.selectionStart !== null) {
    const before = field.value.slice(0, field.selectionStart);
    indent = /^[ \t]*/.exec(before.slice(before.lastIndexOf('\n') + 1))?.[0] as string;
  }
  let result: PasteCode | null;
  try {
    result = pasteToCode({ text: event.clipboardData.getData('text/plain'), html: event.clipboardData.getData('text/html') }, { ...rest, indent });
  } catch (error) {
    if (isCopyFailure(error)) return false; // Invalid options or too large: the native paste still happens.
    throw error;
  }
  if (result === null) return false;
  event.preventDefault();
  if (onPaste?.(result) === false) return true;
  insertText(field, result.code);
  return true;
}
