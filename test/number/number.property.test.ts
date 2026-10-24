import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { formatNumber, NUMBER_MAX_LENGTH, parseNumber } from '../../src/number';
import { runs } from '../property';

const LOCALES = ['en-US', 'de-DE', 'fr-FR', 'en-IN', 'de-CH', 'es-ES', 'pt-BR', 'it-IT', 'nl-NL', 'ja-JP', 'ar-EG', 'hi-IN', 'ru-RU', 'pl-PL', 'sv-SE'] as const;

/** An exact decimal, as `parseNumber` writes one: no leading zeros, any fraction. */
const exactDecimal = fc
  .tuple(fc.boolean(), fc.stringMatching(/^(?:0|[1-9][0-9]{0,24})$/), fc.option(fc.stringMatching(/^[0-9]{1,12}$/), { nil: undefined }))
  .map(([negative, integer, fraction]) => {
    const digits = fraction === undefined ? integer : `${integer}.${fraction}`;
    return negative && /[1-9]/.test(digits) ? `-${digits}` : digits;
  });

describe('parseNumber, for any text', () => {
  it('never throws, and what it reads is finite and exact', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 80 }), fc.constantFrom(...LOCALES), (text, locale) => {
        const parsed = parseNumber(text, { locale });
        if (parsed === null) return;
        expect(Number.isFinite(parsed.value)).toBe(true);
        expect(parsed.exact).toMatch(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/);
        expect(parsed.value).toBe(Number(parsed.exact));
      }),
      runs(1000),
    );
  });

  it('never throws on text made of number characters', () => {
    const chars = fc.constantFrom('0', '1', '5', '9', '.', ',', ' ', "'", '-', '+', '(', ')', '%', '$', '\u20AC', 'e', 'E', '\u066B', '\u00A0', '\u2212');
    fc.assert(
      fc.property(fc.array(chars, { maxLength: 30 }), fc.constantFrom(...LOCALES), (parts, locale) => {
        const parsed = parseNumber(parts.join(''), { locale });
        if (parsed !== null) expect(parsed.value).toBe(Number(parsed.exact));
      }),
      runs(2000),
    );
  });
});

describe('formatNumber and parseNumber together', () => {
  it('read back exactly what was written, in any locale, grouped or not', () => {
    fc.assert(
      fc.property(exactDecimal, fc.constantFrom(...LOCALES), fc.boolean(), (exact, locale, grouping) => {
        const text = formatNumber(exact, { locale, grouping });
        const parsed = parseNumber(text, { locale });
        expect(parsed?.exact, text).toBe(exact);
      }),
      runs(1000),
    );
  });

  it('read back a number with a currency or a percent sign around it', () => {
    fc.assert(
      fc.property(
        exactDecimal,
        fc.constantFrom(...LOCALES),
        fc.constantFrom((text: string) => `$${text}`, (text: string) => `${text} \u20AC`, (text: string) => `${text}%`, (text: string) => `USD ${text}`),
        (exact, locale, wrap) => {
          const parsed = parseNumber(wrap(formatNumber(exact, { locale, grouping: true })), { locale });
          expect(parsed?.exact).toBe(exact);
        },
      ),
      runs(500),
    );
  });

  it('write any finite double so that it reads back as the same double', () => {
    fc.assert(
      fc.property(fc.double({ noNaN: true, noDefaultInfinity: true }), fc.constantFrom(...LOCALES), (value, locale) => {
        const text = formatNumber(value, { locale });
        if (text.length > NUMBER_MAX_LENGTH) return;
        expect(parseNumber(text, { locale })?.value).toBe(value === 0 ? 0 : value);
      }),
      runs(1000),
    );
  });
});
