import { copyFailure } from '../core/errors';

/** How a locale writes numbers, in Latin digits. */
export interface NumberSymbols {
  /** The decimal separator. */
  readonly decimal: '.' | ',';
  /** The group separator, as the locale writes it (a no-break space in French, for one); `''` for none. */
  readonly group: string;
  /** Digits in the last group of the integer part: 3 almost everywhere. */
  readonly primary: number;
  /** Digits in the groups before it: 2 in India's lakh and crore grouping, 3 elsewhere. */
  readonly secondary: number;
}

const cache = new Map<string, NumberSymbols>();
const CACHE_SIZE = 32;

/**
 * How `locale` writes numbers, from `Intl.NumberFormat`.
 *
 * @throws {CopyFailure} `invalid-payload` for a string that is not a locale.
 */
export function numberSymbols(locale: string): NumberSymbols {
  const cached = cache.get(locale);
  if (cached !== undefined) return cached;
  let parts: Intl.NumberFormatPart[];
  try {
    parts = new Intl.NumberFormat(locale, { numberingSystem: 'latn' }).formatToParts(123456789012.5);
  } catch (cause) {
    throw copyFailure('invalid-payload', `"${locale}" is not a locale.`, cause);
  }
  // 123,456,789,012 in most locales; 1,23,45,67,89,012 in India's.
  const integers = parts.filter((part) => part.type === 'integer').map((part) => part.value.length);
  const symbols: NumberSymbols = {
    decimal: parts.some((part) => part.type === 'decimal' && part.value === ',') ? ',' : '.',
    // A locale that writes no group separator has none to add.
    group: parts.find((part) => part.type === 'group')?.value ?? '',
    primary: Number(integers[integers.length - 1]),
    secondary: Number(integers[Math.max(0, integers.length - 2)]),
  };
  // A small cache: locales come from settings, but a hostile caller could pass many.
  if (cache.size >= CACHE_SIZE) cache.clear();
  cache.set(locale, symbols);
  return symbols;
}
