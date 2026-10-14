/**
 * `react-smart-copy/table`
 *
 * Spreadsheet-ready copy and paste for tables. Framework-agnostic and free of
 * dependencies: use it with `useCopy`, `useCopyInterceptor`, `useDragCopy` and
 * `usePaste`, or on its own.
 *
 * - Copy: {@link tablePayload} turns {@link TableData} into an HTML table plus
 *   tab-separated text, which Excel, Google Sheets, Numbers, LibreOffice, Docs, Word
 *   and Notion all paste as a table.
 * - Sources: {@link fromRows} for your own objects, {@link fromAgGrid},
 *   {@link fromTanStackTable}, and {@link fromTableElement} for any rendered `<table>`.
 * - Paste: {@link parseTable} reads what spreadsheets put on the clipboard;
 *   {@link toRecords} maps it onto typed records.
 *
 * @module
 */

export {
  DEFAULT_TABLE_MAX_CELLS,
  fromRows,
  tablePayload,
  tableToHtml,
  tableToTsv,
  type CellFormatContext,
  type CellKey,
  type TableCell,
  type TableColumn,
  type TableData,
  type TableFormatOptions,
  type TablePayloadOptions,
  type TableRow,
} from './serialize';
export {
  DEFAULT_PARSE_MAX_CELLS,
  DEFAULT_PARSE_MAX_COLUMNS,
  DEFAULT_PARSE_MAX_LENGTH,
  DEFAULT_PARSE_MAX_ROWS,
  fromTableElement,
  parseDelimited,
  parseHtmlTable,
  parseTable,
  type ParseTableOptions,
  type ParsedTable,
  type TableSource,
} from './parse';
export {
  toRecords,
  type RecordError,
  type RecordField,
  type RecordOf,
  type RecordParseContext,
  type RecordSchema,
  type RecordsResult,
  type StringTable,
  type ToRecordsOptions,
} from './records';
export { toCellValue } from './cell-value';
export {
  fromAgGrid,
  type AgGridApiLike,
  type AgGridColumnLike,
  type AgGridRowNodeLike,
  type FromAgGridOptions,
} from './ag-grid';
export {
  fromTanStackTable,
  type FromTanStackTableOptions,
  type TanStackColumnLike,
  type TanStackRowLike,
  type TanStackTableLike,
} from './tanstack';
