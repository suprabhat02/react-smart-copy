// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NUMBER_MAX_LENGTH, parseNumber, type ParseNumberOptions } from '../../src/number';
import { isCurrencyCode, readCurrency, resetCurrencyCodes } from '../../src/number/currency';

/** `exact` of the number read, or `null`. */
const exact = (text: string, options?: ParseNumberOptions): string | null => parseNumber(text, options)?.exact ?? null;

describe('parseNumber: separators', () => {
  it('reads plain numbers, signs and leading zeros', () => {
    expect(parseNumber('1234')).toEqual({ value: 1234, exact: '1234', kind: 'number', currency: null, ambiguous: false });
    expect(exact('  -42  ')).toBe('-42');
    expect(exact('+42')).toBe('42');
    expect(exact('007')).toBe('7');
    expect(exact('0')).toBe('0');
    expect(exact('-0')).toBe('0');
    expect(exact('-0.00')).toBe('0.00');
    expect(exact('.5')).toBe('0.5');
    expect(exact(',5')).toBe('0.5');
    expect(exact('-.5')).toBe('-0.5');
  });

  it('reads grouped numbers in any locale\'s style', () => {
    expect(exact('1,234,567.89')).toBe('1234567.89');
    expect(exact('1.234.567,89')).toBe('1234567.89');
    expect(exact('1 234 567,89')).toBe('1234567.89');
    // No-break and narrow no-break spaces (French), and apostrophes (Swiss), straight or curly.
    expect(exact('1\u00A0234\u00A0567,89')).toBe('1234567.89');
    expect(exact('1\u202F234,5')).toBe('1234.5');
    expect(exact("1'234'567.89")).toBe('1234567.89');
    expect(exact('1\u2019234.5')).toBe('1234.5');
    // Lakh and crore.
    expect(exact('12,34,567.00')).toBe('1234567.00');
    expect(exact('1,23,45,678')).toBe('12345678');
    expect(exact('1.234.567')).toBe('1234567');
    expect(exact('1 234')).toBe('1234');
  });

  it('keeps the fraction as written, trailing zeros too', () => {
    expect(exact('1234.50')).toBe('1234.50');
    expect(exact('0.1')).toBe('0.1');
    expect(parseNumber('0.1')?.value).toBe(0.1);
    expect(exact('12345678901234567890.123456789')).toBe('12345678901234567890.123456789');
  });

  it('turns away numbers grouped wrongly, and text that holds more than one number', () => {
    for (const text of ['1234,567,890', '1,234.567,8', '1.2.3', '12 34', '1  234', '1,23,4567', ',123,456', '1.234,567.8']) {
      expect(exact(text), text).toBeNull();
    }
    expect(exact('1,234,5')).toBeNull();
    // Two kinds of group separator.
    expect(exact("1,234'567")).toBeNull();
  });

  it('settles a lone separator before three digits by the locale, and says so', () => {
    expect(parseNumber('1,234')).toMatchObject({ exact: '1234', ambiguous: true });
    expect(parseNumber('1.234')).toMatchObject({ exact: '1.234', ambiguous: true });
    expect(parseNumber('1,234', { locale: 'de-DE' })).toMatchObject({ exact: '1.234', ambiguous: true });
    expect(parseNumber('1.234', { locale: 'de-DE' })).toMatchObject({ exact: '1234', ambiguous: true });
    expect(parseNumber('-123,456', { locale: 'fr-FR' })).toMatchObject({ exact: '-123.456', ambiguous: true });
  });

  it('reads a lone separator one way when only one way makes sense', () => {
    expect(parseNumber('1,5')).toMatchObject({ exact: '1.5', ambiguous: false });
    expect(parseNumber('1,2345')).toMatchObject({ exact: '1.2345', ambiguous: false });
    expect(parseNumber('12,34')).toMatchObject({ exact: '12.34', ambiguous: false });
    expect(parseNumber('1234,567')).toMatchObject({ exact: '1234.567', ambiguous: false });
    expect(parseNumber('0,500')).toMatchObject({ exact: '0.500', ambiguous: false });
    expect(parseNumber('.500', { locale: 'de-DE' })).toMatchObject({ exact: '0.500', ambiguous: false });
    expect(parseNumber('1.234,5', { locale: 'en-US' })).toMatchObject({ exact: '1234.5', ambiguous: false });
    expect(parseNumber('1,234.5', { locale: 'de-DE' })).toMatchObject({ exact: '1234.5', ambiguous: false });
  });
});

describe('parseNumber: what is around the number', () => {
  it('reads currency symbols and codes, before or after', () => {
    expect(parseNumber('$1,234.50')).toMatchObject({ exact: '1234.50', currency: { symbol: '$', code: null } });
    expect(parseNumber('1.234,50 \u20AC')).toMatchObject({ exact: '1234.50', currency: { symbol: '\u20AC', code: 'EUR' } });
    expect(parseNumber('\u20B9 12,34,567')).toMatchObject({ exact: '1234567', currency: { code: 'INR' } });
    expect(parseNumber('R$ 1.234,56')).toMatchObject({ exact: '1234.56', currency: { symbol: 'R$', code: 'BRL' } });
    expect(parseNumber('US$5')).toMatchObject({ currency: { symbol: 'US$', code: 'USD' } });
    expect(parseNumber("CHF 1'234.50")).toMatchObject({ exact: '1234.50', currency: { symbol: 'CHF', code: 'CHF' } });
    expect(parseNumber('1234 usd')).toMatchObject({ currency: { symbol: 'USD', code: 'USD' } });
    expect(parseNumber('12,50 z\u0142')).toMatchObject({ exact: '12.50', currency: { code: 'PLN' } });
    expect(parseNumber('100 kr')).toMatchObject({ currency: { symbol: 'kr', code: null } });
    expect(parseNumber('\uFFE5500')).toMatchObject({ currency: { symbol: '\u00A5', code: null } });
    // The rupee sign \u20A8 is "Rs" after NFKC; a dot after Rs belongs to it.
    expect(parseNumber('\u20A8 500')).toMatchObject({ exact: '500', currency: { symbol: 'Rs' } });
    expect(parseNumber('Rs.500')).toMatchObject({ exact: '500', currency: { symbol: 'Rs.' } });
    expect(parseNumber('Rs 1,500')).toMatchObject({ exact: '1500', currency: { symbol: 'Rs' } });
  });

  it('turns away unknown codes, words, and two currencies', () => {
    expect(parseNumber('ABC 5')).toBeNull();
    expect(parseNumber('USDT 5')).toBeNull();
    expect(parseNumber('Rsx 5')).toBeNull();
    expect(parseNumber('$5 \u20AC')).toBeNull();
    expect(parseNumber('about 5')).toBeNull();
    expect(parseNumber('5 apples')).toBeNull();
  });

  it('reads minus signs, trailing minus and accounting brackets', () => {
    expect(exact('\u22125')).toBe('-5');
    expect(exact('\u20135')).toBe('-5');
    expect(exact('\uFF0D5')).toBe('-5');
    expect(exact('1,234-')).toBe('-1234');
    expect(exact('(1,234.00)')).toBe('-1234.00');
    expect(exact('($ 1,234)')).toBe('-1234');
    expect(exact('-$5')).toBe('-5');
    expect(exact('$-5')).toBe('-5');
    expect(exact('5 \u20AC-')).toBe('-5');
    expect(exact('(0)')).toBe('0');
  });

  it('turns away signs and brackets that do not pair up', () => {
    for (const text of ['--5', '-5-', '+5-', '5+', '(5', '5)', ')5(', '-(5)', '((5))', '(5))', '5 - 3', '1-2', '555-0102']) {
      expect(exact(text), text).toBeNull();
    }
  });

  it('reads percent and per mille, before or after, but not with a currency', () => {
    expect(parseNumber('12.5%')).toMatchObject({ value: 12.5, kind: 'percent' });
    expect(parseNumber('%50')).toMatchObject({ value: 50, kind: 'percent' });
    expect(parseNumber('-3 %')).toMatchObject({ value: -3, kind: 'percent' });
    expect(parseNumber('\uFF05 7')).toMatchObject({ value: 7, kind: 'percent' });
    expect(parseNumber('\u0665\u066A')).toMatchObject({ value: 5, kind: 'percent' });
    expect(parseNumber('2\u2030')).toMatchObject({ value: 2, kind: 'permille' });
    expect(parseNumber('5%%')).toBeNull();
    expect(parseNumber('5%\u2030')).toBeNull();
    expect(parseNumber('$5%')).toBeNull();
  });

  it('reads scientific notation as spreadsheets copy it', () => {
    expect(exact('1.5E-7')).toBe('0.00000015');
    expect(exact('1,5E-7')).toBe('0.00000015');
    expect(exact('-2.50e3')).toBe('-2500');
    expect(exact('1.23456e2')).toBe('123.456');
    expect(exact('1E+21')).toBe('1000000000000000000000');
    expect(exact('12E0')).toBe('12');
    expect(exact('5.E3')).toBe('5000');
    expect(exact('0.0E5')).toBe('0');
    expect(exact('1e308')).toBe(`1${'0'.repeat(308)}`);
    // Grouped, too big for a number, or an exponent past any number.
    expect(exact('1,234,5E3')).toBeNull();
    expect(exact('1e309')).toBeNull();
    expect(exact('1e401')).toBeNull();
    expect(exact('1e1000')).toBeNull();
    expect(exact('1e-401')).toBeNull();
  });

  it('reads digits of other scripts, full-width text, and Arabic separators', () => {
    expect(exact('\u0661\u066C\u0662\u0663\u0664\u066B\u0665')).toBe('1234.5');
    expect(exact('\u0967,\u0968\u0969,\u096A\u096B\u096C')).toBe('123456');
    expect(exact('\uFF11\uFF0C\uFF12\uFF13\uFF14\uFF0E\uFF15')).toBe('1234.5');
    expect(exact('\u06F1\u06F2\u066B\u06F5')).toBe('12.5');
    // An Arabic decimal separator is one wherever it is, and only once.
    expect(exact('1.234\u066B5')).toBeNull();
    expect(exact('1\u066B2\u066B3')).toBeNull();
    expect(exact('1 234\u066B5')).toBe('1234.5');
    expect(exact('1\u066B5,6')).toBeNull();
  });

  it('turns away everything else', () => {
    for (const text of ['', '   ', 'abc', '-', '.', ',', '%', '$', '12/10/2026', '10:30', '1.2.3.4', '3.14.15', '5.', '5,', 'v1.2', '1_000', '0x1F', 'Infinity', 'NaN', '1/2', '\u00BD', '12abc34']) {
      expect(exact(text), text).toBeNull();
    }
  });

  it('reads at most NUMBER_MAX_LENGTH characters', () => {
    expect(exact('1'.repeat(NUMBER_MAX_LENGTH))).toBe('1'.repeat(NUMBER_MAX_LENGTH));
    expect(exact('1'.repeat(NUMBER_MAX_LENGTH + 1))).toBeNull();
  });
});

describe('parseNumber on hostile text', () => {
  it('runs in linear time, whatever the text', () => {
    const size = NUMBER_MAX_LENGTH;
    const hostile = ['1,'.repeat(size / 2), '1 '.repeat(size / 2), '$'.repeat(size), '-'.repeat(size - 1) + '1', '('.repeat(size - 1) + '1', '1' + 'e'.repeat(size - 1), 'kr'.repeat(size / 2 - 1) + '1', `1${'%'.repeat(size - 1)}`, '.'.repeat(size - 1) + '1'];
    for (const text of hostile) {
      const started = performance.now();
      for (let round = 0; round < 200; round += 1) parseNumber(text);
      expect(performance.now() - started, text.slice(0, 10)).toBeLessThan(1000);
    }
  });
});

describe('parseNumber: options', () => {
  it('can turn away negatives, fractions, currencies and percentages', () => {
    expect(parseNumber('-5', { negative: false })).toBeNull();
    expect(parseNumber('(5)', { negative: false })).toBeNull();
    expect(parseNumber('-0', { negative: false })?.exact).toBe('0');
    expect(parseNumber('1.5', { fraction: false })).toBeNull();
    expect(parseNumber('1.00', { fraction: false })?.exact).toBe('1.00');
    expect(parseNumber('1,234', { fraction: false })?.exact).toBe('1234');
    expect(parseNumber('$5', { currency: false })).toBeNull();
    expect(parseNumber('5', { currency: false })?.exact).toBe('5');
    expect(parseNumber('5%', { percent: false })).toBeNull();
    expect(parseNumber('5', { percent: false, negative: false, fraction: false })?.exact).toBe('5');
  });

  it('throws for a locale that is not one', () => {
    for (const locale of ['', 'not a locale', 'en_US!']) {
      expect(() => parseNumber('5', { locale })).toThrow(expect.objectContaining({ copyError: expect.objectContaining({ type: 'invalid-payload' }) }));
    }
  });
});

describe('currency codes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetCurrencyCodes();
  });

  it('knows ISO 4217 codes from the runtime', () => {
    expect(isCurrencyCode('EUR')).toBe(true);
    expect(isCurrencyCode('XYZ')).toBe(false);
    expect(isCurrencyCode('eur')).toBe(false);
    expect(readCurrency('kr.5')).toEqual({ currency: { symbol: 'kr.', code: null }, length: 3 });
  });

  it('takes any three letters where the runtime cannot list codes', () => {
    resetCurrencyCodes();
    vi.stubGlobal('Intl', { ...Intl, supportedValuesOf: undefined });
    expect(isCurrencyCode('XYZ')).toBe(true);
    expect(isCurrencyCode('XY1')).toBe(false);
  });
});
