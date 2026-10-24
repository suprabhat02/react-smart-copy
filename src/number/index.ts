/**
 * `react-smart-copy/number`
 *
 * Numbers and amounts, pasted and copied across locales: `1.234,50 €` from a bank statement,
 * `$1,234.50` from an invoice, `12,34,567` in lakh grouping, `(1,234)` from a spreadsheet,
 * read exactly, and written back the way a locale or a spreadsheet takes them. Free of
 * dependencies, and safe on servers.
 *
 * - {@link parseNumber}: a pasted number, its currency and percent, exactly.
 * - {@link pasteAsNumber}: a paste handler for number and amount fields.
 * - {@link formatNumber} and {@link numberPayload}: write and copy a number for a locale.
 * - {@link numberSymbols}: a locale's decimal and group separators.
 *
 * @module
 */

export { parseNumber, NUMBER_MAX_LENGTH, type NumberKind, type ParsedNumber, type ParseNumberOptions } from './parse';
export type { NumberCurrency } from './currency';
export { formatNumber, numberPayload, type FormatNumberOptions } from './format';
export { pasteAsNumber, type NumberPasteEvent, type NumberPasteOutcome, type PasteAsNumberOptions } from './paste';
export { numberSymbols, type NumberSymbols } from './locale';
