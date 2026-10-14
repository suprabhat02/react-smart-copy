import { describe, expect, it } from 'vitest';
import { isCopyFailure } from '../../src/core/errors';
import { parseTable, toRecords } from '../../src/table';
import { SHEETS_HTML } from './fixtures';

function failureMessage(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (isCopyFailure(error)) return error.copyError.message;
    throw error;
  }
  throw new Error('Expected a CopyFailure');
}

describe('toRecords', () => {
  it('maps a pasted Google Sheets range by header, with parsing', () => {
    const table = parseTable({ html: SHEETS_HTML, text: null }, { headers: true })!;
    const result = toRecords(table, {
      name: { header: 'Name' },
      seats: { header: ['Seats', 'Licences'], parse: (text) => Number.parseInt(text, 10) },
    });
    expect(result).toEqual({
      records: [
        { name: 'Ada', seats: 42 },
        { name: 'Grace\nHopper', seats: 7 },
      ],
      missing: [],
      errors: [],
      ok: true,
    });
  });

  it('matches headers ignoring case, spacing and full-width forms, and uses the key by default', () => {
    const table = { headers: ['  E-MAIL  ', 'Ｃｉｔｙ', 'full   name'], rows: [['a@x.io', 'Pune', 'Ada L']] };
    const { records } = toRecords(table, { 'e-mail': {}, city: {}, name: { header: 'Full Name' } });
    expect(records).toEqual([{ 'e-mail': 'a@x.io', city: 'Pune', name: 'Ada L' }]);
  });

  it('tries aliases in order', () => {
    const table = { headers: ['Mail'], rows: [['a@x.io']] };
    expect(toRecords(table, { email: { header: ['Email', 'Mail'] } }).records).toEqual([{ email: 'a@x.io' }]);
  });

  it('matches by position without headers, in schema order', () => {
    const table = { headers: null, rows: [['Ada', '36'], ['Grace']] };
    const { records } = toRecords(table, { name: {}, age: { parse: Number } });
    expect(records).toEqual([
      { name: 'Ada', age: 36 },
      { name: 'Grace', age: 0 },
    ]);
  });

  it('can force a matching mode', () => {
    const table = { headers: ['B', 'A'], rows: [['b', 'a']] };
    expect(toRecords(table, { A: {}, B: {} }, { match: 'position' }).records).toEqual([{ A: 'b', B: 'a' }]);
    expect(toRecords(table, { A: {}, B: {} }, { match: 'header' }).records).toEqual([{ A: 'a', B: 'b' }]);
    expect(failureMessage(() => toRecords({ rows: [['x']] }, { A: {} }, { match: 'header' }))).toMatch(/needs a table with headers/);
  });

  it('reports missing required columns and leaves missing values undefined', () => {
    const table = { headers: ['Name'], rows: [['Ada']] };
    const result = toRecords(table, { name: {}, email: { required: true }, phone: {} });
    expect(result.missing).toEqual(['email']);
    expect(result.records).toEqual([{ name: 'Ada', email: undefined, phone: undefined }]);
    expect(result.ok).toBe(false);
  });

  it('reports positional columns past the table width as missing', () => {
    const result = toRecords({ rows: [['only']] }, { a: {}, b: { required: true } });
    expect(result.missing).toEqual(['b']);
  });

  it('collects parse errors with row, key, text and cause, and keeps going', () => {
    const boom = new Error('not a number');
    const table = { headers: ['Qty'], rows: [['1'], ['x'], ['3']] };
    const result = toRecords(table, {
      qty: {
        header: 'Qty',
        parse: (text, context) => {
          if (!/^\d+$/.test(text)) throw boom;
          return Number(text) + context.row * 0;
        },
      },
    });
    expect(result.records).toEqual([{ qty: 1 }, { qty: undefined }, { qty: 3 }]);
    expect(result.errors).toEqual([{ row: 1, key: 'qty', text: 'x', cause: boom }]);
    expect(result.ok).toBe(false);
  });

  it('passes the row and key to parse', () => {
    const seen: unknown[] = [];
    toRecords({ rows: [['a'], ['b']] }, { v: { parse: (text, context) => seen.push([text, context]) } });
    expect(seen).toEqual([
      ['a', { row: 0, key: 'v' }],
      ['b', { row: 1, key: 'v' }],
    ]);
  });

  it('skips empty rows unless told not to', () => {
    const table = { rows: [['a'], [''], ['b']] };
    expect(toRecords(table, { v: {} }).records).toEqual([{ v: 'a' }, { v: 'b' }]);
    expect(toRecords(table, { v: {} }, { skipEmptyRows: false }).records).toEqual([{ v: 'a' }, { v: '' }, { v: 'b' }]);
  });

  it('handles a large paste without spreading rows onto the call stack', () => {
    const rows = Array.from({ length: 200_000 }, (_, index) => [String(index)]);
    expect(toRecords({ rows }, { n: { parse: Number } }).records).toHaveLength(200_000);
  });

  it('validates its input', () => {
    expect(failureMessage(() => toRecords(null as never, { a: {} }))).toMatch(/`rows` array/);
    expect(failureMessage(() => toRecords({ rows: 'x' } as never, { a: {} }))).toMatch(/`rows` array/);
    expect(failureMessage(() => toRecords({ rows: [] }, {}))).toMatch(/at least one field/);
  });
});
