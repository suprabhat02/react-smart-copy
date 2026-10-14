import { afterEach, describe, expect, it, vi } from 'vitest';
import { isCopyFailure, type CopyErrorType } from '../../src/core/errors';
import {
  DEFAULT_PARSE_MAX_CELLS,
  DEFAULT_PARSE_MAX_COLUMNS,
  DEFAULT_PARSE_MAX_LENGTH,
  DEFAULT_PARSE_MAX_ROWS,
  fromTableElement,
  parseDelimited,
  parseHtmlTable,
  parseTable,
  tablePayload,
} from '../../src/table';
import { EXCEL_HTML, EXCEL_TSV, SHEETS_HTML, WEB_HTML, WORD_HTML } from './fixtures';

function failure(fn: () => unknown): { type: CopyErrorType; message: string } {
  try {
    fn();
  } catch (error) {
    if (isCopyFailure(error)) return { type: error.copyError.type, message: error.copyError.message };
    throw error;
  }
  throw new Error('Expected a CopyFailure');
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('parseDelimited', () => {
  it('reads what Excel puts in text/plain', () => {
    expect(parseDelimited(EXCEL_TSV)).toEqual({
      headers: null,
      rows: [
        ['Code', 'Qty', 'Note'],
        ['00123', '5', 'line one\nline two'],
        ['Merged A–B', '', 'Tom & Jerry'],
      ],
      columnCount: 3,
      source: 'text',
      truncated: false,
    });
  });

  it('uses the first row as header when asked', () => {
    const table = parseDelimited(EXCEL_TSV, { headers: true });
    expect(table?.headers).toEqual(['Code', 'Qty', 'Note']);
    expect(table?.rows).toHaveLength(2);
  });

  it.each([
    ['LF', 'a\tb\nc\td'],
    ['CRLF', 'a\tb\r\nc\td'],
    ['CR', 'a\tb\rc\td'],
    ['trailing LF', 'a\tb\nc\td\n'],
    ['trailing CRLF', 'a\tb\r\nc\td\r\n'],
    ['trailing CR', 'a\tb\rc\td\r'],
  ])('splits rows on %s', (_, text) => {
    expect(parseDelimited(text)?.rows).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('keeps a deliberately empty last row of cells', () => {
    expect(parseDelimited('a\tb\n\t\n')?.rows).toEqual([
      ['a', 'b'],
      ['', ''],
    ]);
  });

  it('keeps blank lines in the middle as empty rows', () => {
    expect(parseDelimited('a\n\nb')?.rows).toEqual([['a'], [''], ['b']]);
  });

  it('handles quoting the way Excel does', () => {
    expect(parseDelimited('"a\tb"\t"say ""hi"""\t"multi\r\nline"')?.rows).toEqual([['a\tb', 'say "hi"', 'multi\r\nline']]);
    // A quote that isn't at the start of a field is an ordinary character.
    expect(parseDelimited('5" screen\tx')?.rows).toEqual([['5" screen', 'x']]);
    // Text after a closing quote is kept.
    expect(parseDelimited('"a"b\tc')?.rows).toEqual([['ab', 'c']]);
    // Empty quoted field.
    expect(parseDelimited('""\tx')?.rows).toEqual([['', 'x']]);
  });

  it('reads an unterminated quote as a literal character', () => {
    expect(parseDelimited('"open\tx\ny\tz')?.rows).toEqual([
      ['"open', 'x'],
      ['y', 'z'],
    ]);
  });

  it('after one unterminated quote, reads every later quote literally too', () => {
    // From the first quote there are only doubled quotes, so it never closes.
    expect(parseDelimited('"open\tx\n""')?.rows).toEqual([['"open', 'x'], ['""', '']]);
  });

  it('pads ragged rows', () => {
    expect(parseDelimited('a\nb\tc\td')).toMatchObject({ rows: [['a', '', ''], ['b', 'c', 'd']], columnCount: 3 });
  });

  it('returns null without any content', () => {
    expect(parseDelimited('')).toBeNull();
    expect(parseDelimited('\n')).toBeNull();
    expect(parseDelimited('\t\t\r\n\t')).toBeNull();
  });

  it('supports another delimiter and trimming', () => {
    expect(parseDelimited('a , b\n c,d ', { delimiter: ',', trim: true })?.rows).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(parseDelimited(' a \t b ')?.rows).toEqual([[' a ', ' b ']]);
  });

  it.each(['', 'ab', '"', '\n', '\r', 5])('rejects delimiter %j', (delimiter) => {
    expect(failure(() => parseDelimited('a', { delimiter: delimiter as string })).message).toMatch(/delimiter/);
  });

  it('rejects non-string input', () => {
    expect(failure(() => parseDelimited(5 as never)).type).toBe('invalid-payload');
  });

  it('truncates past maxRows, maxColumns and maxCells, and says so', () => {
    expect(parseDelimited('a\nb\nc', { maxRows: 2 })).toMatchObject({ rows: [['a'], ['b']], truncated: true });
    expect(parseDelimited('a\tb\tc\nd\te\tf', { maxColumns: 2 })).toMatchObject({ rows: [['a', 'b'], ['d', 'e']], truncated: true });
    expect(parseDelimited('a\tb\nc\td\ne\tf', { maxCells: 4 })).toMatchObject({ rows: [['a', 'b'], ['c', 'd']], truncated: true });
  });

  it('does not report truncation when only the final line break was left', () => {
    expect(parseDelimited('a\nb\n', { maxRows: 2 })).toMatchObject({ rows: [['a'], ['b']], truncated: false });
    expect(parseDelimited('a\nb\r\n', { maxRows: 2 })).toMatchObject({ truncated: false });
  });

  it('fails with too-large past maxLength', () => {
    expect(failure(() => parseDelimited('abcdef', { maxLength: 5 }))).toMatchObject({ type: 'too-large' });
    expect(parseDelimited('abcde', { maxLength: 5 })).not.toBeNull();
  });

  it.each(['maxRows', 'maxColumns', 'maxCells', 'maxLength'] as const)('rejects an invalid %s', (name) => {
    expect(failure(() => parseDelimited('a', { [name]: 0 })).message).toMatch(name);
    expect(parseDelimited('a', { [name]: Infinity })).not.toBeNull();
  });

  it('exposes its defaults', () => {
    expect([DEFAULT_PARSE_MAX_ROWS, DEFAULT_PARSE_MAX_COLUMNS, DEFAULT_PARSE_MAX_CELLS, DEFAULT_PARSE_MAX_LENGTH]).toEqual([
      100_000, 16_384, 1_000_000, 32 * 1024 * 1024,
    ]);
  });

  it('stays linear on hostile input: thousands of unterminated quotes', () => {
    const hostile = '"x\t'.repeat(50_000);
    const started = performance.now();
    const table = parseDelimited(hostile, { maxColumns: Infinity });
    expect(performance.now() - started).toBeLessThan(2000);
    // Each quote closes the field opened by the previous one, as Excel reads it.
    expect(table?.columnCount).toBe(25_001);
    expect(parseDelimited(hostile)).toMatchObject({ columnCount: 16_384, truncated: true });
  });
});

describe('parseHtmlTable', () => {
  it('reads Excel clipboard HTML: merged cells, same-cell line breaks, entities', () => {
    expect(parseHtmlTable(EXCEL_HTML)).toEqual({
      headers: null,
      rows: [
        ['Code', 'Qty', 'Note', 'Region'],
        ['00123', '5', 'line one\nline two', 'North'],
        ['Merged A–B', '', 'Tom & Jerry', ''],
      ],
      columnCount: 4,
      source: 'html',
      truncated: false,
    });
  });

  it('repeats merged values when asked', () => {
    expect(parseHtmlTable(EXCEL_HTML, { spans: 'repeat' })?.rows[2]).toEqual(['Merged A–B', 'Merged A–B', 'Tom & Jerry', 'North']);
  });

  it('reads Google Sheets clipboard HTML', () => {
    expect(parseHtmlTable(SHEETS_HTML, { headers: true })).toMatchObject({
      headers: ['Name', 'Seats'],
      rows: [
        ['Ada', '42'],
        ['Grace\nHopper', '7'],
      ],
    });
  });

  it('reads Word tables, with paragraphs as line breaks', () => {
    expect(parseHtmlTable(WORD_HTML)?.rows).toEqual([
      ['Item', 'Detail'],
      ['Plan', 'First paragraph\nSecond paragraph'],
    ]);
  });

  it('detects a real header, collapses whitespace and keeps non-breaking spaces as spaces', () => {
    expect(parseHtmlTable(WEB_HTML)).toMatchObject({
      headers: ['Name', 'Role'],
      rows: [
        ['Ada Admin', 'Engineer'],
        ['Grace', 'Rear  Admiral'],
      ],
    });
  });

  it('treats a first row of <th> cells as a header, and lets you override detection', () => {
    const html = '<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>';
    expect(parseHtmlTable(html)?.headers).toEqual(['A', 'B']);
    expect(parseHtmlTable(html, { headers: false })?.headers).toBeNull();
    expect(parseHtmlTable('<table><tr><th>A</th><td>B</td></tr><tr><td>1</td><td>2</td></tr></table>')?.headers).toBeNull();
    expect(parseHtmlTable('<table><tr><td>A</td></tr><tr><td>1</td></tr></table>', { headers: true })?.headers).toEqual(['A']);
  });

  it('ignores scripts, styles and hidden rows and cells', () => {
    const html = `<table>
      <tr><td>a<script>alert(1)</script><style>td{}</style></td><td hidden>secret</td><td style="color:red; display: none ;">x</td><td>b</td></tr>
      <tr style="display:none"><td>hidden row</td></tr>
      <tr hidden><td>hidden row 2</td></tr>
      <tr><td>c</td><td>d</td></tr>
    </table>`;
    expect(parseHtmlTable(html)?.rows).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('never runs scripts or event handlers from pasted HTML', () => {
    const spy = vi.fn();
    (globalThis as Record<string, unknown>).__pwned = spy;
    parseHtmlTable('<table><tr><td><img src=x onerror="__pwned()"><script>__pwned()</script>a</td></tr></table>');
    expect(spy).not.toHaveBeenCalled();
    delete (globalThis as Record<string, unknown>).__pwned;
  });

  it('reads the outer table, and nested cells as separate words', () => {
    const html = '<table><tr><td>outer<table><tr><td>in1</td><td>in2</td></tr></table></td><td>x</td></tr></table>';
    expect(parseHtmlTable(html)?.rows).toEqual([['outer\nin1 in2', 'x']]);
  });

  it('skips empty tables and finds the first one with rows', () => {
    expect(parseHtmlTable('<table></table><table><tr><td>a</td></tr></table>')?.rows).toEqual([['a']]);
  });

  it('turns <br> into line breaks and keeps intentional blank lines', () => {
    expect(parseHtmlTable('<table><tr><td>a<br><br>b<br></td><td><br>c</td><td><div>x</div><div>y</div></td></tr></table>')?.rows).toEqual([
      ['a\n\nb', 'c', 'x\ny'],
    ]);
  });

  it('handles rowspan=0, invalid and huge spans', () => {
    const html = '<table><tr><td rowspan=0>all</td><td colspan="x">a</td><td colspan="-2">b</td></tr><tr><td>c</td></tr><tr><td>d</td></tr></table>';
    expect(parseHtmlTable(html)?.rows).toEqual([
      ['all', 'a', 'b'],
      ['', 'c', ''],
      ['', 'd', ''],
    ]);
    const wide = parseHtmlTable('<table><tr><td colspan=5000>w</td></tr></table>');
    expect(wide?.columnCount).toBe(1000);
  });

  it('fills the gaps a rowspan leaves in a shorter row', () => {
    const html = '<table><tr><td>a</td><td>b</td><td rowspan=2>c</td></tr><tr><td>d</td></tr></table>';
    expect(parseHtmlTable(html)?.rows).toEqual([
      ['a', 'b', 'c'],
      ['d', '', ''],
    ]);
  });

  it('returns null without a table, without rows, or without content', () => {
    expect(parseHtmlTable('<p>no table here</p>')).toBeNull();
    expect(parseHtmlTable('<table></table>')).toBeNull();
    expect(parseHtmlTable('<table><tr><td> </td><td><br></td></tr></table>')).toBeNull();
  });

  it('reads from an element: the table itself, or a container', () => {
    document.body.innerHTML = WEB_HTML;
    const table = document.querySelector('table')!;
    const card = document.querySelector('.card')!;
    expect(parseHtmlTable(table)?.headers).toEqual(['Name', 'Role']);
    expect(parseHtmlTable(card)?.rows).toHaveLength(2);
    expect(parseHtmlTable(document.createElement('div'))).toBeNull();
  });

  it('reads a table element that has no rows by searching inside it', () => {
    const empty = document.createElement('table');
    expect(parseHtmlTable(empty)).toBeNull();
  });

  it('rejects input that is neither a string nor an element', () => {
    expect(failure(() => parseHtmlTable(5 as never)).message).toMatch(/HTML string or an element/);
    expect(failure(() => parseHtmlTable({ querySelectorAll: () => [] } as never)).type).toBe('invalid-payload');
    expect(failure(() => parseHtmlTable(null as never)).type).toBe('invalid-payload');
  });

  it('returns null on a server without DOMParser', () => {
    vi.stubGlobal('DOMParser', undefined);
    expect(parseHtmlTable('<table><tr><td>a</td></tr></table>')).toBeNull();
  });

  it('respects maxRows, maxColumns and maxLength', () => {
    const html = '<table><tr><td>1</td><td>2</td><td>3</td></tr><tr><td>4</td><td>5</td><td>6</td></tr><tr><td>7</td></tr></table>';
    expect(parseHtmlTable(html, { maxRows: 2 })).toMatchObject({ rows: [['1', '2', '3'], ['4', '5', '6']], truncated: true });
    expect(parseHtmlTable(html, { maxColumns: 2 })).toMatchObject({ columnCount: 2, truncated: true });
    expect(parseHtmlTable('<table><tr><td colspan=3>wide</td></tr></table>', { maxColumns: 2 })).toMatchObject({
      rows: [['wide', '']],
      truncated: true,
    });
    expect(failure(() => parseHtmlTable(html, { maxLength: 10 })).type).toBe('too-large');
  });

  it('budgets merged cells so a tiny document cannot claim millions of slots', () => {
    const rows = '<tr><td>x</td></tr>'.repeat(2000);
    const hostile = `<table><tr><td rowspan=0 colspan=1000>boom</td></tr>${rows}</table>`;
    const started = performance.now();
    const table = parseHtmlTable(hostile, { maxCells: 50_000 });
    expect(performance.now() - started).toBeLessThan(2000);
    expect(table?.truncated).toBe(true);
    expect((table?.rows.length ?? 0) * (table?.columnCount ?? 0)).toBeLessThanOrEqual(50_000);
  });
});

describe('parseTable', () => {
  it('reads plain text', () => {
    expect(parseTable('a\tb')?.rows).toEqual([['a', 'b']]);
  });

  it('prefers HTML and falls back to text', () => {
    expect(parseTable({ html: EXCEL_HTML, text: EXCEL_TSV })?.source).toBe('html');
    expect(parseTable({ html: '<p>not a table</p>', text: 'a\tb' })).toMatchObject({ source: 'text', rows: [['a', 'b']] });
    expect(parseTable({ html: null, text: 'a' })?.source).toBe('text');
    expect(parseTable({ text: 'a' })?.source).toBe('text');
    expect(parseTable({ html: '<table><tr><td>a</td></tr></table>' })?.source).toBe('html');
  });

  it('can prefer text', () => {
    expect(parseTable({ html: EXCEL_HTML, text: 'x\ty' }, { prefer: 'text' })?.source).toBe('text');
    expect(parseTable({ html: EXCEL_HTML, text: '' }, { prefer: 'text' })?.source).toBe('html');
  });

  it('accepts a PasteResult-like object and returns null when nothing is there', () => {
    expect(parseTable({ html: null, text: null })).toBeNull();
    expect(parseTable({})).toBeNull();
    expect(parseTable({ html: 5 as never, text: 6 as never })).toBeNull();
  });

  it('rejects other input', () => {
    expect(failure(() => parseTable(null as never)).message).toMatch(/parseTable/);
    expect(failure(() => parseTable(5 as never)).type).toBe('invalid-payload');
  });

  it('round-trips with tablePayload through both flavours', () => {
    const payload = tablePayload({ headers: ['Name', 'Note'], rows: [['Ada', 'a\nb'], ['Tom & "J"', '']] });
    const fromHtml = parseTable({ html: payload.html, text: null });
    const fromText = parseTable({ html: null, text: payload.text }, { headers: true });
    expect(fromHtml).toMatchObject({ headers: ['Name', 'Note'], rows: [['Ada', 'a\nb'], ['Tom & "J"', '']] });
    expect(fromText).toMatchObject({ headers: ['Name', 'Note'], rows: [['Ada', 'a\nb'], ['Tom & "J"', '']] });
  });
});

describe('fromTableElement', () => {
  it('reads a rendered table for copying', () => {
    document.body.innerHTML = WEB_HTML;
    const data = fromTableElement(document.querySelector('.card')!);
    expect(tablePayload(data).text).toBe('Name\tRole\r\nAda Admin\tEngineer\r\nGrace\tRear  Admiral');
  });

  it('throws when there is no table with content', () => {
    expect(failure(() => fromTableElement(document.createElement('div'))).message).toMatch(/No table/);
  });
});
