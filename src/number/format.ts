import { copyFailure } from '../core/errors';
import type { TextPayload } from '../core/payload';
import { numberSymbols } from './locale';

export interface FormatNumberOptions {
  /** The locale whose decimal and group separators to use. Default `'en-US'`. Digits are always Latin. */
  readonly locale?: string;
  /**
   * Group the integer part (`1,234,567`; `12,34,567` in `en-IN`). Default `false`: spreadsheets
   * read ungrouped numbers in every locale, and grouped ones only in their own.
   */
  readonly grouping?: boolean;
  /** Exactly this many decimals (0 to 100), rounding half away from zero. Default: as many as the number has. */
  readonly fractionDigits?: number;
}

/** Plain decimal notation, as `parseNumber` gives in `exact`: `-1234.50`, `0.00000015`. */
const EXACT = /^(-?)(\d+)(?:\.(\d+))?$/;
const NUMBER = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/;

/** `value` as sign, integer digits and fraction digits, exactly. */
function decompose(value: number | string | bigint): readonly [boolean, string, string] {
  if (typeof value === 'bigint') {
    const text = value.toString();
    return text.startsWith('-') ? [true, text.slice(1), ''] : [false, text, ''];
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw copyFailure('invalid-payload', `${String(value)} is not a finite number.`);
    // `String` gives the shortest text that reads back as the same number: 0.1 is `0.1`.
    const match = NUMBER.exec(String(value)) as RegExpExecArray;
    const sign = String(match[1]);
    const integer = String(match[2]);
    const fraction = match[3] ?? '';
    const shiftBy = Number(match[4] ?? '0');
    const digits = integer + fraction;
    const point = integer.length + shiftBy;
    if (point <= 0) return [sign === '-', '0', '0'.repeat(-point) + digits];
    if (point >= digits.length) return [sign === '-', digits + '0'.repeat(point - digits.length), ''];
    return [sign === '-', digits.slice(0, point), digits.slice(point)];
  }
  const match = EXACT.exec(value);
  if (match === null) throw copyFailure('invalid-payload', `"${value.slice(0, 40)}" is not a decimal number such as "-1234.5".`);
  return [match[1] === '-', String(match[2]), match[3] ?? ''];
}

/** `digits` plus one, carrying: `"199"` gives `"200"`, `"99"` gives `"100"`. */
function increment(digits: string): string {
  let out = '';
  let carry = true;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    const digit: number = Number(digits.charAt(index)) + (carry ? 1 : 0);
    carry = digit === 10;
    out = String(digit % 10) + out;
  }
  return carry ? `1${out}` : out;
}

/** Groups `integer` from the right: the last group of `primary` digits, the others of `secondary`. */
function group(integer: string, separator: string, primary: number, secondary: number): string {
  if (integer.length <= primary) return integer;
  const groups = [integer.slice(-primary)];
  let rest = integer.slice(0, -primary);
  while (rest.length > secondary) {
    groups.unshift(rest.slice(-secondary));
    rest = rest.slice(0, -secondary);
  }
  groups.unshift(rest);
  return groups.join(separator);
}

/**
 * Writes a number in a locale's format, exactly: no float rounding, whatever its size.
 * Takes a `number`, a `bigint`, or an exact decimal string (`parseNumber`'s `exact`), so
 * money read from one locale can be written in another without losing a cent.
 *
 * @throws {CopyFailure} `invalid-payload` for a number that is not finite, a string that is
 * not plain decimal notation, a `fractionDigits` out of range, or a `locale` that is not one.
 * @example
 * formatNumber('1234.5', { locale: 'de-DE', grouping: true, fractionDigits: 2 }); // "1.234,50"
 */
export function formatNumber(value: number | string | bigint, options: FormatNumberOptions = {}): string {
  const symbols = numberSymbols(options.locale ?? 'en-US');
  const digits = options.fractionDigits;
  if (digits !== undefined && !(Number.isInteger(digits) && digits >= 0 && digits <= 100)) {
    throw copyFailure('invalid-payload', `fractionDigits must be a whole number from 0 to 100, not ${String(digits)}.`);
  }
  const [negative, rawInteger, rawFraction] = decompose(value);
  let integer = rawInteger.replace(/^0+(?=\d)/, '');
  let fraction = rawFraction;
  if (digits !== undefined) {
    if (fraction.length > digits) {
      const roundUp = fraction.charAt(digits) >= '5';
      fraction = fraction.slice(0, digits);
      if (roundUp) {
        const rounded = increment(integer + fraction);
        integer = rounded.slice(0, rounded.length - digits);
        fraction = rounded.slice(rounded.length - digits);
      }
    } else fraction = fraction.padEnd(digits, '0');
  }
  const zero = /^0*$/.test(integer + fraction);
  const whole = options.grouping === true ? group(integer, symbols.group, symbols.primary, symbols.secondary) : integer;
  return `${negative && !zero ? '-' : ''}${whole}${fraction === '' ? '' : symbols.decimal + fraction}`;
}

/**
 * A copy payload for a number, written for the locale it will be pasted in: ungrouped by
 * default, so a spreadsheet reads it as a number. Pass it to `copy()` or `useCopy`.
 *
 * @example
 * copy(numberPayload(invoice.total, { locale: navigator.language, fractionDigits: 2 }));
 */
export function numberPayload(value: number | string | bigint, options: FormatNumberOptions = {}): TextPayload {
  return { kind: 'text', value: formatNumber(value, options) };
}
