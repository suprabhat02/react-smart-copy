import { afterEach, describe, expect, it, vi } from 'vitest';
import { acceptFiles, formatBytes, type AcceptFilesResult } from '../../src/files';
import { SAMPLES, utf8 } from './fixtures';

const file = (data: Uint8Array | string, name: string, type = ''): File =>
  new File([(typeof data === 'string' ? utf8(data) : data) as BlobPart], name, { type, lastModified: 1_700_000_000_000 });
const pdf = (name = 'report.pdf'): File => file(SAMPLES['pdf'] as Uint8Array, name, 'application/pdf');

/* A file system, as `webkitGetAsEntry` gives it. */
type Node = File | { readonly [name: string]: Node } | 'unreadable' | 'odd';

interface FakeEntry {
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  readonly name: string;
  file?: (success: (file: File) => void, failure: (error: unknown) => void) => void;
  createReader?: () => { readEntries: (success: (entries: FakeEntry[]) => void, failure: (error: unknown) => void) => void };
}

function entry(name: string, node: Node, batch = 2): FakeEntry {
  if (node instanceof File) return { isFile: true, isDirectory: false, name, file: (success) => { success(node); } };
  // Neither a file nor a folder: skipped.
  if (node === 'odd') return { isFile: false, isDirectory: false, name };
  if (node === 'unreadable') {
    return { isFile: true, isDirectory: false, name, file: (_success, failure) => { failure(new Error('gone')); } };
  }
  const children = Object.entries(node).map(([child, value]) => entry(child, value, batch));
  return {
    isFile: false,
    isDirectory: true,
    name,
    createReader: () => {
      let at = 0;
      return {
        readEntries: (success, failure) => {
          if (name === 'locked') {
            failure(new Error('denied'));
            return;
          }
          // Batches, as Chromium returns them, then an empty batch.
          const next = children.slice(at, at + batch);
          at += batch;
          queueMicrotask(() => { success(next); });
        },
      };
    },
  };
}

/** A DataTransfer holding `roots`: entries for folders and files, as in a drop. */
function transfer(roots: Readonly<Record<string, Node>>, options: { readonly entries?: boolean; readonly items?: boolean } = {}): DataTransfer {
  const files = Object.values(roots).filter((node): node is File => node instanceof File);
  const items = Object.entries(roots).map(([name, node]) => ({
    kind: 'file',
    type: node instanceof File ? node.type : '',
    getAsFile: () => (node instanceof File ? node : null),
    ...(options.entries === false ? {} : { webkitGetAsEntry: () => entry(name, node) }),
  }));
  return { files, items: options.items === false ? undefined : [...items, { kind: 'string', type: 'text/plain' }], types: ['Files'] } as unknown as DataTransfer;
}

const summary = (result: AcceptFilesResult) => ({
  accepted: result.accepted.map((item) => item.path),
  rejected: result.rejected.map((item) => `${item.path}: ${item.reason}`),
  truncated: result.truncated,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('acceptFiles', () => {
  it('accepts safe files, rejects risky ones with a reason and a message', async () => {
    const result = await acceptFiles([
      pdf(),
      file(SAMPLES['html'] as Uint8Array, 'invoice.pdf', 'application/pdf'),
      file(SAMPLES['exe'] as Uint8Array, 'invoice.pdf.exe'),
      file('a,b\n1,2', 'data.csv', 'text/csv'),
      file('', 'empty.txt'),
    ]);
    expect(summary(result)).toEqual({
      accepted: ['report.pdf', 'data.csv'],
      rejected: ['invoice.pdf: blocked', 'invoice.pdf.exe: blocked', 'empty.txt: blocked'],
      truncated: false,
    });
    expect(result.rejected.map((item) => item.message)).toEqual([
      "invoice.pdf is a web page or SVG that can run scripts, so it can't be added.",
      "invoice.pdf.exe is a program or script, which can't be added.",
      'empty.txt is empty.',
    ]);
    expect(result.rejected[1]?.risks).toEqual(['executable', 'double-extension']);
    expect(result.totalBytes).toBe((SAMPLES['pdf'] as Uint8Array).length + 7);
  });

  it('gives each accepted file a safe name and its detected type for upload', async () => {
    const { accepted } = await acceptFiles([file(SAMPLES['png'] as Uint8Array, '../../a:b.png', 'image/gif')]);
    const [item] = accepted;
    expect(item).toMatchObject({ name: 'a_b.png', path: 'a_b.png', type: 'image/png', size: 8, sha256: null });
    expect(item?.upload).toBeInstanceOf(File);
    expect((item?.upload as File).name).toBe('a_b.png');
    expect(item?.upload.type).toBe('image/png');
    expect((item?.upload as File).lastModified).toBe(1_700_000_000_000);
    expect(item?.inspection.declaredType).toBe('image/gif');
  });

  it('accepts risky files when told to, still reporting their risks', async () => {
    const { accepted } = await acceptFiles([file(SAMPLES['svg'] as Uint8Array, 'logo.svg')], { block: ['executable'] });
    expect(accepted[0]?.inspection.risks).toEqual(['active-content']);
    expect(accepted[0]?.type).toBe('image/svg+xml');
  });

  it('names the risk that blocked each file', async () => {
    const cases = [
      ['macros', file(SAMPLES['docx'] as Uint8Array, 'budget.docm'), "budget.docm can contain macros, so it can't be added."],
      ['type-mismatch', file(SAMPLES['png'] as Uint8Array, 'photo.jpg'), 'photo.jpg is not the type of file its name says.'],
      ['double-extension', file(SAMPLES['exe'] as Uint8Array, 'invoice.pdf.exe'), 'invoice.pdf.exe hides its real type behind a second extension.'],
      ['hidden-characters', file('x', 'notes\u200B.txt'), 'notes.txt has hidden characters in its name.'],
    ] as const;
    for (const [risk, item, message] of cases) {
      const { rejected } = await acceptFiles([item], { block: [risk] });
      expect(rejected[0]?.message).toBe(message);
    }
  });

  it('applies accept by content', async () => {
    const result = await acceptFiles([pdf(), file(SAMPLES['png'] as Uint8Array, 'a.png'), file('x', 'notes.txt')], { accept: '.pdf,image/*' });
    expect(summary(result).rejected).toEqual(['notes.txt: not-accepted']);
    expect(result.rejected[0]?.message).toBe('notes.txt is not a type of file that can be added here.');
  });

  it('enforces the size, total and count limits', async () => {
    const big = file('x'.repeat(2048), 'big.txt');
    const result = await acceptFiles([big, file('a', 'a.txt'), file('bb', 'b.txt'), file('c', 'c.txt'), file('d', 'd.txt')], {
      maxFileBytes: 1024,
      maxTotalBytes: 2,
      maxFiles: 4,
    });
    expect(summary(result)).toEqual({
      accepted: ['a.txt', 'c.txt'],
      rejected: ['big.txt: too-large', 'b.txt: total-too-large', 'd.txt: too-many'],
      truncated: true,
    });
    expect(result.rejected.map((item) => item.message)).toEqual([
      'big.txt is larger than 1 KB.',
      'b.txt was not added: the files together would be larger than 2 bytes.',
      'd.txt and any files after it were not added: at most 4 files can be added at once.',
    ]);
  });

  it('refuses limits that are not numbers of at least 0', async () => {
    await expect(acceptFiles([], { maxFiles: -1 })).rejects.toMatchObject({ copyError: { type: 'invalid-payload', message: 'maxFiles must be a number of at least 0.' } });
    await expect(acceptFiles([], { maxDepth: Number.NaN })).rejects.toMatchObject({ copyError: { type: 'invalid-payload' } });
  });

  it('computes SHA-256 and rejects repeated content', async () => {
    const result = await acceptFiles([file('same', 'a.txt'), file('same', 'b.txt'), file('other', 'c.txt')], { digest: true });
    expect(summary(result).rejected).toEqual(['b.txt: duplicate']);
    expect(result.rejected[0]?.message).toBe('b.txt is the same file as a.txt.');
    expect(result.accepted[0]?.sha256).toBe('0967115f2813a3541eaef77de9d9d5773f1c0c04314b0bbfe4ff3b3b1c55b5d5');
  });

  it('says when digest has no Web Crypto', async () => {
    vi.stubGlobal('crypto', undefined);
    await expect(acceptFiles([], { digest: true })).rejects.toMatchObject({ copyError: { type: 'unsupported' } });
    vi.stubGlobal('crypto', {});
    await expect(acceptFiles([], { digest: true })).rejects.toMatchObject({ copyError: { type: 'unsupported' } });
  });

  it('reports files it cannot read', async () => {
    const broken = file('x', 'broken.txt');
    broken.slice = () => {
      throw new Error('gone');
    };
    const hashless = file('y', 'hashless.txt');
    hashless.arrayBuffer = () => Promise.reject(new Error('gone'));
    const result = await acceptFiles([broken, hashless], { digest: true });
    expect(summary(result).rejected).toEqual(['broken.txt: unreadable', 'hashless.txt: unreadable']);
    expect(result.rejected[0]?.message).toBe('broken.txt could not be read.');
  });

  it('stops when aborted, before or while reading', async () => {
    const aborted = new AbortController();
    aborted.abort(new Error('stop'));
    await expect(acceptFiles([pdf()], { signal: aborted.signal })).rejects.toMatchObject({ copyError: { type: 'aborted', cause: aborted.signal.reason } });

    const midway = new AbortController();
    const slow = pdf('slow.pdf');
    const slice = slow.slice.bind(slow);
    slow.slice = (start?: number, end?: number) => {
      midway.abort();
      return slice(start, end);
    };
    await expect(acceptFiles([slow, pdf()], { signal: midway.signal })).rejects.toMatchObject({ copyError: { type: 'aborted' } });

    const failing = new AbortController();
    const broken = pdf('broken.pdf');
    broken.slice = () => {
      failing.abort();
      throw new Error('gone');
    };
    await expect(acceptFiles([broken], { signal: failing.signal })).rejects.toMatchObject({ copyError: { type: 'aborted' } });

    const hashing = new AbortController();
    const hashed = pdf('hashed.pdf');
    hashed.arrayBuffer = () => {
      hashing.abort();
      return Promise.reject(new Error('stopped'));
    };
    await expect(acceptFiles([hashed], { digest: true, signal: hashing.signal })).rejects.toMatchObject({ copyError: { type: 'aborted' } });
  });

  it('takes a FileList-like list, an iterable, and Blobs without names', async () => {
    const list = { length: 1, 0: pdf(), item: () => null } as unknown as FileList;
    expect(summary(await acceptFiles(list)).accepted).toEqual(['report.pdf']);
    expect(summary(await acceptFiles(new Set([pdf('set.pdf')]))).accepted).toEqual(['set.pdf']);
    const blob = await acceptFiles([new Blob([SAMPLES['png'] as BlobPart])]);
    expect(blob.accepted[0]).toMatchObject({ name: 'file', path: 'file', type: 'image/png' });
  });

  it('uploads a typed Blob where there is no File', async () => {
    const original = File;
    const item = pdf();
    vi.stubGlobal('File', undefined);
    const { accepted } = await acceptFiles([new Blob([SAMPLES['png'] as BlobPart])]);
    expect(accepted[0]?.upload).not.toBeInstanceOf(original);
    expect(accepted[0]?.upload.type).toBe('image/png');
    expect(item).toBeInstanceOf(original);
  });

  it('dates the upload now when the source has no date', async () => {
    const blob = Object.assign(new Blob([SAMPLES['pdf'] as BlobPart]), { name: 'x.pdf' });
    const before = Date.now();
    const { accepted } = await acceptFiles([blob]);
    expect((accepted[0]?.upload as File).lastModified).toBeGreaterThanOrEqual(before);
  });
});

describe('acceptFiles with paste and drop events', () => {
  const tree = {
    'report.pdf': pdf(),
    photos: {
      'a.png': file(SAMPLES['png'] as Uint8Array, 'a.png'),
      y2024: { 'b.png': file(SAMPLES['png'] as Uint8Array, 'b.png'), deeper: { 'c.png': file(SAMPLES['png'] as Uint8Array, 'c.png') } },
      'run.exe': file(SAMPLES['exe'] as Uint8Array, 'run.exe'),
      'gone.txt': 'unreadable',
      locked: {},
      socket: 'odd',
      'notes.txt': file('n', 'notes.txt'),
    },
  } as const;

  it('walks dropped folders, depth-first, with safe paths', async () => {
    const result = await acceptFiles({ dataTransfer: transfer(tree) }, { maxDepth: 2 });
    expect(summary(result)).toEqual({
      accepted: ['report.pdf', 'photos/a.png', 'photos/y2024/b.png', 'photos/notes.txt'],
      rejected: ['photos/y2024/deeper: too-deep', 'photos/run.exe: blocked', 'photos/gone.txt: unreadable', 'photos/locked: unreadable'],
      truncated: false,
    });
    expect(result.rejected[0]).toMatchObject({ file: null, name: 'deeper', message: 'photos/y2024/deeper was not read: it is more than 2 folders deep.' });
    expect(result.rejected[2]).toMatchObject({ file: null, message: 'photos/gone.txt could not be read.' });
  });

  it('reads every level by default, and stops walking at maxFiles', async () => {
    expect(summary(await acceptFiles({ dataTransfer: transfer(tree) })).accepted).toContain('photos/y2024/deeper/c.png');
    const capped = await acceptFiles({ dataTransfer: transfer(tree) }, { maxFiles: 2 });
    expect(summary(capped)).toEqual({ accepted: ['report.pdf', 'photos/a.png'], rejected: ['photos/y2024/b.png: too-many'], truncated: true });
  });

  it('reads folders as empty files when folders are off, or entries are missing', async () => {
    const off = await acceptFiles({ dataTransfer: transfer({ 'report.pdf': pdf(), photos: { 'a.png': pdf('a.png') } }) }, { folders: false });
    expect(summary(off)).toEqual({ accepted: ['report.pdf'], rejected: [], truncated: false });
    const legacy = await acceptFiles(transfer({ 'report.pdf': pdf() }, { entries: false }));
    expect(summary(legacy).accepted).toEqual(['report.pdf']);
    const filesOnly = await acceptFiles(transfer({ 'report.pdf': pdf() }, { items: false }));
    expect(summary(filesOnly).accepted).toEqual(['report.pdf']);
  });

  it('takes paste events and React events, and empty ones', async () => {
    expect(summary(await acceptFiles({ clipboardData: transfer({ 'report.pdf': pdf() }) })).accepted).toEqual(['report.pdf']);
    expect(await acceptFiles({ clipboardData: null })).toEqual({ accepted: [], rejected: [], totalBytes: 0, truncated: false });
    expect(await acceptFiles({ dataTransfer: null })).toEqual({ accepted: [], rejected: [], totalBytes: 0, truncated: false });
    const nameless = { isFile: false, isDirectory: false, name: 'odd' };
    const odd = { files: [], items: [{ kind: 'file', getAsFile: () => null, webkitGetAsEntry: () => nameless }], types: [] } as unknown as DataTransfer;
    expect(await acceptFiles(odd)).toEqual({ accepted: [], rejected: [], totalBytes: 0, truncated: false });
  });

  it('takes dropped files as files, even where their entries cannot be read (WebKit, synthetic drops)', async () => {
    const report = pdf();
    const broken = { isFile: true, isDirectory: false, name: 'report.pdf', file: (_: unknown, failure: (error: unknown) => void) => { failure(new Error('no')); } };
    const data = { files: [report], items: [{ kind: 'file', getAsFile: () => report, webkitGetAsEntry: () => broken }], types: ['Files'] } as unknown as DataTransfer;
    expect(summary(await acceptFiles(data))).toEqual({ accepted: ['report.pdf'], rejected: [], truncated: false });
  });

  it('reads the DataTransfer at once, before awaiting anything', async () => {
    const data = transfer({ 'report.pdf': pdf() });
    const promise = acceptFiles(data);
    // The event ends: the browser empties its DataTransfer.
    (data as unknown as { items: unknown[] }).items = [];
    expect(summary(await promise).accepted).toEqual(['report.pdf']);
  });
});

describe('formatBytes', () => {
  it.each([
    [0, '0 bytes'],
    [1023, '1023 bytes'],
    [1024, '1 KB'],
    [1536, '1.5 KB'],
    [100 * 1024 * 1024, '100 MB'],
    [1024 ** 3, '1 GB'],
    [5 * 1024 ** 5, '5120 TB'],
  ])('%d is %s', (bytes, text) => {
    expect(formatBytes(bytes)).toBe(text);
  });
});
