import { TEXT_MIME_BY_EXTENSION } from './inspect';
import type { FileInspection } from './types';

/** The tokens of an `accept` list, as in `<input type="file" accept>`: `.pdf`, `image/*`, `text/csv`. Lowercase. */
export function parseAccept(accept: string | readonly string[]): readonly string[] {
  const list = typeof accept === 'string' ? accept.split(',') : accept;
  return list.map((token) => token.trim().toLowerCase()).filter((token) => /^(?:\.[^\s,/\\]+|\*|\*\/\*|[a-z0-9!#$&^_.+-]+\/(?:\*|[a-z0-9!#$&^_.+-]+))$/.test(token));
}

/**
 * Whether a file fits an `accept` list, judged by its content. An extension token (`.pdf`)
 * matches the name, when the content does not contradict it. A MIME token (`application/pdf`,
 * `image/*`) matches the detected type or its container; plain text also matches the type its
 * extension names (`text/csv` for `data.csv`). The claimed type is never used. An empty list
 * accepts everything.
 */
export function matchesAccept(inspection: FileInspection, accept: string | readonly string[]): boolean {
  const tokens = parseAccept(accept);
  if (tokens.length === 0) return true;
  const name = inspection.name.toLowerCase();
  const types = [inspection.type];
  if (inspection.detected?.parent) types.push(inspection.detected.parent);
  if (inspection.detected?.family === 'text' && !inspection.mismatch && inspection.extension !== null) {
    types.push(...(TEXT_MIME_BY_EXTENSION[inspection.extension] ?? []));
  }
  return tokens.some((token) => {
    if (token === '*' || token === '*/*') return true;
    if (token.startsWith('.')) return name.endsWith(token) && !inspection.mismatch;
    if (token.endsWith('/*')) return inspection.detected !== null && types.some((type) => type.startsWith(token.slice(0, -1)));
    return types.includes(token);
  });
}
