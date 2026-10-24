/** A currency written next to a number. */
export interface NumberCurrency {
  /** As it was written, normalized: `\u20AC`, `R$`, `kr`, `USD`. */
  readonly symbol: string;
  /** Its ISO 4217 code, when the symbol names one currency: `null` for `$`, `\u00A5`, `kr` and `Rs`. */
  readonly code: string | null;
}

/**
 * Currency symbols, after NFKC (so `\uFF04` is `$` and `\u20A8` is `Rs`). Symbols that several
 * currencies share have no code: the text alone can't tell a dollar from another.
 */
const SYMBOLS: readonly (readonly [string, string | null])[] = [
  ['US$', 'USD'], ['CA$', 'CAD'], ['C$', 'CAD'], ['AU$', 'AUD'], ['A$', 'AUD'], ['NZ$', 'NZD'], ['HK$', 'HKD'],
  ['S$', 'SGD'], ['R$', 'BRL'], ['MX$', 'MXN'], ['NT$', 'TWD'], ['$', null],
  ['\u20AC', 'EUR'], ['\u00A3', 'GBP'], ['JP\u00A5', 'JPY'], ['CN\u00A5', 'CNY'], ['\u00A5', null],
  ['\u20B9', 'INR'], ['Rs.', null], ['Rs', null], ['\u20A9', 'KRW'], ['\u20BD', 'RUB'], ['\u20BA', 'TRY'],
  ['\u20AA', 'ILS'], ['\u20AB', 'VND'], ['\u20B1', 'PHP'], ['\u0E3F', 'THB'], ['\u20B4', 'UAH'], ['\u20A6', 'NGN'],
  ['\u20B8', 'KZT'], ['\u09F3', 'BDT'], ['z\u0142', 'PLN'], ['K\u010D', 'CZK'], ['kr.', null], ['kr', null], ['Fr.', 'CHF'],
];

/** Longest first, so `US$` is read before `$` and `Rs.` before `Rs`. */
const BY_LENGTH = [...SYMBOLS].sort((a, b) => b[0].length - a[0].length).map(([symbol, code]) => [symbol, symbol.toLowerCase(), code] as const);

let codes: ReadonlySet<string> | null | undefined;

/** Whether `code` (upper case) is an ISO 4217 code the runtime knows; any three letters where it can't say. */
export function isCurrencyCode(code: string): boolean {
  if (codes === undefined) {
    const supported = (Intl as { supportedValuesOf?: (key: 'currency') => string[] }).supportedValuesOf;
    codes = typeof supported === 'function' ? new Set(supported('currency')) : null;
  }
  return /^[A-Z]{3}$/.test(code) && (codes === null || codes.has(code));
}

/** For tests: forget the runtime's codes, so they are read again. */
export function resetCurrencyCodes(): void {
  codes = undefined;
}

const LETTER = /\p{L}/u;

/**
 * The currency at the start of `text`, and how many characters it takes. A symbol or code
 * made of letters must end there: `Rs` is not read from `Rsx`, nor `USD` from `USDT`.
 */
export function readCurrency(text: string): { readonly currency: NumberCurrency; readonly length: number } | null {
  const lower = text.toLowerCase();
  for (const [symbol, key, code] of BY_LENGTH) {
    if (lower.startsWith(key) && !(LETTER.test(symbol.slice(-1)) && LETTER.test(text.charAt(key.length)))) {
      return { currency: { symbol, code }, length: key.length };
    }
  }
  const word = /^\p{L}+/u.exec(text)?.[0] ?? '';
  const code = word.toUpperCase();
  return word.length === 3 && isCurrencyCode(code) ? { currency: { symbol: code, code }, length: 3 } : null;
}
