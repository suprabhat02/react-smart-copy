import {
  constructTable,
  createColumnHelper,
  rowSelectionFeature,
  columnVisibilityFeature,
  tableFeatures,
} from '@tanstack/table-core';
import { storeReactivityBindings } from '@tanstack/table-core/store-reactivity-bindings';
import { AllCommunityModule, ModuleRegistry, createGrid, type GridApi, type IRowNode } from 'ag-grid-community';
import { createTable as createTableV8, getCoreRowModel as getCoreRowModelV8, type ColumnDef as ColumnDefV8 } from 'tanstack-table-core-v8';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { isCopyFailure } from '../../src/core/errors';
import { fromAgGrid, fromTanStackTable, tablePayload, toCellValue, type AgGridApiLike, type AgGridColumnLike, type AgGridRowNodeLike } from '../../src/table';

function failureMessage(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (isCopyFailure(error)) return error.copyError.message;
    throw error;
  }
  throw new Error('Expected a CopyFailure');
}

interface Invoice {
  id: string;
  client: string;
  amount: number;
  due: Date;
  tags: string[];
}

const invoices: Invoice[] = [
  { id: 'INV-1', client: 'DesignCo', amount: 12400, due: new Date('2026-11-01T00:00:00.000Z'), tags: ['web', 'q4'] },
  { id: 'INV-2', client: 'Northwind', amount: -50, due: new Date('2026-11-15T00:00:00.000Z'), tags: [] },
  { id: 'INV-3', client: 'Acme', amount: 21000, due: new Date('2026-12-01T00:00:00.000Z'), tags: ['rush'] },
];

/* ------------------------------------------------------------------ AG Grid */

describe('fromAgGrid (real AG Grid Community)', () => {
  let api: GridApi<Invoice>;
  beforeAll(() => {
    ModuleRegistry.registerModules([AllCommunityModule]);
  });
  afterEach(() => {
    api.destroy();
    document.body.innerHTML = '';
  });

  function grid(extra: Partial<Parameters<typeof createGrid<Invoice>>[1]> = {}): GridApi<Invoice> {
    const host = document.createElement('div');
    document.body.append(host);
    api = createGrid<Invoice>(host, {
      columnDefs: [
        { field: 'id', headerName: 'Invoice' },
        { field: 'client' },
        { field: 'amount', valueFormatter: (params) => `₹${String(params.value)}` },
        { field: 'due', valueFormatter: (params) => (params.value as Date).toISOString().slice(0, 10) },
        { field: 'tags' },
      ],
      rowData: invoices,
      rowSelection: { mode: 'multiRow' },
      getRowId: (params) => params.data.id,
      ...extra,
    });
    return api;
  }

  it('copies displayed rows with export header names, skipping the selection column', () => {
    const data = fromAgGrid(grid());
    expect(data.headers).toEqual(['Invoice', 'Client', 'Amount', 'Due', 'Tags']);
    // 'auto': numbers raw, everything else as the grid formats it.
    // AG Grid shows an array without a formatter as "web,q4"; the copy matches the screen.
    expect(data.rows[0]).toEqual(['INV-1', 'DesignCo', 12400, '2026-11-01', 'web,q4']);
    expect(data.rows[1]?.[2]).toBe(-50);
    expect(tablePayload(data).text.split('\r\n')[2]).toBe('INV-2\tNorthwind\t-50\t2026-11-15\t');
  });

  it('follows sorting and filtering', () => {
    grid();
    api.applyColumnState({ state: [{ colId: 'amount', sort: 'desc' }] });
    expect(fromAgGrid(api).rows.map((row) => row[0])).toEqual(['INV-3', 'INV-1', 'INV-2']);
    api.setGridOption('quickFilterText', 'acme');
    expect(fromAgGrid(api).rows.map((row) => row[0])).toEqual(['INV-3']);
    expect(fromAgGrid(api, { rows: 'filtered' }).rows.map((row) => row[0])).toEqual(['INV-3']);
    expect(fromAgGrid(api, { rows: 'all' }).rows.map((row) => row[0])).toEqual(['INV-1', 'INV-2', 'INV-3']);
  });

  it('copies selected rows in on-screen order, not click order, ignoring hidden ones', () => {
    grid();
    api.applyColumnState({ state: [{ colId: 'amount', sort: 'asc' }] });
    api.getRowNode('INV-3')?.setSelected(true);
    api.getRowNode('INV-2')?.setSelected(true);
    expect(fromAgGrid(api, { rows: 'selected' }).rows.map((row) => row[0])).toEqual(['INV-2', 'INV-3']);
    api.setGridOption('quickFilterText', 'acme');
    expect(fromAgGrid(api, { rows: 'selected' }).rows.map((row) => row[0])).toEqual(['INV-3']);
  });

  it('copies an explicit list of nodes', () => {
    grid();
    const node = api.getRowNode('INV-2') as IRowNode<Invoice>;
    expect(fromAgGrid(api, { rows: [node] }).rows).toHaveLength(1);
  });

  it('chooses and orders columns, and reports unknown ones', () => {
    grid();
    expect(fromAgGrid(api, { columns: ['amount', 'id'] }).headers).toEqual(['Amount', 'Invoice']);
    expect(failureMessage(() => fromAgGrid(api, { columns: ['nope'] }))).toMatch(/Column "nope" is not displayed/);
  });

  it('reads raw or formatted values on request', () => {
    grid();
    expect(fromAgGrid(api, { values: 'raw' }).rows[0]?.slice(2, 4)).toEqual([12400, invoices[0]?.due]);
    expect(fromAgGrid(api, { values: 'formatted' }).rows[0]?.slice(2, 4)).toEqual(['₹12400', '2026-11-01']);
  });

  it('uses a custom header', () => {
    grid();
    expect(fromAgGrid(api, { header: (column) => column.getColId().toUpperCase() }).headers?.[0]).toBe('ID');
  });

  it('rejects an unknown rows option and a non-array', () => {
    grid();
    expect(failureMessage(() => fromAgGrid(api, { rows: 'visible' as never }))).toMatch(/Unknown `rows` option/);
    expect(failureMessage(() => fromAgGrid(api, { rows: { length: 0 } as never }))).toMatch(/array of row nodes/);
  });
});

describe('fromAgGrid (older and partial APIs)', () => {
  interface Node extends AgGridRowNodeLike {
    readonly id: string;
  }
  const column = (id: string): AgGridColumnLike => ({ getColId: () => id });
  const nodes: Node[] = [
    { id: 'g', rowIndex: 0, group: true },
    { id: 'a', rowIndex: 1 },
    { id: 'b', rowIndex: null },
  ];
  const base = (overrides: Partial<AgGridApiLike<Node, AgGridColumnLike>> = {}): AgGridApiLike<Node, AgGridColumnLike> => ({
    getAllDisplayedColumns: () => [column('ag-Grid-RowNumbersColumn'), column('x')],
    getDisplayNameForColumn: (col) => col.getColId(),
    getSelectedNodes: () => nodes,
    getDisplayedRowCount: () => 3,
    getDisplayedRowAtIndex: (index) => (index === 2 ? undefined : nodes[index]),
    forEachNodeAfterFilterAndSort: (callback) => {
      nodes.forEach(callback);
    },
    forEachNode: (callback) => {
      nodes.forEach(callback);
    },
    ...overrides,
  });

  it('falls back to getValue (v31–v32) and skips the row-number column', () => {
    const api = base({ getValue: (col, node) => `${typeof col === 'string' ? col : col.getColId()}:${node.id}` });
    expect(fromAgGrid(api)).toEqual({ headers: ['x'], rows: [['x:a']] });
  });

  it('includes group rows on request, and skips missing displayed rows', () => {
    const api = base({ getValue: (_, node) => node.id });
    expect(fromAgGrid(api, { includeGroupRows: true }).rows).toEqual([['g'], ['a']]);
  });

  it('formats objects without a formatter safely', () => {
    const api = base({ getCellValue: () => ({ nested: true }) });
    expect(fromAgGrid(api).rows).toEqual([['{"nested":true}']]);
  });

  it('explains when neither value API exists', () => {
    expect(failureMessage(() => fromAgGrid(base()))).toMatch(/AG Grid v31 or later is required/);
  });

  it('rejects something that is not a grid API', () => {
    expect(failureMessage(() => fromAgGrid(null as never))).toMatch(/expects an AG Grid API/);
    expect(failureMessage(() => fromAgGrid({} as never))).toMatch(/expects an AG Grid API/);
  });
});

/* ------------------------------------------------------------- TanStack v9 */

describe('fromTanStackTable (real TanStack Table v9)', () => {
  const features = tableFeatures({ coreReactivityFeature: storeReactivityBindings(), rowSelectionFeature, columnVisibilityFeature });
  const helper = createColumnHelper<typeof features, Invoice>();
  const columns = helper.columns([
    helper.display({ id: 'select', header: 'Select' }),
    helper.accessor('id', { header: 'Invoice' }),
    helper.accessor('client', { header: () => 'Client (rendered)' }),
    helper.accessor('amount', { header: 'Amount' }),
    helper.accessor('tags', { header: 'Tags' }),
  ]);

  const make = (state: Record<string, unknown> = {}) =>
    constructTable({ features, columns, data: invoices, getRowId: (row) => row.id, initialState: state });

  it('copies visible rows and data columns, skipping display columns', () => {
    const data = fromTanStackTable(make());
    expect(data.headers).toEqual(['Invoice', 'client', 'Amount', 'Tags']);
    expect(data.rows[0]).toEqual(['INV-1', 'DesignCo', 12400, 'web, q4']);
  });

  it('respects column visibility', () => {
    const data = fromTanStackTable(make({ columnVisibility: { client: false } }));
    expect(data.headers).toEqual(['Invoice', 'Amount', 'Tags']);
  });

  it('copies selected rows', () => {
    const data = fromTanStackTable(make({ rowSelection: { 'INV-3': true, 'INV-1': true } }), { rows: 'selected' });
    expect(data.rows.map((row) => row[0])).toEqual(['INV-1', 'INV-3']);
  });

  it('chooses columns, headers and values', () => {
    const table = make();
    const data = fromTanStackTable(table, {
      columns: ['amount', 'select'],
      header: (column) => `[${column.id}]`,
      value: (row, column) => (column.id === 'select' ? '✓' : toCellValue(row.getValue(column.id))),
    });
    expect(data).toEqual({ headers: ['[amount]', '[select]'], rows: [[12400, '✓'], [-50, '✓'], [21000, '✓']] });
    expect(failureMessage(() => fromTanStackTable(table, { columns: ['missing'] }))).toMatch(/Column "missing" does not exist/);
  });

  it('copies an explicit list of rows', () => {
    const table = make();
    const [first] = table.getRowModel().rows;
    expect(fromTanStackTable(table, { rows: first ? [first] : [] }).rows).toHaveLength(1);
  });

  it('explains when row selection is not enabled', () => {
    const table = {
      getRowModel: () => ({ rows: [{ getValue: () => 'x' }] }),
      getAllLeafColumns: () => [{ id: 'x', columnDef: {}, accessorFn: () => 'x' }],
    };
    expect(failureMessage(() => fromTanStackTable(table, { rows: 'selected' }))).toMatch(/Row selection is not enabled/);
  });

  it('works without the column visibility feature', () => {
    const table = {
      getRowModel: () => ({ rows: [{ getValue: (id: string) => id }] }),
      getAllLeafColumns: () => [
        { id: 'a', columnDef: { header: 'A' }, accessorFn: () => 'a' },
        { id: 'b', columnDef: {} },
      ],
    };
    expect(fromTanStackTable(table)).toEqual({ headers: ['A'], rows: [['a']] });
  });

  it('rejects bad input', () => {
    expect(failureMessage(() => fromTanStackTable(null as never))).toMatch(/expects a TanStack Table instance/);
    expect(failureMessage(() => fromTanStackTable({} as never))).toMatch(/expects a TanStack Table instance/);
    expect(failureMessage(() => fromTanStackTable(make(), { rows: 'all' as never }))).toMatch(/`rows` must be/);
  });
});

/* ------------------------------------------------------------- TanStack v8 */

describe('fromTanStackTable (real TanStack Table v8)', () => {
  it('reads a v8 table the same way', () => {
    const columns: ColumnDefV8<Invoice>[] = [
      { id: 'select', header: 'Select' },
      { accessorKey: 'id', header: 'Invoice' },
      { accessorKey: 'amount', header: 'Amount' },
    ];
    const table = createTableV8<Invoice>({
      data: invoices,
      columns,
      getCoreRowModel: getCoreRowModelV8(),
      state: { rowSelection: { '1': true } },
      onStateChange: () => undefined,
      renderFallbackValue: null,
    });
    expect(fromTanStackTable(table)).toEqual({
      headers: ['Invoice', 'Amount'],
      rows: [
        ['INV-1', 12400],
        ['INV-2', -50],
        ['INV-3', 21000],
      ],
    });
    expect(fromTanStackTable(table, { rows: 'selected' }).rows).toEqual([['INV-2', -50]]);
  });
});

/* ------------------------------------------------------------- toCellValue */

describe('toCellValue', () => {
  it('keeps cells and makes everything else safe', () => {
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    const loop: unknown[] = [];
    loop.push(loop);
    const date = new Date(0);
    expect(toCellValue('s')).toBe('s');
    expect(toCellValue(1)).toBe(1);
    expect(toCellValue(1n)).toBe(1n);
    expect(toCellValue(true)).toBe(true);
    expect(toCellValue(undefined)).toBeUndefined();
    expect(toCellValue(null)).toBeNull();
    expect(toCellValue(date)).toBe(date);
    expect(toCellValue(new Date('x'))).toBe('');
    expect(toCellValue(() => 1)).toBe('');
    expect(toCellValue(Symbol('s'))).toBe('');
    expect(toCellValue({ a: 1 })).toBe('{"a":1}');
    expect(toCellValue({ toJSON: () => undefined })).toBe('');
    expect(toCellValue(circular)).toBe('[object Object]');
    expect(toCellValue({ big: 1n })).toBe('[object Object]');
    expect(toCellValue(['a', 2, 3n, false, null, undefined, new Date(0), new Date('x'), () => 1, Symbol('s'), { b: 1 }, loop])).toBe(
      'a, 2, 3, false, , , 1970-01-01T00:00:00.000Z, , , , {"b":1}, [object Array]',
    );
  });
});
