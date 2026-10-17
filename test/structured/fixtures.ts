import { isCopyFailure } from '../../src/core/errors';
import { defineClipFormat, type ClipFormatInfo, type ClipPayload } from '../../src/structured';

export interface Invoice {
  readonly id: string;
  readonly amount: number;
  readonly tags: readonly string[];
}

export function isInvoice(value: unknown): value is Invoice {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record['id'] === 'string' &&
    typeof record['amount'] === 'number' &&
    Array.isArray(record['tags']) &&
    record['tags'].every((tag) => typeof tag === 'string')
  );
}

/** A plain validator function: returns the value or throws. */
export function invoiceList(data: unknown): Invoice[] {
  if (!Array.isArray(data) || !data.every(isInvoice)) throw new TypeError('Expected a list of invoices.');
  return data;
}

export const Invoices = defineClipFormat({
  id: 'acme.invoices',
  schema: invoiceList,
  text: (rows) => rows.map((row) => `${row.id}\t${String(row.amount)}`).join('\n'),
});

export const INVOICES: Invoice[] = [
  { id: 'INV-1', amount: 12400, tags: ['web'] },
  { id: 'INV-2 <b>"&"</b>', amount: -50.5, tags: ['ünïcödé', '漢字', '🧾'] },
];

/** A clip payload as a paste result would carry it (`type` instead of `mimeType`). */
export function asPasteItems(payload: ClipPayload, only?: readonly string[]): { type: string; data: string }[] {
  return payload.items
    .filter((item) => only === undefined || only.includes(item.mimeType))
    .map((item) => ({ type: item.mimeType, data: item.data }));
}

/** The items a format writes, by carrier. */
export function carrierTypes(format: ClipFormatInfo) {
  return { web: format.webMimeType, custom: format.mimeType, html: 'text/html', text: 'text/plain' } as const;
}

export function failureOf(fn: () => unknown): { type: string; message: string } {
  try {
    fn();
  } catch (error) {
    if (isCopyFailure(error)) return { type: error.copyError.type, message: error.copyError.message };
    throw error;
  }
  throw new Error('Expected a CopyFailure');
}
