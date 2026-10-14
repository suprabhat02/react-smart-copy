import { copyFailure } from '../core/errors';
import { toCellValue } from './cell-value';
import type { TableCell, TableData } from './serialize';

/*
 * AG Grid support without depending on AG Grid: these interfaces describe only the
 * methods used, so any GridApi from v31 onwards (Community or Enterprise) fits.
 */

export interface AgGridColumnLike {
  getColId(): string;
}

export interface AgGridRowNodeLike {
  /** Position among displayed rows; `null` when filtered out or inside a collapsed group. */
  readonly rowIndex: number | null;
  readonly group?: boolean | undefined;
}

export interface AgGridApiLike<Node extends AgGridRowNodeLike, Column extends AgGridColumnLike> {
  getAllDisplayedColumns(): Column[];
  getDisplayNameForColumn(column: Column, location: 'csv'): string;
  getSelectedNodes(): Node[];
  getDisplayedRowCount(): number;
  getDisplayedRowAtIndex(index: number): Node | undefined;
  forEachNodeAfterFilterAndSort(callback: (node: Node, index: number) => void): void;
  forEachNode(callback: (node: Node, index: number) => void): void;
  /** v31.3+. */
  getCellValue?(params: { rowNode: Node; colKey: Column | string; useFormatter?: boolean }): unknown;
  /** v31–v32; removed in v33. */
  getValue?(colKey: Column | string, rowNode: Node): unknown;
}

export interface FromAgGridOptions<Node extends AgGridRowNodeLike, Column extends AgGridColumnLike> {
  /**
   * Which rows, in on-screen order:
   * - `'displayed'` (default): every row the grid displays after filtering, sorting and
   *   grouping, across all pages.
   * - `'selected'`: selected rows that are currently displayed.
   * - `'filtered'`: rows passing the filter, in sort order, including those inside
   *   collapsed groups.
   * - `'all'`: every row, in the order of your data.
   * - an array of row nodes, taken as given.
   */
  readonly rows?: 'displayed' | 'selected' | 'filtered' | 'all' | readonly Node[];
  /** Column ids to copy, in this order. Default: the displayed columns, minus the selection and row-number columns. */
  readonly columns?: readonly string[];
  /**
   * - `'auto'` (default): numbers, bigints and booleans raw, so spreadsheets can calculate
   *   with them; everything else as the grid's `valueFormatter` shows it.
   * - `'raw'`: the underlying values. `'formatted'`: exactly what the grid shows.
   */
  readonly values?: 'auto' | 'raw' | 'formatted';
  /** Include group rows (Enterprise row grouping). Default `false`: only rows with data. */
  readonly includeGroupRows?: boolean;
  /** Header text for a column. Default: the grid's own name for exports. */
  readonly header?: (column: Column) => string;
}

/** Ids of AG Grid's own utility columns, which hold no data. */
const UTILITY_COLUMNS = new Set(['ag-Grid-SelectionColumn', 'ag-Grid-RowNumbersColumn']);

const invalid = (message: string) => copyFailure('invalid-payload', message);

function collectRows<Node extends AgGridRowNodeLike, Column extends AgGridColumnLike>(
  api: AgGridApiLike<Node, Column>,
  rows: NonNullable<FromAgGridOptions<Node, Column>['rows']>,
): Node[] {
  if (typeof rows !== 'string') {
    const list: unknown = rows;
    if (!Array.isArray(list)) throw invalid('`rows` must be "displayed", "selected", "filtered", "all" or an array of row nodes.');
    return [...rows];
  }
  const nodes: Node[] = [];
  switch (rows) {
    case 'displayed': {
      const count = api.getDisplayedRowCount();
      for (let index = 0; index < count; index++) {
        const node = api.getDisplayedRowAtIndex(index);
        if (node) nodes.push(node);
      }
      return nodes;
    }
    case 'selected':
      // Selection order is click order; copy in the order the rows appear instead.
      return api
        .getSelectedNodes()
        .filter((node): node is Node & { rowIndex: number } => node.rowIndex !== null)
        .sort((a, b) => a.rowIndex - b.rowIndex);
    case 'filtered':
      api.forEachNodeAfterFilterAndSort((node) => nodes.push(node));
      return nodes;
    case 'all':
      api.forEachNode((node) => nodes.push(node));
      return nodes;
    default:
      throw invalid(`Unknown \`rows\` option: ${JSON.stringify(rows)}.`);
  }
}

/**
 * Reads rows from an AG Grid (v31+, Community or Enterprise) as table data.
 *
 * ```ts
 * copy(() => tablePayload(fromAgGrid(gridRef.current!.api, { rows: 'selected' })));
 * ```
 *
 * Gives Community grids Excel-ready copy, which AG Grid only ships in Enterprise.
 */
export function fromAgGrid<Node extends AgGridRowNodeLike, Column extends AgGridColumnLike>(
  api: AgGridApiLike<Node, Column>,
  options: FromAgGridOptions<Node, Column> = {},
): TableData {
  const candidate: unknown = api;
  if (typeof candidate !== 'object' || candidate === null || typeof api.getAllDisplayedColumns !== 'function') {
    throw invalid('`fromAgGrid` expects an AG Grid API (v31 or later): `gridRef.current.api` or the API from `onGridReady`.');
  }

  const read: (node: Node, column: Column, useFormatter: boolean) => unknown =
    typeof api.getCellValue === 'function'
      ? (node, column, useFormatter) => api.getCellValue?.({ rowNode: node, colKey: column, useFormatter })
      : typeof api.getValue === 'function'
        ? (node, column) => api.getValue?.(column, node)
        : () => {
            throw invalid('This grid API has neither `getCellValue` nor `getValue`; AG Grid v31 or later is required.');
          };

  const displayed = api.getAllDisplayedColumns();
  let columns: Column[];
  if (options.columns) {
    const byId = new Map(displayed.map((column) => [column.getColId(), column]));
    columns = options.columns.map((id) => {
      const column = byId.get(id);
      if (!column) throw invalid(`Column "${id}" is not displayed in the grid.`);
      return column;
    });
  } else {
    columns = displayed.filter((column) => !UTILITY_COLUMNS.has(column.getColId()));
  }

  const values = options.values ?? 'auto';
  const cell = (node: Node, column: Column): TableCell => {
    if (values === 'formatted') return toCellValue(read(node, column, true));
    const raw = read(node, column, false);
    if (values === 'raw') return toCellValue(raw);
    const type = typeof raw;
    return type === 'number' || type === 'bigint' || type === 'boolean' ? toCellValue(raw) : toCellValue(read(node, column, true));
  };

  const includeGroups = options.includeGroupRows ?? false;
  const nodes = collectRows(api, options.rows ?? 'displayed').filter((node) => includeGroups || node.group !== true);

  return {
    headers: columns.map((column) => options.header?.(column) ?? api.getDisplayNameForColumn(column, 'csv')),
    rows: nodes.map((node) => columns.map((column) => cell(node, column))),
  };
}
