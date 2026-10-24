import { asTextField, insertText, replaceFieldValue, type TextField } from '../core/text-field';
import { formatNumber } from './format';
import { parseNumber, type ParsedNumber, type ParseNumberOptions } from './parse';

/** What {@link pasteAsNumber} did. */
export type NumberPasteOutcome =
  /** The paste held a number: it was inserted, written the way the field takes it. */
  | 'pasted'
  /** The paste was not a number (or the field is read-only): nothing was inserted. */
  | 'rejected'
  /** Not a paste for this handler (no text, already handled, or not a text or number field): left to the browser. */
  | 'ignored';

export interface PasteAsNumberOptions extends ParseNumberOptions {
  /**
   * How to write the number into the field. Default: `exact` for `<input type="number">`,
   * which only takes `.` as the decimal separator; elsewhere the number in `locale`'s format,
   * ungrouped (`1234,5` in `de-DE`).
   */
  readonly format?: (parsed: ParsedNumber) => string;
  /** Called with the number before it is inserted: show `ambiguous` readings here. */
  readonly onNumber?: (parsed: ParsedNumber) => void;
  /** Called with the pasted text when it was not a number, or the field takes no input. */
  readonly onReject?: (text: string) => void;
}

/** Structural paste event: a DOM `ClipboardEvent` and React's `onPaste` event both fit. */
export interface NumberPasteEvent {
  readonly clipboardData: { getData(format: string): string } | null;
  readonly currentTarget: EventTarget | null;
  readonly target: EventTarget | null;
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}

function asNumberInput(target: EventTarget | null): HTMLInputElement | null {
  const element = target as (Partial<Element> & { type?: unknown }) | null;
  return element?.nodeName === 'INPUT' && element.type === 'number' ? (target as HTMLInputElement) : null;
}

/**
 * A paste handler for number and amount fields. People paste `1.234,50 €` from a bank
 * statement, `$1,234.50` from an invoice, or `(1,234)` from a spreadsheet; a browser either
 * rejects these from `<input type="number">` or keeps the text as it is. This reads the
 * number, inserts it the way the field takes it (with undo intact in text fields), and
 * turns away pastes that are not a number.
 *
 * Works on `<input type="number">`, text `<input>`s (use `inputmode="decimal"`) and
 * `<textarea>`s; other elements are left to the browser.
 *
 * @example
 * <input inputMode="decimal" onPaste={(event) => pasteAsNumber(event, { locale: 'de-DE' })} />
 */
export function pasteAsNumber(event: NumberPasteEvent, options: PasteAsNumberOptions = {}): NumberPasteOutcome {
  if (event.defaultPrevented || event.clipboardData === null) return 'ignored';
  const numberInput = asNumberInput(event.currentTarget) ?? asNumberInput(event.target);
  const field: TextField | null = numberInput ?? asTextField(event.currentTarget) ?? asTextField(event.target);
  if (field === null) return 'ignored';
  const text = event.clipboardData.getData('text/plain');
  if (text === '') return 'ignored';
  event.preventDefault();
  const parsed = parseNumber(text.trim(), options);
  if (parsed !== null && !field.disabled && !field.readOnly) {
    options.onNumber?.(parsed);
    const value = options.format?.(parsed) ?? (numberInput === null ? formatNumber(parsed.exact, options) : parsed.exact);
    if (numberInput === null ? insertText(field, value) : replaceFieldValue(numberInput, value)) return 'pasted';
  }
  options.onReject?.(text);
  return 'rejected';
}
