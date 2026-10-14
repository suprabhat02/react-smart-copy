import { copyFailure } from '../core/errors';
import { toCellValue } from './cell-value';
import type { TableCell, TableData } from './serialize';

/*
 * TanStack Table support without depending on it: only the methods used are described,
 * so tables from v8 and v9, in any framework adapter (React, Vue, Solid, Svelte,
 * Angular, Lit), and libraries built on it such as Material React Table and Mantine
 * React Table, all fit.
 */

export interface TanStackColumnLike {
  readonly id: string;
  readonly columnDef: { readonly header?: unknown };
  /** Absent on display columns (checkboxes, actions), which hold no data. */
  readonly accessorFn?: unknown;
}

export interface TanStackRowLike {
  getValue(columnId: string): unknown;
  /** Present when the row selection feature is enabled. */
  getIsSelected?: () => boolean;
}

export interface TanStackTableLike<Row extends TanStackRowLike, Column extends TanStackColumnLike> {
  getRowModel(): { readonly rows: readonly Row[] };
  getAllLeafColumns(): readonly Column[];
  /** Present when the column visibility feature is enabled (always in v8). */
  getVisibleLeafColumns?: () => readonly Column[];
}

export interface FromTanStackTableOptions<Row extends TanStackRowLike, Column extends TanStackColumnLike> {
  /**
   * - `'visible'` (default): the rows the table renders now (`getRowModel()`): filtered,
   *   sorted, grouped and paginated.
   * - `'selected'`: those of them that are selected.
   * - an array of rows, such as `table.getPrePaginationRowModel().rows` for every page.
   */
  readonly rows?: 'visible' | 'selected' | readonly Row[];
  /** Column ids to copy, in this order. Default: visible leaf columns that hold data. */
  readonly columns?: readonly string[];
  /** Header text for a column. Default: `columnDef.header` when it is a string, else the column id. */
  readonly header?: (column: Column) => string;
  /** The cell for a row and column. Default: `row.getValue(column.id)`. */
  readonly value?: (row: Row, column: Column) => TableCell;
}

const invalid = (message: string) => copyFailure('invalid-payload', message);

/**
 * Reads rows from a TanStack Table instance (v8 or v9) as table data.
 *
 * ```ts
 * copy(() => tablePayload(fromTanStackTable(table, { rows: 'selected' })));
 * ```
 */
export function fromTanStackTable<Row extends TanStackRowLike, Column extends TanStackColumnLike>(
  table: TanStackTableLike<Row, Column>,
  options: FromTanStackTableOptions<Row, Column> = {},
): TableData {
  const candidate: unknown = table;
  if (typeof candidate !== 'object' || candidate === null || typeof table.getRowModel !== 'function') {
    throw invalid('`fromTanStackTable` expects a TanStack Table instance (v8 or v9).');
  }

  const all = table.getAllLeafColumns();
  let columns: readonly Column[];
  if (options.columns) {
    const byId = new Map(all.map((column) => [column.id, column]));
    columns = options.columns.map((id) => {
      const column = byId.get(id);
      if (!column) throw invalid(`Column "${id}" does not exist in the table.`);
      return column;
    });
  } else {
    const visible = typeof table.getVisibleLeafColumns === 'function' ? table.getVisibleLeafColumns() : all;
    columns = visible.filter((column) => column.accessorFn !== undefined);
  }

  const selection = options.rows ?? 'visible';
  let rows: readonly Row[];
  if (selection === 'visible' || selection === 'selected') {
    rows = table.getRowModel().rows;
    if (selection === 'selected') {
      rows = rows.filter((row) => {
        if (typeof row.getIsSelected !== 'function') {
          throw invalid('Row selection is not enabled on this table: register the row selection feature, or pass `rows`.');
        }
        return row.getIsSelected();
      });
    }
  } else if (Array.isArray(selection)) {
    rows = selection;
  } else {
    throw invalid('`rows` must be "visible", "selected" or an array of rows.');
  }

  const header = (column: Column): string => {
    if (options.header) return options.header(column);
    const label = column.columnDef.header;
    return typeof label === 'string' ? label : column.id;
  };
  const value = options.value ?? ((row: Row, column: Column) => toCellValue(row.getValue(column.id)));

  return {
    headers: columns.map(header),
    rows: rows.map((row) => columns.map((column) => value(row, column))),
  };
}
