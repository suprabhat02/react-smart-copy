/**
 * A clipboard capture: what one real app put on the clipboard, as the docs' Clipboard
 * Inspector writes it. Captures are the raw input of the corpus; what the library makes of
 * them is recorded beside them (see `expected/`), so a change in either shows in a review.
 */
export interface Capture {
  readonly schema: 1;
  /** The file's name without `.capture.json`: lower-case words joined by hyphens. */
  readonly id: string;
  readonly source: {
    readonly app: string;
    readonly appVersion: string;
    readonly os: string;
    readonly browser: string;
    /** `YYYY-MM-DD`. */
    readonly capturedAt: string;
  };
  readonly note?: string;
  /** Every text flavour on the clipboard, by MIME type, exactly as the browser gave it. */
  readonly types: Readonly<Record<string, string>>;
  /** Files on the clipboard: what they were, never their contents. */
  readonly files?: readonly { readonly name: string; readonly type: string; readonly size: number }[];
}

export const CAPTURE_ID = /^[a-z0-9][a-z0-9-]{2,63}$/;
export const MAX_FLAVOUR_LENGTH = 2_000_000;
const SOURCE_FIELDS = ['app', 'appVersion', 'os', 'browser', 'capturedAt'] as const;
const KEYS = new Set(['schema', 'id', 'source', 'note', 'types', 'files']);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';

/** Everything wrong with `value` as a capture named `id`; an empty list means it is one. */
export function captureProblems(value: unknown, id: string): string[] {
  if (!isRecord(value)) return ['is not an object'];
  const problems: string[] = [];
  for (const key of Object.keys(value)) if (!KEYS.has(key)) problems.push(`has an unknown field "${key}"`);
  if (value['schema'] !== 1) problems.push('schema must be 1');
  if (value['id'] !== id) problems.push(`id must be "${id}", the file's name`);
  if (!CAPTURE_ID.test(id)) problems.push('the file name must be lower-case words joined by hyphens, 3 to 64 characters');
  const source = value['source'];
  if (!isRecord(source)) problems.push('source must be an object');
  else {
    for (const field of SOURCE_FIELDS) if (!isText(source[field])) problems.push(`source.${field} must be text`);
    if (isText(source['capturedAt']) && !/^\d{4}-\d{2}-\d{2}$/.test(source['capturedAt'])) problems.push('source.capturedAt must be YYYY-MM-DD');
    for (const field of Object.keys(source)) if (!(SOURCE_FIELDS as readonly string[]).includes(field)) problems.push(`source has an unknown field "${field}"`);
  }
  if (value['note'] !== undefined && typeof value['note'] !== 'string') problems.push('note must be text');
  const types = value['types'];
  if (!isRecord(types) || Object.keys(types).length === 0) problems.push('types must hold at least one flavour');
  else {
    for (const [mime, data] of Object.entries(types)) {
      if (mime !== mime.toLowerCase() || !/^[a-z]+\/[a-z0-9.+-]+$/.test(mime)) problems.push(`"${mime}" is not a lower-case MIME type`);
      if (typeof data !== 'string') problems.push(`types["${mime}"] must be text`);
      else if (data.length > MAX_FLAVOUR_LENGTH) problems.push(`types["${mime}"] is longer than ${String(MAX_FLAVOUR_LENGTH)} characters`);
    }
  }
  const files = value['files'];
  if (files !== undefined) {
    if (!Array.isArray(files)) problems.push('files must be a list');
    else {
      for (const file of files as unknown[]) {
        if (!isRecord(file) || typeof file['name'] !== 'string' || typeof file['type'] !== 'string' || typeof file['size'] !== 'number' || !Number.isInteger(file['size']) || file['size'] < 0) {
          problems.push('every file needs a name, a type and a whole size');
          break;
        }
      }
    }
  }
  return problems;
}
