import { describe, expect, it } from 'vitest';
import { isCopyFailure, type CopyErrorType } from '../../src/core/errors';
import {
  DEFAULT_TABLE_MAX_CELLS,
  fromRows,
  tablePayload,
  tableToHtml,
  tableToTsv,
  type TableCell,
  type TableData,
} from '../../src/table';

/** Runs `fn` and returns the classified type of the CopyFailure it throws. */
function failure(fn: () => unknown): { type: CopyErrorType; message: string } {
  try {
    fn();
  } catch (error) {
    if (isCopyFailure(error)) return { type: error.copyError.type, message: error.copyError.message };
    throw error;
  }
  throw new Error('Expected a CopyFailure');
}

const simple: TableData = {
  headers: ['Invoice', 'Client', 'Amount'],
  rows: [
    ['INV-1', 'DesignCo', 12400],
    ['INV-2', 'Northwind', 8950.5],
  ],
};

describe('tableToTsv', () => {
  it('writes header and rows, tab separated, CRLF between rows, no trailing break', () => {
    expect(tableToTsv(simple)).toBe('Invoice\tClient\tAmount\r\nINV-1\tDesignCo\t12400\r\nINV-2\tNorthwind\t8950.5');
  });

  it('quotes cells with tabs, line breaks or quotes, doubling inner quotes', () => {
    const tsv = tableToTsv({ rows: [['a\tb', 'line 1\nline 2', 'say "hi"', 'plain']] });
    expect(tsv).toBe('"a\tb"\t"line 1\nline 2"\t"say ""hi"""\tplain');
  });

  it('normalises CRLF and CR inside cells to LF', () => {
    expect(tableToTsv({ rows: [['a\r\nb', 'c\rd']] })).toBe('"a\nb"\t"c\nd"');
  });

  it('pads ragged rows to the widest row or header', () => {
    expect(tableToTsv({ headers: ['A'], rows: [['1', '2', '3'], []] })).toBe('A\t\t\r\n1\t2\t3\r\n\t\t');
    expect(tableToTsv({ headers: ['A', 'B', 'C'], rows: [['1']] })).toBe('A\tB\tC\r\n1\t\t');
  });

  it('keeps the last row of a one-column table when it is empty', () => {
    expect(tableToTsv({ rows: [['a'], ['']] })).toBe('a\r\n""');
    expect(tableToTsv({ rows: [['a'], [null]] })).toBe('a\r\n""');
    expect(tableToTsv({ rows: [['a'], ['b']] })).toBe('a\r\nb');
    expect(tableToTsv({ rows: [['']] })).toBe('');
    expect(tableToTsv({ headers: ['H'], rows: [['']] })).toBe('H\r\n""');
  });

  it('omits headers when asked, or when there are none', () => {
    expect(tableToTsv(simple, { headers: false })).toBe('INV-1\tDesignCo\t12400\r\nINV-2\tNorthwind\t8950.5');
    expect(tableToTsv({ headers: null, rows: [['x']] })).toBe('x');
    expect(tableToTsv({ headers: undefined, rows: [['x']] })).toBe('x');
  });

  it('allows a header-only table', () => {
    expect(tableToTsv({ headers: ['A', 'B'], rows: [] })).toBe('A\tB');
  });

  it.each<[string, TableCell, string]>([
    ['null', null, ''],
    ['undefined', undefined, ''],
    ['number', 42, '42'],
    ['negative number', -5, '-5'],
    ['float', 0.1 + 0.2, String(0.1 + 0.2)],
    ['NaN', Number.NaN, 'NaN'],
    ['bigint', 12345678901234567890n, '12345678901234567890'],
    ['true', true, 'true'],
    ['false', false, 'false'],
    ['date', new Date('2026-10-14T08:30:00.000Z'), '2026-10-14T08:30:00.000Z'],
    ['invalid date', new Date('nope'), ''],
    ['empty string', '', ''],
  ])('formats %s cells', (_, value, expected) => {
    expect(tableToTsv({ rows: [[value, 'x']] })).toBe(`${expected}\tx`);
  });

  it('accepts dates from another realm', () => {
    const foreign = Object.create(Date.prototype) as Date;
    const real = new Date('2026-01-01T00:00:00.000Z');
    Object.defineProperty(foreign, Symbol.toStringTag, { value: 'Date' });
    Object.defineProperty(foreign, 'getTime', { value: () => real.getTime() });
    Object.defineProperty(foreign, 'toISOString', { value: () => real.toISOString() });
    expect(tableToTsv({ rows: [[foreign]] })).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('formula guard', () => {
  it.each(['=SUM(A1)', '+1', '-1', '@cmd', '\tx', '\rx', '\nx', '＝1', '＋1', '－1', '＠x'])('neutralises text starting with %j', (text) => {
    const tsv = tableToTsv({ rows: [[text, 'x']] });
    const cell = tsv.slice(0, tsv.lastIndexOf('\tx'));
    expect(cell.startsWith("'") || cell.startsWith(`"'`)).toBe(true);
  });

  it('never touches typed numbers, so negatives stay numbers', () => {
    expect(tableToTsv({ rows: [[-5, -1.5, -10n]] })).toBe('-5\t-1.5\t-10');
  });

  it('guards headers too', () => {
    expect(tableToTsv({ headers: ['=cmd'], rows: [['x']] })).toBe("'=cmd\r\nx");
  });

  it('guards text produced by formatCell for text cells, not for typed cells', () => {
    const data: TableData = { rows: [['a', -3]] };
    const tsv = tableToTsv(data, { formatCell: (value) => (typeof value === 'string' ? '=x' : `-${String(value)}`) });
    expect(tsv).toBe("'=x\t--3");
  });

  it('can be turned off for trusted data', () => {
    expect(tableToTsv({ rows: [['=1+1']] }, { formulaGuard: false })).toBe('=1+1');
  });

  it('guards in the HTML flavour as well', () => {
    expect(tableToHtml({ rows: [['=1+1']] })).toContain(">'=1+1</td>");
  });
});

describe('tableToHtml', () => {
  it('builds thead and tbody with escaped content', () => {
    const html = tableToHtml({ headers: ['<b>Name</b>'], rows: [['Tom & "Jerry"']] }, { preserveText: false });
    expect(html).toBe('<table><thead><tr><th>&lt;b&gt;Name&lt;/b&gt;</th></tr></thead><tbody><tr><td>Tom &amp; &quot;Jerry&quot;</td></tr></tbody></table>');
  });

  it('omits thead without headers', () => {
    expect(tableToHtml({ rows: [[1]] })).toBe('<table><tbody><tr><td>1</td></tr></tbody></table>');
  });

  it('marks text cells as text for Excel, leaves typed cells and empty cells alone', () => {
    const html = tableToHtml({ rows: [['00123', 123, '', true, new Date(0)]] });
    expect(html).toContain(`<td style="mso-number-format:'\\@'">00123</td>`);
    expect(html).toContain('<td>123</td>');
    expect(html).toContain('<td></td>');
    expect(html).toContain('<td>true</td>');
    expect(html).toContain('<td>1970-01-01T00:00:00.000Z</td>');
  });

  it('turns line breaks into <br> and keeps significant whitespace', () => {
    const html = tableToHtml({ rows: [['a\nb', '  indented', 'two  spaces', 'tab\there', 'trailing ', 'plain words']] }, { preserveText: false });
    expect(html).toContain('<td>a<br>b</td>');
    expect(html).toContain('<td style="white-space:pre-wrap">  indented</td>');
    expect(html).toContain('<td style="white-space:pre-wrap">two  spaces</td>');
    expect(html).toContain('<td style="white-space:pre-wrap">tab\there</td>');
    expect(html).toContain('<td style="white-space:pre-wrap">trailing </td>');
    expect(html).toContain('<td>plain words</td>');
  });

  it('combines both styles when needed', () => {
    expect(tableToHtml({ rows: [[' x']] })).toContain(`<td style="mso-number-format:'\\@';white-space:pre-wrap"> x</td>`);
  });
});

describe('tablePayload', () => {
  it('returns an HTML payload with a TSV fallback by default', () => {
    const payload = tablePayload(simple);
    expect(payload.kind).toBe('html');
    expect(payload.text).toBe(tableToTsv(simple));
    expect(payload.html).toBe(tableToHtml(simple));
  });

  it('returns a text payload for format "text"', () => {
    expect(tablePayload(simple, { format: 'text' })).toEqual({ kind: 'text', value: tableToTsv(simple) });
  });

  it('accepts format "html" explicitly', () => {
    expect(tablePayload(simple, { format: 'html' }).kind).toBe('html');
  });

  it('rejects an unknown format', () => {
    expect(failure(() => tablePayload(simple, { format: 'csv' as never }))).toMatchObject({ type: 'invalid-payload' });
  });

  it('rejects a table that is a single empty cell', () => {
    expect(failure(() => tablePayload({ rows: [['']] })).message).toMatch(/nothing to copy/);
    expect(failure(() => tablePayload({ rows: [[null]] })).type).toBe('invalid-payload');
  });

  it('accepts a single non-empty cell, and two empty cells', () => {
    expect(tablePayload({ rows: [['x']] })).toMatchObject({ text: 'x' });
    expect(tablePayload({ rows: [['', '']] })).toMatchObject({ text: '\t' });
    expect(tablePayload({ rows: [[''], ['']] })).toMatchObject({ text: '\r\n""' });
  });

  it('passes formatCell context with row, column and header', () => {
    const seen: unknown[] = [];
    tableToTsv(
      { headers: ['H1'], rows: [['a', 'b']] },
      {
        formatCell: (value, context) => {
          seen.push([value, context]);
          return undefined;
        },
      },
    );
    expect(seen).toEqual([
      ['H1', { row: -1, column: 0, header: 'H1' }],
      ['', { row: -1, column: 1, header: undefined }],
      ['a', { row: 0, column: 0, header: 'H1' }],
      ['b', { row: 0, column: 1, header: undefined }],
    ]);
  });

  it('uses formatCell output, escaped', () => {
    const html = tableToHtml({ rows: [[1234.5]] }, { formatCell: (value) => (typeof value === 'number' ? `<${value.toFixed(2)}>` : undefined) });
    expect(html).toContain('<td>&lt;1234.50&gt;</td>');
  });

  it('rejects a formatCell that returns a non-string', () => {
    expect(failure(() => tableToTsv({ rows: [['x']] }, { formatCell: () => 5 as unknown as string })).message).toMatch(/formatCell/);
  });
});

describe('validation', () => {
  it.each<[string, unknown]>([
    ['null', null],
    ['a string', 'rows'],
    ['an object without rows', {}],
    ['rows that are not an array', { rows: 'x' }],
  ])('rejects %s as table data', (_, data) => {
    expect(failure(() => tableToTsv(data as TableData)).type).toBe('invalid-payload');
  });

  it('rejects headers that are not an array', () => {
    expect(failure(() => tableToTsv({ headers: 'A' as never, rows: [['x']] })).message).toMatch(/headers/);
  });

  it('rejects a row that is not an array', () => {
    expect(failure(() => tableToTsv({ rows: [['x'], 'y' as never] })).message).toBe('Row 2 is not an array of cells.');
  });

  it('rejects a header that is not a string', () => {
    expect(failure(() => tableToTsv({ headers: [1 as never], rows: [['x']] })).message).toMatch(/Header 1 must be a string \(received number\)/);
  });

  it.each<[string, unknown, RegExp]>([
    ['an object', { a: 1 }, /is Object/],
    ['an array', [1], /is array/],
    ['a function', () => 1, /is function/],
    ['a symbol', Symbol('s'), /is symbol/],
    ['a Map', new Map(), /is Map/],
  ])('rejects %s as a cell, naming its position', (_, value, pattern) => {
    const { message } = failure(() => tableToTsv({ rows: [['ok', value as TableCell]] }));
    expect(message).toMatch(/Cell at row 1, column 2/);
    expect(message).toMatch(pattern);
  });

  it('rejects an empty table', () => {
    expect(failure(() => tableToTsv({ rows: [] })).message).toMatch(/no cells/);
    expect(failure(() => tableToTsv({ rows: [[], []] })).message).toMatch(/no cells/);
    expect(failure(() => tableToTsv({ headers: ['A'], rows: [] }, { headers: false })).message).toMatch(/no cells/);
  });

  it('enforces maxCells before doing any work, counting the header row', () => {
    const data: TableData = { headers: ['A', 'B'], rows: [['1', '2']] };
    expect(tableToTsv(data, { maxCells: 4 })).toBe('A\tB\r\n1\t2');
    const tooBig = failure(() => tableToTsv(data, { maxCells: 3 }));
    expect(tooBig.type).toBe('too-large');
    expect(tooBig.message).toMatch(/4 cells, over the limit of 3/);
  });

  it('has a one-million-cell default and accepts Infinity', () => {
    expect(DEFAULT_TABLE_MAX_CELLS).toBe(1_000_000);
    const wide: TableData = { rows: [Array.from({ length: 1001 }, () => 'x'), ...Array.from({ length: 999 }, () => ['x'])] };
    expect(failure(() => tableToTsv(wide)).type).toBe('too-large');
    expect(() => tableToTsv(wide, { maxCells: Infinity })).not.toThrow();
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects maxCells %s', (maxCells) => {
    expect(failure(() => tableToTsv(simple, { maxCells })).message).toMatch(/maxCells/);
  });
});

describe('fromRows', () => {
  interface Invoice {
    id: string;
    client: string;
    amount: number;
    paid: boolean;
    meta: { note: string };
  }
  const invoices: Invoice[] = [
    { id: 'INV-1', client: 'DesignCo', amount: 12400, paid: true, meta: { note: 'first' } },
    { id: 'INV-2', client: 'Northwind', amount: 8950, paid: false, meta: { note: 'second' } },
  ];

  it('reads properties and functions, in column order', () => {
    const data = fromRows(invoices, [
      { header: 'Amount', value: 'amount' },
      { header: 'Invoice', value: 'id' },
      { header: 'Note', value: (row, index) => `${String(index + 1)}. ${row.meta.note}` },
    ]);
    expect(data).toEqual({
      headers: ['Amount', 'Invoice', 'Note'],
      rows: [
        [12400, 'INV-1', '1. first'],
        [8950, 'INV-2', '2. second'],
      ],
    });
    expect(tablePayload(data).text).toBe('Amount\tInvoice\tNote\r\n12400\tINV-1\t1. first\r\n8950\tINV-2\t2. second');
  });

  it('handles an empty row list', () => {
    expect(fromRows<Invoice>([], [{ header: 'Invoice', value: 'id' }])).toEqual({ headers: ['Invoice'], rows: [] });
  });

  it('reads nothing from non-object rows', () => {
    expect(fromRows([null, 5] as unknown as { a: string }[], [{ header: 'A', value: 'a' }]).rows).toEqual([[undefined], [undefined]]);
  });

  it('validates its input', () => {
    expect(failure(() => fromRows('x' as never, [{ header: 'A', value: () => 1 }])).message).toMatch(/array of rows/);
    expect(failure(() => fromRows([], [])).message).toMatch(/at least one column/);
    expect(failure(() => fromRows([], 'x' as never)).message).toMatch(/at least one column/);
    expect(failure(() => fromRows([], [null as never])).message).toMatch(/Column 1 needs a string `header`/);
    expect(failure(() => fromRows([], [{ header: 5 } as never])).message).toMatch(/Column 1 needs a string `header`/);
    expect(failure(() => fromRows([], [{ header: 'A', value: 5 } as never])).message).toMatch(/Column "A" needs a `value`/);
  });
});
