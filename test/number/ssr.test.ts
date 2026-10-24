// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { formatNumber, numberPayload, parseNumber } from '../../src/number';

describe('react-smart-copy/number on the server', () => {
  it('has no DOM to rely on here', () => {
    expect(typeof document).toBe('undefined');
  });

  it('reads and writes amounts anywhere: imports, webhooks, reports', () => {
    const rows = ['1.234,50 \u20AC', '$ 99.99', '(12.00)', '12,34,567'];
    expect(rows.map((row) => parseNumber(row, { locale: 'de-DE' })?.exact)).toEqual(['1234.50', '99.99', '-12.00', '1234567']);
    expect(formatNumber('1234567.5', { locale: 'en-IN', grouping: true, fractionDigits: 2 })).toBe('12,34,567.50');
    expect(numberPayload(0.1)).toEqual({ kind: 'text', value: '0.1' });
  });
});
