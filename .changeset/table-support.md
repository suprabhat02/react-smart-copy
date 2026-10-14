---
"react-smart-copy": minor
---

Add `react-smart-copy/table`: spreadsheet-ready copy and paste for tables.

- **Copy:** `tablePayload(data)` returns an `html` payload, an HTML `<table>` plus tab-separated text, for `copy()`, `useCopyInterceptor` and `useDragCopy`. Rows paste as cells in Excel, Google Sheets, Numbers and LibreOffice, and as a table in Docs, Word and Notion. Numbers, bigints, booleans and dates stay typed; strings stay text, so leading zeros survive (`preserveText`). Text that would run as a formula is neutralised by default, following OWASP's CSV Injection guidance (`formulaGuard`).
- **Sources:** `fromRows` for your own objects (type-checked column keys), `fromAgGrid` for AG Grid v31+ (Community and Enterprise), `fromTanStackTable` for TanStack Table v8 and v9 in any framework, and `fromTableElement` for any rendered `<table>`. No dependency on any grid library.
- **Paste:** `parseTable` reads the HTML that Excel, Google Sheets, Word and web pages put on the clipboard (merged cells, line breaks, hidden rows) and falls back to tab-separated text, also on the server. `toRecords` maps a pasted range onto typed records by header, with aliases, and reports missing columns and parse errors. Explicit limits for rows, columns, cells and input length, reported through `truncated`.

Also: a `CopyFailure` thrown inside a `copy()` source, a drag source or a copy transform now keeps its own error type (for example `too-large`) instead of becoming a generic `invalid-payload`.
