// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { formatNumber, numberPayload, parseNumber } from '../../src/number';

const invalid = expect.objectContaining({ copyError: expect.objectContaining({ type: 'invalid-payload' }) });

describe('formatNumber', () => {
  it('writes numbers ungrouped by default, with the locale\'s decimal separator', () => {
    expect(formatNumber(1234.5)).toBe('1234.5');
    expect(formatNumber(1234.5, { locale: 'de-DE' })).toBe('1234,5');
    expect(formatNumber(-0.25, { locale: 'fr-FR' })).toBe('-0,25');
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(-0)).toBe('0');
    expect(formatNumber(42)).toBe('42');
  });

  it('groups the integer part the locale\'s way', () => {
    expect(formatNumber(1234567.891, { grouping: true })).toBe('1,234,567.891');
    expect(formatNumber(1234567.891, { locale: 'de-DE', grouping: true })).toBe('1.234.567,891');
    expect(formatNumber(1234567, { locale: 'en-IN', grouping: true })).toBe('12,34,567');
    expect(formatNumber('123456789012', { locale: 'en-IN', grouping: true })).toBe('1,23,45,67,89,012');
    expect(formatNumber(1234.5, { locale: 'fr-FR', grouping: true })).toBe('1\u202F234,5');
    expect(formatNumber(123, { grouping: true })).toBe('123');
    expect(formatNumber(1234, { grouping: true })).toBe('1,234');
  });

  it('writes numbers of any size and precision exactly', () => {
    expect(formatNumber(1e21)).toBe('1000000000000000000000');
    expect(formatNumber(1.5e-7)).toBe('0.00000015');
    expect(formatNumber(-1.25e2)).toBe('-125');
    expect(formatNumber(1.2345e3)).toBe('1234.5');
    expect(formatNumber(0.1)).toBe('0.1');
    expect(formatNumber(12345678901234567890n, { grouping: true })).toBe('12,345,678,901,234,567,890');
    expect(formatNumber(-5n)).toBe('-5');
    expect(formatNumber('-0001234.50')).toBe('-1234.50');
    expect(formatNumber('99999999999999999999.99', { locale: 'de-DE' })).toBe('99999999999999999999,99');
  });

  it('rounds to fractionDigits, half away from zero, carrying', () => {
    expect(formatNumber('1.005', { fractionDigits: 2 })).toBe('1.01');
    expect(formatNumber(1.005, { fractionDigits: 2 })).toBe('1.01');
    expect(formatNumber('-1.005', { fractionDigits: 2 })).toBe('-1.01');
    expect(formatNumber('1.004', { fractionDigits: 2 })).toBe('1.00');
    expect(formatNumber('9.999', { fractionDigits: 2 })).toBe('10.00');
    expect(formatNumber('999.5', { fractionDigits: 0, grouping: true })).toBe('1,000');
    expect(formatNumber('0.5', { fractionDigits: 0 })).toBe('1');
    expect(formatNumber('-0.004', { fractionDigits: 2 })).toBe('0.00');
    expect(formatNumber(5, { fractionDigits: 3 })).toBe('5.000');
    expect(formatNumber('1.25', { fractionDigits: 100 })).toBe(`1.25${'0'.repeat(98)}`);
  });

  it('round-trips what parseNumber reads, between locales', () => {
    const parsed = parseNumber('1.234.567,89 \u20AC', { locale: 'de-DE' });
    expect(formatNumber(parsed?.exact ?? '', { locale: 'en-IN', grouping: true })).toBe('12,34,567.89');
  });

  it('throws for what it cannot write', () => {
    for (const value of [Number.NaN, Infinity, -Infinity]) expect(() => formatNumber(value)).toThrow(invalid);
    for (const value of ['', '1,5', '1e5', ' 1', '+1', '.5', '1.', 'abc']) expect(() => formatNumber(value), value).toThrow(invalid);
    for (const fractionDigits of [-1, 101, 1.5, Number.NaN]) expect(() => formatNumber(1, { fractionDigits })).toThrow(invalid);
    expect(() => formatNumber(1, { locale: '' })).toThrow(invalid);
    // A long string is cut in the message.
    expect(() => formatNumber('x'.repeat(1000))).toThrow(/"x{40}" is not/);
  });
});

describe('numberPayload', () => {
  it('is a text payload with the number written for the locale', () => {
    expect(numberPayload(1234.5, { locale: 'de-DE', fractionDigits: 2 })).toEqual({ kind: 'text', value: '1234,50' });
    expect(numberPayload('-7')).toEqual({ kind: 'text', value: '-7' });
  });
});
