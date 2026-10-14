import { copyFailure } from '../core/errors';
import type { HtmlPayload, TextPayload } from '../core/payload';

/* ------------------------------------------------------------------ Types */

/**
 * What a table cell may hold. Numbers, bigints, booleans and dates stay typed
 * all the way to the spreadsheet; strings are kept as text.
 */
export type TableCell = string | number | bigint | boolean | Date | null | undefined;

/** One row of cells, left to right. */
export type TableRow = readonly TableCell[];

/**
 * A table as plain data: optional header labels and rows of cells.
 * Every helper in this module produces or consumes this shape, so the output of
 * `fromRows`, `fromAgGrid`, `fromTanStackTable` and `parseTable` can all be
 * copied with {@link tablePayload}.
 */
export interface TableData {
  readonly headers?: readonly string[] | null | undefined;
  readonly rows: readonly TableRow[];
}

/** Where a cell sits, passed to `formatCell`. Indexes are zero-based; `row` is -1 for the header row. */
export interface CellFormatContext {
  readonly row: number;
  readonly column: number;
  readonly header: string | undefined;
}

export interface TableFormatOptions {
  /** Include the header row when the data has headers. Default `true`. */
  readonly headers?: boolean;
  /**
   * Neutralise text cells that a spreadsheet would run as a formula: those starting
   * with `=`, `+`, `-`, `@`, a tab or a line break (and their full-width forms), as
   * listed by OWASP's CSV Injection guidance. They get a leading `'`, which
   * spreadsheets treat as "this is text". Typed numbers are never touched, so
   * `-5` as a number stays a number. Default `true`; turn off only for trusted data.
   */
  readonly formulaGuard?: boolean;
  /**
   * Mark string cells as text in the HTML flavour (`mso-number-format:"\@"`), so
   * Excel keeps `00123`, `1/2` or `1E5` exactly as written instead of converting them.
   * Typed numbers, booleans and dates are left for the spreadsheet to recognise.
   * Default `true`.
   */
  readonly preserveText?: boolean;
  /**
   * Custom text for a cell. Return `undefined` to use the default. The result is
   * still escaped, and guarded when the original value was text.
   * Defaults: `null`/`undefined` → empty, `Date` → ISO 8601 (invalid dates → empty),
   * everything else → `String(value)`.
   */
  readonly formatCell?: (value: TableCell, context: CellFormatContext) => string | undefined;
  /** Upper bound on cells (header included), checked before any work. Default 1,000,000. */
  readonly maxCells?: number;
}

export interface TablePayloadOptions extends TableFormatOptions {
  /**
   * `'html'` (default): an HTML table plus a tab-separated plain-text fallback, which
   * degrades to the plain text where rich copy is unavailable.
   * `'text'`: tab-separated text only.
   */
  readonly format?: 'html' | 'text';
}

export const DEFAULT_TABLE_MAX_CELLS = 1_000_000;

/* --------------------------------------------------------------- Prepare */

/** `text`: written as typed by a person. `value`: a number, bigint, boolean or date. */
type CellKind = 'text' | 'value';

interface PreparedCell {
  readonly text: string;
  readonly kind: CellKind;
}

interface PreparedTable {
  readonly header: readonly PreparedCell[] | null;
  readonly body: readonly (readonly PreparedCell[])[];
}

// OWASP CSV Injection: = + - @ tab CR LF, and the full-width ＝ ＋ － ＠.
const FORMULA_START = /^[=+\-@\t\r\n＝＋－＠]/;
const LINE_BREAKS = /\r\n?/g;
const EMPTY: PreparedCell = { text: '', kind: 'text' };

const invalid = (message: string) => copyFailure('invalid-payload', message);

/** Only called for values that are not null, undefined or a cell. */
function typeName(value: unknown): string {
  if (Array.isArray(value)) return 'array';
  return typeof value === 'object' ? Object.prototype.toString.call(value).slice(8, -1) : typeof value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isList(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function isDate(value: unknown): value is Date {
  return value instanceof Date || Object.prototype.toString.call(value) === '[object Date]';
}

function resolveLimit(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (value === Infinity || (Number.isInteger(value) && value > 0)) return value;
  throw invalid(`\`${name}\` must be a positive integer or Infinity (received ${String(value)}).`);
}

function defaultText(value: unknown, where: string): { text: string; kind: CellKind } {
  if (value === null || value === undefined) return { text: '', kind: 'text' };
  switch (typeof value) {
    case 'string':
      return { text: value, kind: 'text' };
    case 'number':
    case 'bigint':
    case 'boolean':
      return { text: String(value), kind: 'value' };
    default:
      if (isDate(value)) {
        const time = value.getTime();
        return { text: Number.isNaN(time) ? '' : value.toISOString(), kind: 'value' };
      }
      throw invalid(
        `${where} is ${typeName(value)}, which has no text form. ` +
          'Pass a string, number, bigint, boolean, Date, null or undefined, or convert it with `formatCell`.',
      );
  }
}

function prepare(data: TableData, options: TableFormatOptions): PreparedTable {
  // Validated as `unknown`: plain-JS callers and runtime data reach this too.
  const input: unknown = data;
  if (!isRecord(input) || !isList(input['rows'])) {
    throw invalid('Table data must be an object with a `rows` array.');
  }
  const rawHeaders = input['headers'];
  if (rawHeaders !== undefined && rawHeaders !== null && !isList(rawHeaders)) {
    throw invalid('`headers` must be an array of strings, null or undefined.');
  }
  const headers: readonly unknown[] | null = options.headers === false ? null : (rawHeaders ?? null);
  const rows: readonly unknown[] = input['rows'];

  let width = headers?.length ?? 0;
  const lines: (readonly unknown[])[] = [];
  for (const [index, row] of rows.entries()) {
    if (!isList(row)) throw invalid(`Row ${String(index + 1)} is not an array of cells.`);
    width = Math.max(width, row.length);
    lines.push(row);
  }
  if (width === 0) throw invalid('The table has no cells to copy.');

  const maxCells = resolveLimit(options.maxCells, DEFAULT_TABLE_MAX_CELLS, 'maxCells');
  const cellCount = (rows.length + (headers ? 1 : 0)) * width;
  if (cellCount > maxCells) {
    throw copyFailure(
      'too-large',
      `The table has ${String(cellCount)} cells, over the limit of ${String(maxCells)}. Raise \`maxCells\` or copy fewer rows.`,
    );
  }

  const guard = options.formulaGuard ?? true;
  const formatCell = options.formatCell;

  const label = (column: number): string | undefined => {
    const value = headers?.[column];
    return typeof value === 'string' ? value : undefined;
  };

  const cell = (value: unknown, row: number, column: number): PreparedCell => {
    const where = row < 0 ? `Header ${String(column + 1)}` : `Cell at row ${String(row + 1)}, column ${String(column + 1)}`;
    const base = defaultText(value, where);
    let text = base.text;
    if (formatCell) {
      // `defaultText` has accepted the value, so it is a valid cell.
      const custom: unknown = formatCell(value as TableCell, { row, column, header: label(column) });
      if (custom !== undefined) {
        if (typeof custom !== 'string') throw invalid(`\`formatCell\` must return a string or undefined (${where}).`);
        text = custom;
      }
    }
    text = text.replace(LINE_BREAKS, '\n');
    if (guard && base.kind === 'text' && FORMULA_START.test(text)) text = `'${text}`;
    return text === '' ? EMPTY : { text, kind: base.kind };
  };

  const header = headers
    ? Array.from({ length: width }, (_, column) => {
        const value = headers[column];
        if (value !== undefined && value !== null && typeof value !== 'string') {
          throw invalid(`Header ${String(column + 1)} must be a string (received ${typeName(value)}).`);
        }
        return cell(value ?? '', -1, column);
      })
    : null;

  const body = lines.map((row, rowIndex) => Array.from({ length: width }, (_, column) => cell(row[column], rowIndex, column)));

  return { header, body };
}

/* ----------------------------------------------------------------- Writers */

const NEEDS_QUOTES = /[\t\n\r"]/;

function tsvField(text: string): string {
  return NEEDS_QUOTES.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toTsv(table: PreparedTable): string {
  const lines = table.header ? [table.header, ...table.body] : table.body;
  // Rows end in CRLF, as Excel writes them; line breaks inside a cell stay LF.
  const text = lines.map((row) => row.map((cell) => tsvField(cell.text)).join('\t')).join('\r\n');
  // A one-column table ending in an empty cell would end in a bare line break, which
  // readers drop as the trailing newline. A quoted empty field keeps that last row.
  const last = lines.at(-1);
  return lines.length > 1 && last?.length === 1 && last[0]?.text === '' ? `${text}""` : text;
}

const HTML_ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (char) => HTML_ESCAPES[char] as string);
}

// Whitespace HTML would otherwise collapse: leading, trailing, doubled, or tabs.
const SIGNIFICANT_SPACE = /^\s|\s$| {2}|\t/;

function htmlCell(tag: 'th' | 'td', cell: PreparedCell, preserveText: boolean): string {
  const styles: string[] = [];
  if (preserveText && cell.kind === 'text' && cell.text !== '') styles.push("mso-number-format:'\\@'");
  if (SIGNIFICANT_SPACE.test(cell.text)) styles.push('white-space:pre-wrap');
  const style = styles.length > 0 ? ` style="${styles.join(';')}"` : '';
  return `<${tag}${style}>${escapeHtml(cell.text).replace(/\n/g, '<br>')}</${tag}>`;
}

function toHtml(table: PreparedTable, preserveText: boolean): string {
  const row = (cells: readonly PreparedCell[], tag: 'th' | 'td') =>
    `<tr>${cells.map((cell) => htmlCell(tag, cell, preserveText)).join('')}</tr>`;
  const head = table.header ? `<thead>${row(table.header, 'th')}</thead>` : '';
  return `<table>${head}<tbody>${table.body.map((cells) => row(cells, 'td')).join('')}</tbody></table>`;
}

/** `prepare` guarantees at least one line of at least one cell. */
function hasContent(table: PreparedTable): boolean {
  const lines = table.header ? [table.header, ...table.body] : table.body;
  const first = lines[0] as readonly PreparedCell[];
  return lines.length > 1 || first.length > 1 || (first[0] as PreparedCell).text !== '';
}

/* -------------------------------------------------------------- Public API */

/**
 * Tab-separated text, the format Excel, Google Sheets, Numbers and LibreOffice paste
 * straight into cells. Cells containing tabs, line breaks or quotes are quoted the
 * way Excel quotes them. Throws a `CopyFailure` (`invalid-payload` or `too-large`).
 */
export function tableToTsv(data: TableData, options: TableFormatOptions = {}): string {
  return toTsv(prepare(data, options));
}

/** An HTML `<table>`: what rich editors (Docs, Word, Notion, mail) and spreadsheets read first. */
export function tableToHtml(data: TableData, options: TableFormatOptions = {}): string {
  return toHtml(prepare(data, options), options.preserveText ?? true);
}

/**
 * A copy payload for a table, ready for `copy()`, `useCopyInterceptor` or `useDragCopy`.
 *
 * ```ts
 * copy(() => tablePayload(fromRows(invoices, columns)));
 * ```
 *
 * The default `html` format carries the HTML table and the tab-separated text in one
 * clipboard entry. Throws a `CopyFailure` for bad input; inside a `copy()` source that
 * becomes the copy's classified error.
 */
export function tablePayload(data: TableData, options: TablePayloadOptions & { readonly format: 'text' }): TextPayload;
export function tablePayload(data: TableData, options?: TablePayloadOptions & { readonly format?: 'html' }): HtmlPayload;
export function tablePayload(data: TableData, options?: TablePayloadOptions): HtmlPayload | TextPayload;
export function tablePayload(data: TableData, options: TablePayloadOptions = {}): HtmlPayload | TextPayload {
  const format: unknown = options.format ?? 'html';
  if (format !== 'html' && format !== 'text') {
    throw invalid(`\`format\` must be "html" or "text" (received ${JSON.stringify(format)}).`);
  }
  const table = prepare(data, options);
  if (!hasContent(table)) throw invalid('The table only contains one empty cell; there is nothing to copy.');
  const text = toTsv(table);
  return format === 'text' ? { kind: 'text', value: text } : { kind: 'html', html: toHtml(table, options.preserveText ?? true), text };
}

/* ------------------------------------------------------------------ Rows */

/** Keys of `Row` whose values are valid cells. */
export type CellKey<Row> = {
  [K in keyof Row]-?: Row[K] extends TableCell ? K : never;
}[keyof Row] &
  string;

/** One output column for {@link fromRows}: a header and how to read the cell. */
export interface TableColumn<Row> {
  readonly header: string;
  /** A property of the row, or a function returning the cell. */
  readonly value: CellKey<Row> | ((row: Row, index: number) => TableCell);
}

/**
 * Turns your own row objects into {@link TableData}, choosing and ordering columns.
 *
 * ```ts
 * fromRows(users, [
 *   { header: 'Name', value: 'name' },
 *   { header: 'Joined', value: (user) => user.joinedAt },
 * ]);
 * ```
 */
export function fromRows<Row>(rows: readonly Row[], columns: readonly TableColumn<Row>[]): TableData {
  const rowList: unknown = rows;
  const columnList: unknown = columns;
  if (!isList(rowList)) throw invalid('`fromRows` expects an array of rows.');
  if (!isList(columnList) || columnList.length === 0) throw invalid('`fromRows` needs at least one column.');
  const headers: string[] = [];
  const readers = columnList.map((column, index): ((row: Row, index: number) => unknown) => {
    if (!isRecord(column) || typeof column['header'] !== 'string') {
      throw invalid(`Column ${String(index + 1)} needs a string \`header\`.`);
    }
    const header = column['header'];
    headers.push(header);
    const value = column['value'];
    if (typeof value === 'function') return value as (row: Row, index: number) => unknown;
    if (typeof value === 'string') return (row: Row) => (isRecord(row) ? row[value] : undefined);
    throw invalid(`Column "${header}" needs a \`value\`: a property name or a function.`);
  });
  // Cells are checked when the table is serialised, with their row and column in the message.
  return {
    headers,
    rows: rows.map((row, index) => readers.map((read) => read(row, index) as TableCell)),
  };
}
