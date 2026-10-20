import { copyFailure } from '../core/errors';
import type { TableData } from './serialize';
import { parseInertHtml } from '../core/inert-html';

/* ------------------------------------------------------------------ Types */

/** A table read from pasted or dropped content. Every cell is a string. */
export interface ParsedTable extends TableData {
  /** The header row, when one was detected or requested; otherwise `null`. */
  readonly headers: readonly string[] | null;
  /** Data rows, all padded to `columnCount`. */
  readonly rows: readonly (readonly string[])[];
  readonly columnCount: number;
  /** Which clipboard flavour the table came from. */
  readonly source: 'html' | 'text';
  /** `true` when rows or columns were dropped to stay within the limits. Never silent. */
  readonly truncated: boolean;
}

export interface ParseTableOptions {
  /**
   * `'auto'` (default): an HTML table's first row is the header when it sits in
   * `<thead>` or is made of `<th>` cells; plain text has no header.
   * `true`: the first row is always the header. `false`: never.
   */
  readonly headers?: 'auto' | boolean;
  /** Which flavour to read when both are present. Default `'html'`, which keeps merged cells and line breaks exact. */
  readonly prefer?: 'html' | 'text';
  /** Column separator for plain text. Default tab, what spreadsheets put on the clipboard. */
  readonly delimiter?: string;
  /** Merged cells: `'empty'` (default) fills the covered cells with `''`, as spreadsheets do; `'repeat'` copies the value. */
  readonly spans?: 'empty' | 'repeat';
  /** Trim spaces around plain-text cells. HTML cells are always normalised. Default `false`. */
  readonly trim?: boolean;
  /** Most rows kept (header included). Default 100,000. Extra rows set `truncated`. */
  readonly maxRows?: number;
  /** Most columns kept. Default 16,384, Excel's own limit. Extra columns set `truncated`. */
  readonly maxColumns?: number;
  /** Most cells kept. Default 1,000,000. */
  readonly maxCells?: number;
  /** Longest input read, in characters. Default 32 MiB. Longer input fails with `too-large`. */
  readonly maxLength?: number;
}

/** Plain text, or anything with `html` and `text`, such as a `PasteResult`. */
export type TableSource =
  | string
  | { readonly html?: string | null | undefined; readonly text?: string | null | undefined };

export const DEFAULT_PARSE_MAX_ROWS = 100_000;
export const DEFAULT_PARSE_MAX_COLUMNS = 16_384;
export const DEFAULT_PARSE_MAX_CELLS = 1_000_000;
export const DEFAULT_PARSE_MAX_LENGTH = 32 * 1024 * 1024;

/* ---------------------------------------------------------------- Options */

interface Limits {
  readonly maxRows: number;
  readonly maxColumns: number;
  readonly maxCells: number;
  readonly maxLength: number;
}

const invalid = (message: string) => copyFailure('invalid-payload', message);

function limit(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (value === Infinity || (Number.isInteger(value) && value > 0)) return value;
  throw invalid(`\`${name}\` must be a positive integer or Infinity (received ${String(value)}).`);
}

function resolveLimits(options: ParseTableOptions): Limits {
  return {
    maxRows: limit(options.maxRows, DEFAULT_PARSE_MAX_ROWS, 'maxRows'),
    maxColumns: limit(options.maxColumns, DEFAULT_PARSE_MAX_COLUMNS, 'maxColumns'),
    maxCells: limit(options.maxCells, DEFAULT_PARSE_MAX_CELLS, 'maxCells'),
    maxLength: limit(options.maxLength, DEFAULT_PARSE_MAX_LENGTH, 'maxLength'),
  };
}

function checkLength(input: string, limits: Limits): void {
  if (input.length > limits.maxLength) {
    throw copyFailure(
      'too-large',
      `The pasted content is ${String(input.length)} characters, over the limit of ${String(limits.maxLength)}.`,
    );
  }
}

/* ---------------------------------------------------------------- Shaping */

/**
 * Applies the row, column and cell limits, pads ragged rows, splits off the header
 * and drops tables without a single non-empty cell.
 */
function finish(
  grid: readonly (readonly string[])[],
  firstRowIsHeader: boolean,
  source: 'html' | 'text',
  limits: Limits,
  alreadyTruncated: boolean,
): ParsedTable | null {
  let truncated = alreadyTruncated;
  // Both readers already stop at maxColumns, so the widest row is within it.
  let columnCount = 0;
  for (const row of grid) columnCount = Math.max(columnCount, row.length);
  let rowCount = Math.min(grid.length, limits.maxRows);
  if (columnCount > 0) rowCount = Math.min(rowCount, Math.floor(limits.maxCells / columnCount));
  if (rowCount < grid.length) truncated = true;

  const shaped: string[][] = [];
  let anyContent = false;
  for (let index = 0; index < rowCount; index++) {
    const row = grid[index] as readonly string[];
    const cells = Array.from({ length: columnCount }, (_, column) => row[column] ?? '');
    if (!anyContent && cells.some((cell) => cell !== '')) anyContent = true;
    shaped.push(cells);
  }
  if (!anyContent) return null;

  // `anyContent` means there is at least one row to take the header from.
  const headers = firstRowIsHeader ? (shaped.shift() as string[]) : null;
  return { headers, rows: shaped, columnCount, source, truncated };
}

/* ------------------------------------------------------------- Plain text */

/**
 * Splits tab-separated text the way spreadsheets write it: a field that starts with
 * `"` is quoted (`""` is a literal quote) and may contain tabs and line breaks; rows
 * end in CRLF, LF or CR; the trailing line break spreadsheets add is ignored. A quote
 * that never closes is read as an ordinary character, as Excel does.
 */
function splitDelimited(text: string, delimiter: string, trim: boolean, limits: Limits): { grid: string[][]; truncated: boolean } {
  const grid: string[][] = [];
  const length = text.length;
  let row: string[] = [];
  let field = '';
  let index = 0;
  let fieldStart = true;
  // After one unterminated quote, every later quote is literal too: this keeps the
  // scan linear on hostile input instead of re-reading to the end for each quote.
  let quoting = true;
  let cells = 0;
  const state = { full: false, truncated: false };

  const pushField = () => {
    if (row.length >= limits.maxColumns) state.truncated = true;
    else if (cells >= limits.maxCells) state.full = true;
    else {
      row.push(trim ? field.trim() : field);
      cells += 1;
    }
    field = '';
    fieldStart = true;
  };
  const pushRow = () => {
    pushField();
    grid.push(row);
    row = [];
    if (grid.length >= limits.maxRows) state.full = true;
  };

  while (index < length && !state.full) {
    const char = text[index] as string;

    if (fieldStart && quoting && char === '"') {
      let value = '';
      let cursor = index + 1;
      let closed = false;
      while (cursor < length) {
        const inner = text[cursor] as string;
        if (inner === '"') {
          if (text[cursor + 1] === '"') {
            value += '"';
            cursor += 2;
            continue;
          }
          closed = true;
          cursor += 1;
          break;
        }
        value += inner;
        cursor += 1;
      }
      if (!closed) {
        quoting = false; // Read this quote, and any later one, as a plain character.
        continue;
      }
      // Anything between the closing quote and the next separator is kept, as Excel does.
      field = value;
      fieldStart = false;
      index = cursor;
      continue;
    }

    if (char === delimiter) {
      pushField();
      index += 1;
    } else if (char === '\r' || char === '\n') {
      pushRow();
      index += char === '\r' && text[index + 1] === '\n' ? 2 : 1;
    } else {
      field += char;
      fieldStart = false;
      index += 1;
    }
  }

  if (state.full) {
    // Stopped early: say so when anything but a final line break was left unread.
    if (index < length && !/^(\r\n|\r|\n)$/.test(text.slice(index))) state.truncated = true;
    return { grid, truncated: state.truncated };
  }
  // The final line break closes the last row; there is no empty row after it.
  const last = text[length - 1];
  if (!(last === '\n' || last === '\r') || row.length > 0 || field !== '') pushRow();
  return { grid, truncated: state.truncated };
}

/**
 * Reads tab-separated (or `delimiter`-separated) text into a table.
 * Returns `null` when there is no non-empty cell.
 */
export function parseDelimited(text: string, options: ParseTableOptions = {}): ParsedTable | null {
  if (typeof text !== 'string') throw invalid('`parseDelimited` expects a string.');
  const limits = resolveLimits(options);
  checkLength(text, limits);
  const delimiter = options.delimiter ?? '\t';
  if (typeof delimiter !== 'string' || delimiter.length !== 1 || delimiter === '"' || delimiter === '\r' || delimiter === '\n') {
    throw invalid('`delimiter` must be one character other than a quote or a line break.');
  }
  if (text === '') return null;
  const { grid, truncated } = splitDelimited(text, delimiter, options.trim ?? false, limits);
  return finish(grid, options.headers === true, 'text', limits, truncated);
}

/* ------------------------------------------------------------------- HTML */

const SKIPPED = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'HEAD', 'TITLE', 'OBJECT', 'IFRAME', 'SVG', 'MATH']);
const BLOCKS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DIV', 'DL', 'DT', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'TR', 'UL',
]);
const HARD_BREAK = '\uE000';
const SOFT_BREAK = '\uE001';

function isHidden(element: Element): boolean {
  if (element.hasAttribute('hidden')) return true;
  const style = element.getAttribute('style');
  return style !== null && /(^|;)\s*display\s*:\s*none\s*(;|$)/i.test(style);
}

function collectText(node: Node, out: string[]): void {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 3) {
      out.push((child as Text).data.replace(/[ \t\n\r\f]+/g, ' '));
    } else if (child.nodeType === 1) {
      const element = child as Element;
      const tag = element.tagName.toUpperCase();
      if (SKIPPED.has(tag) || isHidden(element)) continue;
      if (tag === 'BR') {
        out.push(HARD_BREAK);
        continue;
      }
      const block = BLOCKS.has(tag);
      // Cells of a nested table read as words, not run together.
      const cellLike = tag === 'TD' || tag === 'TH';
      if (block) out.push(SOFT_BREAK);
      else if (cellLike) out.push(' ');
      collectText(element, out);
      if (block) out.push(SOFT_BREAK);
      else if (cellLike) out.push(' ');
    }
  }
}

/** The text of one cell as it reads on screen: collapsed spaces, `<br>` and blocks as line breaks. */
function cellText(cell: Element): string {
  const parts: string[] = [];
  collectText(cell, parts);
  return parts
    .join('')
    // Spaces from neighbouring elements collapse into one, as a browser renders them.
    .replace(/ {2,}/g, ' ')
    .replace(/ *\uE001[\uE001 ]*/g, SOFT_BREAK)
    .replace(/^\uE001|\uE001$/g, '')
    .replace(/[\uE000\uE001]/g, '\n')
    .split('\n')
    .map((line) => line.replace(/^ +| +$/g, '').replace(/\u00A0/g, ' '))
    .join('\n')
    .replace(/^\n+|\n+$/g, '');
}

function span(cell: Element, name: 'colspan' | 'rowspan', max: number): number {
  const value = Number.parseInt(cell.getAttribute(name) ?? '', 10);
  if (name === 'rowspan' && value === 0) return max;
  return Number.isFinite(value) && value >= 1 ? Math.min(value, max) : 1;
}

function isElement(value: unknown): value is Element {
  return typeof value === 'object' && value !== null && (value as { nodeType?: unknown }).nodeType === 1;
}

function findTable(root: Document | Element): HTMLTableElement | null {
  if (isElement(root) && root.tagName.toUpperCase() === 'TABLE' && (root as HTMLTableElement).rows.length > 0) {
    return root as HTMLTableElement;
  }
  // Document order: an outer table comes before the tables nested in it.
  for (const table of Array.from(root.getElementsByTagName('table'))) {
    if (table.rows.length > 0) return table;
  }
  return null;
}

function readGrid(
  table: HTMLTableElement,
  repeat: boolean,
  limits: Limits,
): { grid: string[][]; headerRow: boolean; truncated: boolean } {
  const rows = Array.from(table.rows).filter((row) => !isHidden(row));
  const grid: (string | undefined)[][] = [];
  let truncated = rows.length > limits.maxRows;
  const rowLimit = Math.min(rows.length, limits.maxRows);
  // Merged cells can claim far more slots than the markup is long: budget every slot.
  let filled = 0;
  let full = false;

  for (let rowIndex = 0; rowIndex < rowLimit && !full; rowIndex++) {
    const row = rows[rowIndex] as HTMLTableRowElement;
    const line = (grid[rowIndex] ??= []);
    let column = 0;
    for (const cell of Array.from(row.cells)) {
      if (isHidden(cell)) continue;
      while (line[column] !== undefined) column++;
      if (column >= limits.maxColumns) {
        truncated = true;
        break;
      }
      const text = cellText(cell);
      const colSpan = span(cell, 'colspan', 1000);
      const rowSpan = span(cell, 'rowspan', rowLimit - rowIndex);
      for (let down = 0; down < rowSpan && !full; down++) {
        const target = (grid[rowIndex + down] ??= []);
        for (let across = 0; across < colSpan && column + across < limits.maxColumns; across++) {
          if (filled >= limits.maxCells) {
            full = true;
            break;
          }
          target[column + across] = down === 0 && across === 0 ? text : repeat ? text : '';
          filled += 1;
        }
      }
      if (full) {
        truncated = true;
        break;
      }
      if (column + colSpan > limits.maxColumns) truncated = true;
      column += colSpan;
    }
  }

  const first = rows[0];
  const headerRow =
    first !== undefined &&
    (first.parentElement?.tagName.toUpperCase() === 'THEAD' ||
      (first.cells.length > 0 && Array.from(first.cells).every((cell) => cell.tagName.toUpperCase() === 'TH')));
  return { grid: grid.map((line) => Array.from(line, (cell) => cell ?? '')), headerRow, truncated };
}

function parseHtmlString(html: string): Document | null {
  if (typeof DOMParser === 'undefined') return null;
  return parseInertHtml(html);
}

/**
 * Reads the first non-empty `<table>` from an HTML string (such as Excel, Google Sheets,
 * Word or a web page put on the clipboard) or from an element, which may be the table or
 * contain it. Merged cells, `<br>` line breaks and hidden rows and cells are handled.
 * Returns `null` without a table, without content, or on a server without `DOMParser`.
 */
export function parseHtmlTable(input: string | Element, options: ParseTableOptions = {}): ParsedTable | null {
  const limits = resolveLimits(options);
  let root: Document | Element | null;
  if (typeof input === 'string') {
    checkLength(input, limits);
    if (!/<table[\s>]/i.test(input)) return null;
    root = parseHtmlString(input);
  } else if (isElement(input)) {
    root = input;
  } else {
    throw invalid('`parseHtmlTable` expects an HTML string or an element.');
  }
  const table = root ? findTable(root) : null;
  if (!table) return null;
  const { grid, headerRow, truncated } = readGrid(table, options.spans === 'repeat', limits);
  const headers = options.headers ?? 'auto';
  return finish(grid, headers === 'auto' ? headerRow : headers, 'html', limits, truncated);
}

/**
 * Reads a table from pasted content: a `PasteResult` (or any `{ html, text }`), or plain
 * text. The HTML flavour is preferred when it holds a table; otherwise the text is split
 * on tabs. Returns `null` when neither holds any cell content.
 *
 * ```ts
 * usePaste({ accept: ['html', 'text'], onPaste: (result) => setRows(parseTable(result)?.rows ?? []) });
 * ```
 *
 * Throws a `CopyFailure`: `too-large` past `maxLength`, `invalid-payload` for bad options.
 */
export function parseTable(source: TableSource, options: ParseTableOptions = {}): ParsedTable | null {
  if (typeof source === 'string') return parseDelimited(source, options);
  const candidate: unknown = source;
  if (typeof candidate !== 'object' || candidate === null) {
    throw invalid('`parseTable` expects a string or an object with `html` and/or `text`.');
  }
  const html = typeof source.html === 'string' ? source.html : null;
  const text = typeof source.text === 'string' ? source.text : null;
  const fromHtml = () => (html === null ? null : parseHtmlTable(html, options));
  const fromText = () => (text === null ? null : parseDelimited(text, options));
  return options.prefer === 'text' ? (fromText() ?? fromHtml()) : (fromHtml() ?? fromText());
}

/**
 * Reads a rendered `<table>` (or the first table inside `element`) as {@link TableData},
 * ready for `tablePayload`. Works with any library that renders real table markup.
 * Throws `invalid-payload` when there is no table with content.
 */
export function fromTableElement(element: Element, options: ParseTableOptions = {}): ParsedTable {
  const table = parseHtmlTable(element, options);
  if (!table) throw invalid('No table with content was found in the element.');
  return table;
}
