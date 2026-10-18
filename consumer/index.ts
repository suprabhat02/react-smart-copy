/**
 * A consumer of the published package: every entry point, through `exports`,
 * type-checked against the built declarations with `skipLibCheck: false`.
 * Run by `npm run types:consumer` (TypeScript 6) and in CI on TypeScript 7.
 */
import { CopyField, CopyGroup, PasteField, useCopy, usePaste, type CopyError } from 'react-smart-copy';
import { createCopyMachine, describeCopyError, type CopyPayload } from 'react-smart-copy/core';
import { svgToPngBlob } from 'react-smart-copy/capture';
import { createMockClipboardAdapter, createPasteResult } from 'react-smart-copy/testing';
import { fromRows, parseTable, tablePayload, toRecords } from 'react-smart-copy/table';
import { clipPayload, defineClipFormat, readClipSync } from 'react-smart-copy/structured';
import { htmlToMarkdown, pasteAsMarkdown, pasteToMarkdown } from 'react-smart-copy/markdown';
import { cleanCode, codePayload, inspectCode, pasteAsCode, pasteToCode, type CodeFinding } from 'react-smart-copy/code';

export const components = [CopyField.Root, CopyGroup, PasteField.Root] as const;
export const hooks = [useCopy, usePaste] as const;

const payload: CopyPayload = codePayload('$ npm test', { language: 'sh' });
export const machine = createCopyMachine({ adapter: createMockClipboardAdapter().adapter });
export const copied = machine.copy(payload);
export const describe = (error: CopyError): string => describeCopyError(error);

export const findings: readonly CodeFinding[] = inspectCode('\u202E').findings;
export const cleaned: string = cleanCode('x').code;
export const pasted = pasteToCode(createPasteResult({ text: 'x' }));
export const markdown: string | undefined = pasteToMarkdown({ text: 'x' })?.markdown;
export const handlers = [pasteAsCode, pasteAsMarkdown, htmlToMarkdown] as const;

export const table = tablePayload(fromRows([{ a: 1 }], [{ value: 'a', header: 'A' }]));
export const parsed = parseTable({ text: 'a\tb' });
export const records = toRecords;
export const capture = svgToPngBlob;

interface Note {
  readonly title: string;
}
const isNote = (value: unknown): value is Note => typeof value === 'object' && value !== null && typeof (value as { title?: unknown }).title === 'string';
const note = defineClipFormat({
  id: 'acme.note',
  schema: (data: unknown): Note => {
    if (!isNote(data)) throw new TypeError('not a note');
    return data;
  },
});
export const clip = clipPayload(note, { title: 'x' });
export const read = readClipSync;
