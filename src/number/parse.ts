import { asciiDigits } from '../core/digits';
import { readCurrency, type NumberCurrency } from './currency';
import { numberSymbols } from './locale';

/** What a number was written as: `12` is a number, `12%` a percentage, `12\u2030` per mille. */
export type NumberKind = 'number' | 'percent' | 'permille';

/** A number read from text. */
export interface ParsedNumber {
  /** The number as written: `12` for `12%`, `-1234.5` for `(1.234,50 \u20AC)`. */
  readonly value: number;
  /**
   * The same number as an exact decimal string, without rounding: `-1234.50` keeps its
   * trailing zero, and `0.1` is not `0.1000000000000000055\u2026`. Use it for money.
   */
  readonly exact: string;
  /** `'percent'` or `'permille'` when the number was written with `%` or `\u2030`. */
  readonly kind: NumberKind;
  /** The currency written with it, if any. */
  readonly currency: NumberCurrency | null;
  /**
   * The text had one `,` or `.` before exactly three digits (`1,234`, `1.234`): a group
   * separator in some locales and a decimal separator in others. `locale` decided which;
   * ask the person when it matters.
   */
  readonly ambiguous: boolean;
}

export interface ParseNumberOptions {
  /**
   * The locale whose decimal separator settles an ambiguous `1,234` or `1.234`: grouping
   * in `en-US`, a decimal in `de-DE`. Default `'en-US'`. Text that can only be read one way
   * is read that way in every locale: `1.234,5` is 1234.5 everywhere.
   */
  readonly locale?: string;
  /** Accept negative numbers. Default `true`. */
  readonly negative?: boolean;
  /** Accept numbers with a fractional part. Default `true`. */
  readonly fraction?: boolean;
  /** Accept a currency symbol or code. Default `true`. */
  readonly currency?: boolean;
  /** Accept `%` and `\u2030`. Default `true`. */
  readonly percent?: boolean;
}

/** Longer text holds more than a number: it is not read at all. */
export const NUMBER_MAX_LENGTH = 256;

/** Group separators that are never decimal separators: spaces and apostrophes. */
const GROUP_ONLY = new Set([' ', "'"]);
/** The largest exponent read from scientific notation, past which no number is finite. */
const MAX_EXPONENT = 400;

interface Adornments {
  sign: '' | '-' | '+';
  /** An opening bracket before the number, and a closing one after it: accounting's minus. */
  open: boolean;
  close: boolean;
  currency: NumberCurrency | null;
  kind: NumberKind;
}

/**
 * Reads the signs, brackets, currency and percent on one side of the number. Returns
 * `false` when something else is there, or when one of them appears twice.
 */
function readAdornments(text: string, into: Adornments, side: 'prefix' | 'suffix'): boolean {
  let rest = text;
  for (;;) {
    rest = rest.trimStart();
    if (rest === '') return true;
    const char = rest.charAt(0);
    let length = 1;
    if (char === '(' && side === 'prefix' && !into.open) into.open = true;
    else if (char === ')' && side === 'suffix' && !into.close) into.close = true;
    // A minus after the number is a trailing minus (`1234-`), as some accounting systems write it.
    else if ((char === '-' || (char === '+' && side === 'prefix')) && into.sign === '') into.sign = char;
    else if ((char === '%' || char === '\u2030') && into.kind === 'number') into.kind = char === '%' ? 'percent' : 'permille';
    else {
      const read = into.currency === null ? readCurrency(rest) : null;
      if (read === null) return false;
      into.currency = read.currency;
      length = read.length;
    }
    rest = rest.slice(length);
  }
}

/** The text in a form the reader understands: ASCII digits, one minus, one apostrophe, plain spaces. */
function normalize(text: string): string {
  return (
    asciiDigits(text)
      // Minus signs and dashes used as one.
      .replace(/[\u2212\u2012\u2013]/g, '-')
      // Arabic percent sign; Arabic decimal and thousands separators come next.
      .replace(/\u066A/g, '%')
      .replace(/[\u2019\u02BC\u066C]/g, "'")
      .replace(/\s/g, ' ')
  );
}

/** Whether `groups` (the integer part, split at its group separator) are grouped the way locales group. */
function validGroups(groups: readonly string[]): boolean {
  const [first, ...rest] = groups;
  if (first === undefined || first === '' || first.length > 3 || rest.length === 0) return false;
  if (rest.every((group) => group.length === 3)) return true;
  // Lakh and crore: 12,34,567. The last group has 3 digits and the others 2.
  return first.length <= 2 && rest.slice(0, -1).every((group) => group.length === 2) && rest[rest.length - 1]?.length === 3;
}

interface Mantissa {
  readonly integer: string;
  readonly fraction: string;
  readonly ambiguous: boolean;
}

/** The integer and fractional digits of `text` (digits and separators only), or `null`. */
function readMantissa(text: string, decimalOfLocale: '.' | ',', arabicDecimal: boolean): Mantissa | null {
  const separators = text.replace(/\d/g, '');
  if (separators === '') return { integer: text, fraction: '', ambiguous: false };
  // The decimal separator can only be the last separator, appearing once: `1,234,567.8`,
  // `1.234,5`. An Arabic decimal separator is one wherever it is.
  const candidate = arabicDecimal ? '.' : separators.charAt(separators.length - 1);
  const once = separators.split(candidate).length === 2;
  if (arabicDecimal && !once) return null;
  let decimal: string | null = null;
  let ambiguous = false;
  if (once && !GROUP_ONLY.has(candidate)) {
    const at = text.lastIndexOf(candidate);
    const before = text.slice(0, at);
    // A lone separator is a decimal unless it could also start a group of three.
    if (arabicDecimal || separators.length > 1 || text.length - at - 1 !== 3 || before === '' || before.length > 3 || before.startsWith('0')) decimal = candidate;
    else {
      ambiguous = true;
      decimal = candidate === decimalOfLocale ? candidate : null;
    }
  }
  const at = decimal === null ? text.length : text.lastIndexOf(decimal);
  const integerPart = text.slice(0, at);
  const fraction = text.slice(at + 1);
  if (!/^\d*$/.test(fraction)) return null;
  const groupSeparators = integerPart.replace(/\d/g, '');
  if (groupSeparators === '') return { integer: integerPart, fraction, ambiguous };
  const group = groupSeparators.charAt(0);
  if (groupSeparators !== group.repeat(groupSeparators.length) || !validGroups(integerPart.split(group))) return null;
  return { integer: integerPart.split(group).join(''), fraction, ambiguous };
}

/** `integer.fraction` times ten to the `exponent`, as an exact decimal string without a sign. */
function shift(integer: string, fraction: string, exponent: number): string {
  const digits = integer + fraction;
  const point = integer.length + exponent;
  let whole: string;
  let decimals: string;
  if (exponent === 0) [whole, decimals] = [integer, fraction];
  else if (point <= 0) [whole, decimals] = ['0', '0'.repeat(-point) + digits];
  else if (point >= digits.length) [whole, decimals] = [digits + '0'.repeat(point - digits.length), ''];
  else [whole, decimals] = [digits.slice(0, point), digits.slice(point)];
  // Scientific notation's own trailing zeros say nothing about precision: they go.
  if (exponent !== 0) decimals = decimals.replace(/0+$/, '');
  whole = whole.replace(/^0+(?=\d)/, '');
  return decimals === '' ? whole : `${whole}.${decimals}`;
}

/**
 * Reads a number the way people paste one: from a spreadsheet, a bank statement, an invoice
 * or a web page, in any locale's format. The whole text must be one number, with at most a
 * sign, a currency and a percent sign around it; anything else gives `null`.
 *
 * - Group separators `,` `.` `'` and spaces (no-break and narrow ones too), in groups of
 *   three or the lakh and crore grouping (`12,34,567`). Wrong grouping gives `null`.
 * - The decimal separator is whichever of `,` and `.` the text shows is one (`1.234,5`,
 *   `1,5`, `0.500`); only a lone separator before three digits (`1,234`) is settled by `locale`.
 * - `-`, `+`, `\u2212`, a trailing minus (`1234-`) and accounting brackets (`(1,234)`).
 * - Currency symbols and ISO codes, before or after: `$`, `\u20AC`, `R$`, `kr`, `USD`, `CHF`.
 * - `%` and `\u2030`, before or after; scientific notation (`1.5E-7`).
 * - Digits of any script, full-width characters, and Arabic separators.
 *
 * @throws {CopyFailure} `invalid-payload` for a `locale` that is not one.
 * @example
 * parseNumber('1.234,50 \u20AC', { locale: 'de-DE' });
 * // { value: 1234.5, exact: '1234.50', kind: 'number', currency: { symbol: '\u20AC', code: 'EUR' }, ambiguous: false }
 */
export function parseNumber(text: string, options: ParseNumberOptions = {}): ParsedNumber | null {
  const symbols = numberSymbols(options.locale ?? 'en-US');
  if (text.length > NUMBER_MAX_LENGTH) return null;
  const arabicDecimal = text.includes('\u066B');
  const normalized = normalize(text.replace(/\u066B/g, '.'));
  // The number: from its first digit (or a separator right before it, as in `.5`) to its last
  // digit. Not a dot that ends a word (`Rs.5` is 5 rupees).
  let start = normalized.search(/\d/);
  if (start === -1) return null;
  if (/[.,]/.test(normalized.charAt(start - 1)) && !/\p{L}/u.test(normalized.charAt(start - 2))) start -= 1;
  let end = normalized.length;
  while (!/\d/.test(normalized.charAt(end - 1))) end -= 1;
  const adornments: Adornments = { sign: '', open: false, close: false, currency: null, kind: 'number' };
  if (!readAdornments(normalized.slice(0, start), adornments, 'prefix') || !readAdornments(normalized.slice(end), adornments, 'suffix')) return null;
  // Brackets come in pairs, and mean the minus: `-(5)` is a typo, not a number.
  if (adornments.open !== adornments.close || (adornments.open && adornments.sign !== '')) return null;

  const core = normalized.slice(start, end);
  // Scientific notation, as spreadsheets copy it: one decimal separator, never grouped.
  const scientific = /^(\d*)(?:[.,](\d*))?[eE]([+-]?\d{1,3})$/.exec(core);
  let mantissa: Mantissa | null;
  if (scientific === null) mantissa = /^[\d.,' ]+$/.test(core) ? readMantissa(core, symbols.decimal, arabicDecimal) : null;
  else mantissa = { integer: String(scientific[1]), fraction: scientific[2] ?? '', ambiguous: false };
  if (mantissa === null) return null;
  const exponent = scientific === null ? 0 : Number(scientific[3]);
  if (Math.abs(exponent) > MAX_EXPONENT) return null;

  const digits = shift(mantissa.integer === '' ? '0' : mantissa.integer, mantissa.fraction, exponent);
  const zero = /^0(?:\.0*)?$/.test(digits);
  const negative = (adornments.sign === '-' || adornments.open) && !zero;
  const exact = negative ? `-${digits}` : digits;
  const value = Number(exact);
  if (!Number.isFinite(value)) return null;

  if (options.negative === false && negative) return null;
  if (options.fraction === false && /\.\d*[1-9]/.test(digits)) return null;
  if (options.currency === false && adornments.currency !== null) return null;
  if (options.percent === false && adornments.kind !== 'number') return null;
  if (adornments.currency !== null && adornments.kind !== 'number') return null;
  return { value, exact, kind: adornments.kind, currency: adornments.currency, ambiguous: mantissa.ambiguous };
}
