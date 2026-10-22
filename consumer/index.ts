/**
 * A consumer of the published package: every entry point, through `exports`,
 * type-checked against the built declarations with `skipLibCheck: false`.
 * Run by `npm run types:consumer` (TypeScript 6) and in CI on TypeScript 5.0 and 7.
 */
import { CopyField, CopyGroup, PasteField, useCopy, usePaste, useShare, type CopyError } from 'react-smart-copy';
import { createCopyMachine, describeCopyError, type CopyPayload } from 'react-smart-copy/core';
import { svgToPngBlob } from 'react-smart-copy/capture';
import { createMockClipboardAdapter, createPasteResult } from 'react-smart-copy/testing';
import { fromRows, parseTable, tablePayload, toRecords } from 'react-smart-copy/table';
import { clipPayload, defineClipFormat, readClipSync } from 'react-smart-copy/structured';
import { htmlToMarkdown, pasteAsMarkdown, pasteToMarkdown } from 'react-smart-copy/markdown';
import { prepareImage, readImageInfo, stripMetadata, type ImageInfo, type PreparedImage } from 'react-smart-copy/image';
import { linkPayload, readLink, textFragmentUrl, type ResolvedLink } from 'react-smart-copy/link';
import { shareOrCopy, type ShareOutcome } from 'react-smart-copy/share';
import { colorPayload, contrastRatio, formatColor, parseColor, type Color } from 'react-smart-copy/color';
import { pasteAsRich, pasteToRich, prepareRich, richPayload, richTransform, type RichPaste, type RichResult } from 'react-smart-copy/rich';
import { cleanCode, codePayload, inspectCode, pasteAsCode, pasteToCode, type CodeFinding } from 'react-smart-copy/code';
import { acceptFiles, inspectFile, safeFileName, type AcceptFilesResult, type FileInspection } from 'react-smart-copy/files';
import { pasteWithoutSecrets, redactSecrets, scanSecrets, secretRedactor, type SecretScan } from 'react-smart-copy/secrets';

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

export const imageInfo: Promise<ImageInfo> = readImageInfo(new Blob());
export const stripped = stripMetadata(new Blob(), { keepOrientation: false });
export const prepared: Promise<PreparedImage> = prepareImage(new Blob(), { maxWidth: 2048, maxBytes: 1_000_000, type: 'image/webp' });

export const linkCopy: CopyPayload = linkPayload({ url: 'https://example.com', title: 'Example' }, { text: 'markdown', clean: true });
export const linkDrag: CopyPayload = linkPayload('https://example.com', { target: 'drag' });
export const pastedLink: ResolvedLink | null = readLink({ text: 'https://example.com' });
export const passage: string = textFragmentUrl('https://example.com', { start: 'a', end: 'b' });
export const shared: Promise<ShareOutcome> = shareOrCopy({ url: 'https://example.com', title: 'Example' }, { mode: 'auto' });
export const shareHook = useShare;
export const parsedColor: Color | null = parseColor('oklch(70% 0.1 200)');
export const oklch: string = formatColor('#3b82f6', 'oklch', { precision: 3 });
export const swatch: CopyPayload = colorPayload('#3b82f6', { format: 'rgb' });
export const ratio: number = contrastRatio('#767676', '#fff');
export const portable: RichResult = prepareRich('<p>x</p>', { colors: 'readable', images: 'keep' });
export const rich: CopyPayload = richPayload('<p>x</p>');
export const nativeCopy = richTransform({ base: 'https://example.com' });
export const pastedRich: RichPaste | null = pasteToRich({ html: '<p>x</p>' }, { formats: ['bold', 'link'] });
export const pasteRichHandler: (event: ClipboardEvent) => boolean = (event) => pasteAsRich(event);
export const dropped: Promise<AcceptFilesResult> = acceptFiles(new DataTransfer(), { accept: '.pdf,image/*', maxFileBytes: 20_000_000, digest: true });
export const inspected: Promise<FileInspection> = inspectFile(new Blob(), { name: 'a.pdf' });
export const fileName: string = safeFileName('../a.txt', { maxBytes: 100 });
export const scanned: SecretScan = scanSecrets('x', { minConfidence: 'high' });
export const redacted: string = redactSecrets('x').text;
export const guard = (event: ClipboardEvent): string => pasteWithoutSecrets(event, { action: 'block' });
export const redactor = secretRedactor();
