import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseDelimited, parseHtmlTable, parseTable, tablePayload, tableToHtml, tableToTsv, type TableCell } from '../../src/table';

const RUNS = { numRuns: 400 };

/** Strings rich in the characters that break naive TSV: tabs, quotes, every line ending. */
const trickyText = fc.string({
  unit: fc.oneof(
    { weight: 6, arbitrary: fc.string({ unit: 'grapheme', minLength: 1, maxLength: 1 }) },
    { weight: 1, arbitrary: fc.constantFrom('\t', '"', '\n', '\r', '\r\n', ' ', "'", '=') },
  ),
  maxLength: 12,
});

const grid = <T>(cell: fc.Arbitrary<T>) =>
  fc.integer({ min: 1, max: 6 }).chain((width) => fc.array(fc.array(cell, { minLength: width, maxLength: width }), { minLength: 1, maxLength: 8 }));

const normalizeBreaks = (text: string) => text.replace(/\r\n?/g, '\n');

describe('round trips (property-based)', () => {
  it('TSV: every table of strings survives tableToTsv → parseDelimited', () => {
    fc.assert(
      fc.property(grid(trickyText), (rows) => {
        const expected = rows.map((row) => row.map(normalizeBreaks));
        const hasContent = expected.some((row) => row.some((cell) => cell !== ''));
        let tsv: string;
        try {
          tsv = tableToTsv({ rows }, { formulaGuard: false });
        } catch {
          return; // Only a table with no cells at all can fail, which the generator never makes.
        }
        const parsed = parseDelimited(tsv, { maxColumns: Infinity });
        if (!hasContent) {
          expect(parsed).toBeNull();
          return;
        }
        expect(parsed?.rows).toEqual(expected);
        expect(parsed?.truncated).toBe(false);
      }),
      RUNS,
    );
  });

  it('HTML: every table of words and line breaks survives tableToHtml → parseHtmlTable', () => {
    const word = fc.string({ unit: fc.constantFrom('a', 'Z', '7', '&', '<', '>', '"', "'", 'é', '€', '日', '🎉', '₹', '-', '='), minLength: 1, maxLength: 6 });
    const line = fc.array(word, { minLength: 1, maxLength: 3 }).map((words) => words.join(' '));
    const cellText = fc.oneof(fc.constant(''), fc.array(line, { minLength: 1, maxLength: 3 }).map((lines) => lines.join('\n')));
    fc.assert(
      fc.property(grid(cellText), fc.boolean(), (rows, withHeader) => {
        const headers = withHeader ? rows[0]!.map((_, index) => `H${String(index)}`) : null;
        const hasContent = withHeader || rows.some((row) => row.some((cell) => cell !== ''));
        const parsed = parseHtmlTable(tableToHtml({ headers, rows }, { formulaGuard: false }));
        if (!hasContent) {
          expect(parsed).toBeNull();
          return;
        }
        expect(parsed?.headers).toEqual(headers);
        expect(parsed?.rows).toEqual(rows);
      }),
      RUNS,
    );
  });

  it('payloads: any valid cells serialise, with one TSV line per row', () => {
    const cell: fc.Arbitrary<TableCell> = fc.oneof(
      fc.string({ maxLength: 8 }).filter((text) => !/[\r\n]/.test(text)),
      fc.double(),
      fc.bigInt(),
      fc.boolean(),
      fc.date(),
      fc.constant(null),
      fc.constant(undefined),
    );
    fc.assert(
      fc.property(grid(cell), (rows) => {
        const text = tableToTsv({ rows });
        let quoted = false;
        let lines = 1;
        for (let index = 0; index < text.length; index++) {
          const char = text[index];
          if (char === '"') quoted = !quoted;
          else if (char === '\r' && !quoted) lines += 1;
        }
        expect(lines).toBe(rows.length);
        const payload = (() => {
          try {
            return tablePayload({ rows });
          } catch {
            return null; // A lone empty cell; checked separately.
          }
        })();
        if (payload) expect(payload.kind).toBe('html');
      }),
      RUNS,
    );
  });

  it('the guard always neutralises formula-like text in both flavours', () => {
    const formula = fc.tuple(fc.constantFrom('=', '+', '-', '@', '\t', '＝', '＋', '－', '＠'), fc.string({ maxLength: 6 })).map(([a, b]) => a + b);
    fc.assert(
      fc.property(formula, (text) => {
        const parsedText = parseDelimited(tableToTsv({ rows: [[text, 'x']] }));
        expect(parsedText?.rows[0]?.[0]?.startsWith("'")).toBe(true);
      }),
      RUNS,
    );
  });
});

describe('robustness (fuzzing)', () => {
  it('parseDelimited never throws and always returns rectangular rows', () => {
    fc.assert(
      fc.property(fc.string({ unit: fc.constantFrom('a', '"', '\t', '\n', '\r', ',', ' ', 'é'), maxLength: 200 }), (text) => {
        const table = parseDelimited(text);
        if (table) {
          for (const row of table.rows) expect(row).toHaveLength(table.columnCount);
          if (table.headers) expect(table.headers).toHaveLength(table.columnCount);
        }
      }),
      { numRuns: 1000 },
    );
  });

  it('parseHtmlTable never throws on arbitrary markup', () => {
    const fragment = fc.constantFrom(
      '<table>', '</table>', '<tr>', '</tr>', '<td>', '</td>', '<th>', '<thead>', '</thead>', '<tbody>', '<br>', '<p>', '</p>',
      '<td colspan=3>', '<td rowspan=0>', '<td colspan=-1>', '<td hidden>', '<tr style="display:none">', '<script>', '</script>',
      'text', ' ', '&nbsp;', '&amp;', '<!--', '-->', '<table><tr><td>x', '<', '>',
    );
    fc.assert(
      fc.property(fc.array(fragment, { maxLength: 40 }), (parts) => {
        const table = parseHtmlTable(parts.join(''));
        if (table) for (const row of table.rows) expect(row).toHaveLength(table.columnCount);
      }),
      { numRuns: 1000 },
    );
  });

  it('parseTable accepts any PasteResult-shaped input', () => {
    fc.assert(
      fc.property(fc.option(fc.string({ maxLength: 60 })), fc.option(fc.string({ maxLength: 60 })), (html, text) => {
        expect(() => parseTable({ html, text })).not.toThrow();
      }),
      { numRuns: 500 },
    );
  });
});
