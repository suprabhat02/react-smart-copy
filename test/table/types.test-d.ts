import type { Table as TableV9, TableFeatures } from '@tanstack/table-core';
import type { GridApi, IRowNode, Column } from 'ag-grid-community';
import type { Table as TableV8 } from 'tanstack-table-core-v8';
import { describe, expectTypeOf, it } from 'vitest';
import type { HtmlPayload, TextPayload } from '../../src/core/payload';
import {
  fromAgGrid,
  fromRows,
  fromTanStackTable,
  parseTable,
  tablePayload,
  toRecords,
  type CellKey,
  type ParsedTable,
  type RecordOf,
  type TableData,
} from '../../src/table';

interface Invoice {
  id: string;
  amount: number;
  paid: boolean;
  due: Date;
  meta: { note: string };
  tags: string[];
}

declare const api: GridApi<Invoice>;
declare const tableV9: TableV9<TableFeatures, Invoice>;
declare const tableV8: TableV8<Invoice>;
declare const data: TableData;

describe('table types', () => {
  it('tablePayload returns HTML by default, text for format "text"', () => {
    expectTypeOf(tablePayload(data)).toEqualTypeOf<HtmlPayload>();
    expectTypeOf(tablePayload(data, { format: 'html' })).toEqualTypeOf<HtmlPayload>();
    expectTypeOf(tablePayload(data, { format: 'text' })).toEqualTypeOf<TextPayload>();
    const format = 'html' as 'html' | 'text';
    expectTypeOf(tablePayload(data, { format })).toEqualTypeOf<HtmlPayload | TextPayload>();
  });

  it('only allows keys whose values are cells', () => {
    expectTypeOf<CellKey<Invoice>>().toEqualTypeOf<'id' | 'amount' | 'paid' | 'due'>();
    fromRows<Invoice>([], [{ header: 'Id', value: 'id' }]);
    // @ts-expect-error `meta` is an object, not a cell.
    fromRows<Invoice>([], [{ header: 'Meta', value: 'meta' }]);
    // @ts-expect-error `tags` is an array, not a cell: map it with a function.
    fromRows<Invoice>([], [{ header: 'Tags', value: 'tags' }]);
    fromRows<Invoice>([], [{ header: 'Tags', value: (row) => row.tags.join(', ') }]);
    // @ts-expect-error A function must return a cell.
    fromRows<Invoice>([], [{ header: 'Meta', value: (row) => row.meta }]);
  });

  it('accepts a real AG Grid API (v36 types)', () => {
    expectTypeOf(fromAgGrid(api)).toEqualTypeOf<TableData>();
    fromAgGrid(api, {
      rows: 'selected',
      columns: ['id'],
      values: 'formatted',
      header: (column) => {
        // Inferred as AG Grid's own Column: methods beyond our interface are available.
        expectTypeOf(column.getColDef()).toExtend<object | null>();
        expectTypeOf(column).toExtend<Column>();
        return column.getColId();
      },
    });
    const nodes: IRowNode<Invoice>[] = api.getSelectedNodes();
    fromAgGrid(api, { rows: nodes });
    // @ts-expect-error Unknown row mode.
    fromAgGrid(api, { rows: 'visible' });
  });

  it('accepts real TanStack Table v9 and v8 instances', () => {
    expectTypeOf(fromTanStackTable(tableV9)).toEqualTypeOf<TableData>();
    expectTypeOf(fromTanStackTable(tableV8)).toEqualTypeOf<TableData>();
    fromTanStackTable(tableV8, { rows: tableV8.getRowModel().rows, header: (column) => column.id });
    // @ts-expect-error Unknown row mode.
    fromTanStackTable(tableV8, { rows: 'displayed' });
  });

  it('parses to string tables and infers record types from parse functions', () => {
    const parsed = parseTable('a');
    expectTypeOf(parsed).toEqualTypeOf<ParsedTable | null>();
    if (parsed) {
      expectTypeOf(parsed.rows).toEqualTypeOf<readonly (readonly string[])[]>();
      // A parsed table can be copied again as it is.
      tablePayload(parsed);
      const result = toRecords(parsed, {
        email: { header: 'Email', required: true },
        seats: { header: 'Seats', parse: (text) => Number(text) },
        active: { parse: (text) => text === 'yes' },
      });
      expectTypeOf(result.records).toEqualTypeOf<{ email: string | undefined; seats: number | undefined; active: boolean | undefined }[]>();
      expectTypeOf(result.missing).toEqualTypeOf<('email' | 'seats' | 'active')[]>();
      expectTypeOf<RecordOf<{ a: { parse: (text: string) => Date } }>>().toEqualTypeOf<{ a: Date | undefined }>();
    }
  });
});
