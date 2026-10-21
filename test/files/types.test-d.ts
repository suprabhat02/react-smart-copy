import { describe, expectTypeOf, it } from 'vitest';
import {
  acceptFiles,
  detectFileType,
  inspectFile,
  matchesAccept,
  safeFileName,
  type AcceptedFile,
  type AcceptFilesResult,
  type DetectedType,
  type FileInspection,
  type FileRejectReason,
  type FileRisk,
} from '../../src/files';

declare const event: DragEvent;
declare const paste: ClipboardEvent;
declare const input: HTMLInputElement;
declare const react: { readonly dataTransfer: DataTransfer };

describe('files types', () => {
  it('takes events, DataTransfers, FileLists and arrays', () => {
    expectTypeOf(acceptFiles(event)).toEqualTypeOf<Promise<AcceptFilesResult>>();
    expectTypeOf(acceptFiles(paste, { accept: '.pdf,image/*', block: ['executable'], digest: true })).toEqualTypeOf<Promise<AcceptFilesResult>>();
    expectTypeOf(acceptFiles(input.files ?? [])).toEqualTypeOf<Promise<AcceptFilesResult>>();
    expectTypeOf(acceptFiles(react)).toEqualTypeOf<Promise<AcceptFilesResult>>();
    expectTypeOf(acceptFiles([new Blob()], { accept: ['.csv'] })).toEqualTypeOf<Promise<AcceptFilesResult>>();
    expectTypeOf<AcceptFilesResult['accepted'][number]>().toEqualTypeOf<AcceptedFile>();
    expectTypeOf<AcceptFilesResult['rejected'][number]['reason']>().toEqualTypeOf<FileRejectReason>();
    // @ts-expect-error: not a risk
    void acceptFiles([], { block: ['virus'] });
    // @ts-expect-error: not a file source
    void acceptFiles('report.pdf');
  });

  it('inspects and detects', () => {
    expectTypeOf(inspectFile(new Blob(), { name: 'a.pdf' })).toEqualTypeOf<Promise<FileInspection>>();
    expectTypeOf(detectFileType(new Uint8Array())).toEqualTypeOf<DetectedType | null>();
    expectTypeOf<FileInspection['risks'][number]>().toEqualTypeOf<FileRisk>();
    expectTypeOf(matchesAccept).parameter(1).toEqualTypeOf<string | readonly string[]>();
    expectTypeOf(safeFileName('a', { maxBytes: 100 })).toBeString();
  });
});
