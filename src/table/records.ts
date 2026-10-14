import { copyFailure } from '../core/errors';

/** How to read one field of a record from a pasted table. */
export interface RecordField<Value = string> {
  /**
   * Header text that identifies the column; several for aliases. Matched ignoring case,
   * surrounding and repeated spaces, and full-width characters. Defaults to the key.
   */
  readonly header?: string | readonly string[];
  /** Turns the cell text into a value. Default: the text itself. A throw is reported in `errors`. */
  readonly parse?: (text: string, context: RecordParseContext) => Value;
  /** Report the column in `missing` when the table doesn't have it. Default `false`. */
  readonly required?: boolean;
}

export interface RecordParseContext {
  /** Zero-based data row (the header row is not counted). */
  readonly row: number;
  readonly key: string;
}

/** Field definitions by record key. */
export type RecordSchema = Readonly<Record<string, RecordField<unknown>>>;

/** The record a schema produces. A value is `undefined` when its column is missing or its `parse` threw. */
export type RecordOf<Schema extends RecordSchema> = {
  -readonly [Key in keyof Schema]: (Schema[Key] extends { readonly parse: (...args: never[]) => infer Value } ? Value : string) | undefined;
};

export interface RecordError<Key extends string = string> {
  readonly row: number;
  readonly key: Key;
  readonly text: string;
  readonly cause: unknown;
}

export interface RecordsResult<Schema extends RecordSchema> {
  readonly records: RecordOf<Schema>[];
  /** Required fields whose column was not found. */
  readonly missing: (keyof Schema & string)[];
  /** Cells whose `parse` threw. */
  readonly errors: RecordError<keyof Schema & string>[];
  /** `true` when nothing is missing and nothing failed to parse. */
  readonly ok: boolean;
}

export interface ToRecordsOptions {
  /**
   * `'header'`: find columns by header text. `'position'`: the schema's key order is the
   * column order. `'auto'` (default): by header when the table has one, else by position.
   */
  readonly match?: 'auto' | 'header' | 'position';
  /** Skip rows whose cells are all empty. Default `true`. */
  readonly skipEmptyRows?: boolean;
}

/** Any table of strings, such as the result of `parseTable`. */
export interface StringTable {
  readonly headers?: readonly string[] | null | undefined;
  readonly rows: readonly (readonly string[])[];
}

const normalize = (label: string): string => label.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Maps a pasted table onto typed records, for importing rows from Excel or Google Sheets.
 *
 * ```ts
 * const { records, missing, errors } = toRecords(parseTable(result)!, {
 *   email: { header: ['Email', 'E-mail'], required: true },
 *   seats: { header: 'Seats', parse: (text) => Number.parseInt(text, 10) },
 * });
 * // records: { email: string | undefined; seats: number | undefined }[]
 * ```
 */
export function toRecords<const Schema extends RecordSchema>(
  table: StringTable,
  schema: Schema,
  options: ToRecordsOptions = {},
): RecordsResult<Schema> {
  const input: unknown = table;
  if (typeof input !== 'object' || input === null || !Array.isArray((input as { rows?: unknown }).rows)) {
    throw copyFailure('invalid-payload', '`toRecords` expects a table with a `rows` array.');
  }
  const keys = Object.keys(schema) as (keyof Schema & string)[];
  if (keys.length === 0) throw copyFailure('invalid-payload', '`toRecords` needs at least one field.');

  const headers = Array.isArray(table.headers) ? table.headers : null;
  const match = options.match ?? 'auto';
  const byHeader = match === 'header' || (match === 'auto' && headers !== null);
  if (byHeader && headers === null) {
    throw copyFailure('invalid-payload', 'Matching by header needs a table with headers (`parseTable(…, { headers: true })`).');
  }

  const normalizedHeaders = headers?.map((label) => normalize(String(label))) ?? [];
  // A loop, not Math.max(...rows): spreading 100k+ rows overflows the call stack.
  let width = headers?.length ?? 0;
  if (headers === null) for (const row of table.rows) width = Math.max(width, row.length);
  const columnOf = new Map<string, number>();
  const missing: (keyof Schema & string)[] = [];
  keys.forEach((key, position) => {
    const field = schema[key] as RecordField<unknown>;
    let column = -1;
    if (byHeader) {
      const wanted = field.header === undefined ? [key] : typeof field.header === 'string' ? [field.header] : field.header;
      for (const label of wanted) {
        column = normalizedHeaders.indexOf(normalize(label));
        if (column !== -1) break;
      }
    } else {
      column = position;
    }
    if (column === -1 || column >= width) {
      if (field.required === true) missing.push(key);
    } else {
      columnOf.set(key, column);
    }
  });

  const skipEmpty = options.skipEmptyRows ?? true;
  const records: RecordOf<Schema>[] = [];
  const errors: RecordError<keyof Schema & string>[] = [];
  table.rows.forEach((row, rowIndex) => {
    if (skipEmpty && row.every((cell) => cell === '')) return;
    const record: Record<string, unknown> = {};
    for (const key of keys) {
      const column = columnOf.get(key);
      if (column === undefined) {
        record[key] = undefined;
        continue;
      }
      const text = row[column] ?? '';
      const parse = (schema[key] as RecordField<unknown>).parse;
      if (!parse) {
        record[key] = text;
        continue;
      }
      try {
        record[key] = parse(text, { row: rowIndex, key });
      } catch (cause) {
        record[key] = undefined;
        errors.push({ row: rowIndex, key, text, cause });
      }
    }
    records.push(record as RecordOf<Schema>);
  });

  return { records, missing, errors, ok: missing.length === 0 && errors.length === 0 };
}
