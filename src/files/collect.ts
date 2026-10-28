import { copyFailure } from '../core/errors';
import { matchesAccept } from './accept';
import { FILE_SNIFF_BYTES } from './detect';
import { inspectBytes, readHead } from './inspect';
import { safeFileName, type SafeFileNameOptions } from './name';
import { FILE_RISKS, type FileInspection, type FileRisk } from './types';

export const DEFAULT_MAX_FILES = 100;
export const DEFAULT_MAX_FILE_BYTES: number = 100 * 1024 * 1024;
export const DEFAULT_MAX_TOTAL_BYTES: number = 1024 * 1024 * 1024;
export const DEFAULT_MAX_FOLDER_DEPTH = 8;

/**
 * Where files come from: a paste or drop event (DOM or React), its `DataTransfer`, a
 * `FileList` (`<input type="file">`), or any list of Files and Blobs.
 */
export type FileSource =
  | DataTransfer
  | { readonly clipboardData: DataTransfer | null }
  | { readonly dataTransfer: DataTransfer | null }
  | Iterable<Blob>
  | ArrayLike<Blob>;

/** Why {@link acceptFiles} turned a file (or a folder) away. */
export type FileRejectReason =
  /** It has a risk listed in `block`; `risks` says which. */
  | 'blocked'
  /** It does not fit `accept`. */
  | 'not-accepted'
  /** Larger than `maxFileBytes`. */
  | 'too-large'
  /** Accepting it would take the accepted files over `maxTotalBytes`. */
  | 'total-too-large'
  /** More than `maxFiles` files: this one and any after it were left out (`truncated`). */
  | 'too-many'
  /** A folder deeper than `maxDepth`: its contents were not read. `file` is `null`. */
  | 'too-deep'
  /** It (or, with `file: null`, a folder) could not be read: deleted, moved or blocked by the system. */
  | 'unreadable'
  /** The same bytes as a file accepted before it (only checked with `digest: true`). */
  | 'duplicate';

export interface AcceptedFile {
  /** The file as it came. Its `name` and `type` are not safe to use: see `upload`. */
  readonly file: Blob;
  /**
   * The file to upload or store: the same bytes, named `name`, typed as `type` (a `File`, where
   * the platform has one). Its type is the detected one, never the claimed one.
   */
  readonly upload: Blob;
  /** The safe name. */
  readonly name: string;
  /** Where it was in the dropped folders, as safe names joined with `/` (`photos/2024/a.jpg`); just `name` for a loose file. */
  readonly path: string;
  readonly size: number;
  /** The detected type, or `application/octet-stream`. */
  readonly type: string;
  readonly inspection: FileInspection;
  /** Lowercase hex SHA-256 of the content, with `digest: true`; otherwise `null`. */
  readonly sha256: string | null;
}

export interface RejectedFile {
  /** The file; `null` for a folder (`too-deep`, `unreadable`) or a dropped file the system would not give (`unreadable`). */
  readonly file: Blob | null;
  /** Safe name of the file or folder. */
  readonly name: string;
  /** Safe path, as in {@link AcceptedFile.path}. */
  readonly path: string;
  readonly reason: FileRejectReason;
  /** The file's risks, when it was inspected (all of them, not only the blocked ones). */
  readonly risks: readonly FileRisk[];
  /** A sentence for people, naming the file by its safe name. */
  readonly message: string;
}

export interface AcceptFilesResult {
  /** In the order they were found: the order of the drop, folders depth-first. */
  readonly accepted: readonly AcceptedFile[];
  readonly rejected: readonly RejectedFile[];
  /** Total size of `accepted`, in bytes. */
  readonly totalBytes: number;
  /** More files were dropped than `maxFiles`: folders were not read to the end. */
  readonly truncated: boolean;
}

export interface AcceptFilesOptions {
  /** Types to accept, as in `<input accept>`: `".pdf,image/*"` or `['.csv', 'text/plain']`. Judged by content. Default: any. */
  readonly accept?: string | readonly string[];
  /** Risks that reject a file. Default: every one of {@link FILE_RISKS}. `[]` accepts risky files (their `inspection.risks` still say). */
  readonly block?: readonly FileRisk[];
  /** Most files to accept. Default 100. */
  readonly maxFiles?: number;
  /** Largest single file, in bytes. Default 100 MiB. */
  readonly maxFileBytes?: number;
  /** Largest total of the accepted files, in bytes. Default 1 GiB. */
  readonly maxTotalBytes?: number;
  /** Read dropped folders (and the folders in them). Default `true`. With `false`, a folder is an `empty` file. */
  readonly folders?: boolean;
  /** Deepest folder level read: 1 reads only the dropped folder's own files. Default 8. */
  readonly maxDepth?: number;
  /** Compute each file's SHA-256 (reading it whole) and reject repeated content as `duplicate`. Default `false`. */
  readonly digest?: boolean;
  /** How names are made safe. */
  readonly names?: SafeFileNameOptions;
  /** Stops reading; the promise then rejects with an `aborted` CopyFailure. */
  readonly signal?: AbortSignal;
}

/* ----------------------------------------------------------------- Folders */

/** The parts of the File and Directory Entries API this module uses (`webkitGetAsEntry`). */
interface Entry {
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  readonly name: string;
}
interface FileEntry extends Entry {
  file(success: (file: File) => void, failure?: (error: unknown) => void): void;
}
interface DirectoryEntry extends Entry {
  createReader(): { readEntries(success: (entries: Entry[]) => void, failure?: (error: unknown) => void): void };
}

/** A dropped item: a folder entry to walk, or a file. */
type Root = { readonly entry: Entry } | { readonly file: Blob };

function readEntries(directory: DirectoryEntry): AsyncGenerator<Entry, void, undefined> {
  const reader = directory.createReader();
  return (async function* batches() {
    // Each call returns the next batch (100 in Chromium); an empty batch is the end.
    for (;;) {
      const batch = await new Promise<Entry[]>((resolve, reject) => {
        reader.readEntries(resolve, reject);
      });
      if (batch.length === 0) return;
      yield* batch;
    }
  })();
}

const entryFile = (entry: FileEntry): Promise<File> =>
  new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });

function isDataTransfer(value: FileSource): value is DataTransfer {
  return 'files' in value && 'types' in value;
}

/**
 * The dropped items, read at once: a `DataTransfer` is emptied when its event ends, so this
 * runs before anything is awaited. Dropped files are taken as files (`getAsFile`), which every
 * engine gives; entries are used only to walk folders.
 */
function roots(source: FileSource, folders: boolean): Root[] {
  const candidate = source as Partial<{ clipboardData: DataTransfer | null; dataTransfer: DataTransfer | null }>;
  const transfer = isDataTransfer(source) ? source : (candidate.dataTransfer ?? candidate.clipboardData);
  if (transfer === undefined) {
    const list = source as Iterable<Blob> | ArrayLike<Blob>;
    return Array.from(Symbol.iterator in Object(list) ? (list as Iterable<Blob>) : (list as ArrayLike<Blob>), (file) => ({ file }));
  }
  if (transfer === null) return [];
  const found: Root[] = [];
  // Old browsers have no `items`: their `files` are all there is.
  for (const item of Array.from((transfer.items as DataTransferItemList | undefined) ?? [])) {
    if (item.kind !== 'file') continue;
    // `webkitGetAsEntry` is in every current browser; older ones and tests may lack it.
    const getEntry = (item as { webkitGetAsEntry?: () => unknown }).webkitGetAsEntry;
    const entry = folders && getEntry ? (getEntry.call(item) as Entry | null) : null;
    if (entry?.isDirectory) {
      found.push({ entry });
      continue;
    }
    const file = item.getAsFile();
    if (file) found.push({ file });
  }
  return found.length > 0 ? found : Array.from(transfer.files, (file) => ({ file }));
}

/** A file found in the drop, with its safe path; or a folder or file entry that could not be read. */
type Found =
  | { readonly kind: 'file'; readonly file: Blob; readonly path: string; readonly name: string }
  | { readonly kind: 'skipped'; readonly reason: 'too-deep' | 'unreadable'; readonly path: string; readonly name: string };

async function* walk(
  roots: readonly Root[],
  maxDepth: number,
  names: SafeFileNameOptions,
): AsyncGenerator<Found, void, undefined> {
  const safe = (name: string, fallback: string): string => safeFileName(name, { ...names, fallback });
  async function* visit(entry: Entry, parent: string, depth: number): AsyncGenerator<Found, void, undefined> {
    const name = safe(entry.name, entry.isDirectory ? 'folder' : 'file');
    const path = parent === '' ? name : `${parent}/${name}`;
    if (entry.isFile) {
      try {
        yield { kind: 'file', file: await entryFile(entry as FileEntry), path, name };
      } catch {
        yield { kind: 'skipped', reason: 'unreadable', path, name };
      }
      return;
    }
    if (!entry.isDirectory) return;
    if (depth >= maxDepth) {
      yield { kind: 'skipped', reason: 'too-deep', path, name };
      return;
    }
    try {
      for await (const child of readEntries(entry as DirectoryEntry)) yield* visit(child, path, depth + 1);
    } catch {
      yield { kind: 'skipped', reason: 'unreadable', path, name };
    }
  }
  for (const root of roots) {
    if ('entry' in root) {
      yield* visit(root.entry, '', 0);
    } else {
      const name = safe((root.file as Partial<File>).name ?? '', 'file');
      yield { kind: 'file', file: root.file, path: name, name };
    }
  }
}

/* ---------------------------------------------------------------- Messages */

const UNITS = ['bytes', 'KB', 'MB', 'GB', 'TB'] as const;

/** `1048576` as `1 MB`. */
export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${String(unit === 0 ? value : Math.round(value * 10) / 10)} ${UNITS[unit] as string}`;
}

const RISK_MESSAGES: Readonly<Record<FileRisk, (name: string) => string>> = {
  executable: (name) => `${name} is a program or script, which can't be added.`,
  'active-content': (name) => `${name} is a web page or SVG that can run scripts, so it can't be added.`,
  macros: (name) => `${name} can contain macros, so it can't be added.`,
  'type-mismatch': (name) => `${name} is not the type of file its name says.`,
  'double-extension': (name) => `${name} hides its real type behind a second extension.`,
  'hidden-characters': (name) => `${name} has hidden characters in its name.`,
  empty: (name) => `${name} is empty.`,
};

/* ------------------------------------------------------------------ Accept */

async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function positive(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (!(value >= 0)) throw copyFailure('invalid-payload', `${name} must be a number of at least 0.`);
  return value;
}

/**
 * Takes the files from a paste, a drop (folders included), a file input or a list, and
 * decides for each whether it is safe and wanted: its type is read from its content, its
 * name made safe, and the limits applied. Nothing is uploaded or read whole (except with
 * `digest`): only each file's first 8 KiB.
 *
 * Call it from the event handler, before anything is awaited: a `DataTransfer` is emptied
 * when its event ends. Folders are read through `webkitGetAsEntry` (every current browser).
 *
 * ```ts
 * onDrop={(event) => {
 *   event.preventDefault();
 *   void acceptFiles(event, { accept: '.pdf,image/*', maxFileBytes: 20e6 }).then(({ accepted, rejected }) => { ... });
 * }}
 * ```
 *
 * @throws {CopyFailure} `aborted` when `signal` aborts; `unsupported` for `digest` without Web Crypto;
 * `invalid-payload` for a negative limit.
 */
export async function acceptFiles(source: FileSource, options: AcceptFilesOptions = {}): Promise<AcceptFilesResult> {
  const found = roots(source, options.folders ?? true);
  const maxFiles = positive(options.maxFiles, DEFAULT_MAX_FILES, 'maxFiles');
  const maxFileBytes = positive(options.maxFileBytes, DEFAULT_MAX_FILE_BYTES, 'maxFileBytes');
  const maxTotalBytes = positive(options.maxTotalBytes, DEFAULT_MAX_TOTAL_BYTES, 'maxTotalBytes');
  const maxDepth = positive(options.maxDepth, DEFAULT_MAX_FOLDER_DEPTH, 'maxDepth');
  const block = new Set(options.block ?? FILE_RISKS);
  const digest = options.digest === true;
  if (digest && (typeof crypto === 'undefined' || typeof crypto.subtle === 'undefined')) {
    throw copyFailure('unsupported', 'digest needs Web Crypto (crypto.subtle): a secure page, or Node.js 20+ (on 18, set globalThis.crypto to webcrypto from node:crypto).');
  }
  const signal = options.signal;
  const checkAborted = (): void => {
    if (signal?.aborted) throw copyFailure('aborted', 'Adding files was aborted.', signal.reason);
  };
  checkAborted();

  const accepted: AcceptedFile[] = [];
  const rejected: RejectedFile[] = [];
  const seen = new Map<string, string>();
  let totalBytes = 0;
  let count = 0;
  let truncated = false;
  const reject = (file: Blob | null, name: string, path: string, reason: FileRejectReason, message: string, risks: readonly FileRisk[] = []): void => {
    rejected.push({ file, name, path, reason, risks, message });
  };

  for await (const item of walk(found, maxDepth, options.names ?? {})) {
    checkAborted();
    if (item.kind === 'skipped') {
      reject(
        null,
        item.name,
        item.path,
        item.reason,
        item.reason === 'too-deep' ? `${item.path} was not read: it is more than ${String(maxDepth)} folders deep.` : `${item.path} could not be read.`,
      );
      continue;
    }
    const { file, name, path } = item;
    count += 1;
    if (count > maxFiles) {
      truncated = true;
      reject(file, name, path, 'too-many', `${name} and any files after it were not added: at most ${String(maxFiles)} files can be added at once.`);
      break;
    }
    if (file.size > maxFileBytes) {
      reject(file, name, path, 'too-large', `${name} is larger than ${formatBytes(maxFileBytes)}.`);
      continue;
    }
    let inspection: FileInspection;
    try {
      const head = await readHead(file, FILE_SNIFF_BYTES);
      inspection = inspectBytes(head, (file as Partial<File>).name ?? '', file.type, file.size, file.size <= FILE_SNIFF_BYTES, options.names);
    } catch {
      checkAborted();
      reject(file, name, path, 'unreadable', `${name} could not be read.`);
      continue;
    }
    checkAborted();
    const blocked = inspection.risks.find((risk) => block.has(risk));
    if (blocked !== undefined) {
      reject(file, name, path, 'blocked', RISK_MESSAGES[blocked](name), inspection.risks);
      continue;
    }
    if (options.accept !== undefined && !matchesAccept(inspection, options.accept)) {
      reject(file, name, path, 'not-accepted', `${name} is not a type of file that can be added here.`, inspection.risks);
      continue;
    }
    if (totalBytes + file.size > maxTotalBytes) {
      reject(file, name, path, 'total-too-large', `${name} was not added: the files together would be larger than ${formatBytes(maxTotalBytes)}.`, inspection.risks);
      continue;
    }
    let hash: string | null = null;
    if (digest) {
      try {
        hash = await sha256(file);
      } catch {
        checkAborted();
        reject(file, name, path, 'unreadable', `${name} could not be read.`, inspection.risks);
        continue;
      }
      checkAborted();
      const original = seen.get(hash);
      if (original !== undefined) {
        reject(file, name, path, 'duplicate', `${name} is the same file as ${original}.`, inspection.risks);
        continue;
      }
      seen.set(hash, path);
    }
    totalBytes += file.size;
    accepted.push({
      file,
      upload:
        typeof File === 'function'
          ? new File([file], name, { type: inspection.type, lastModified: (file as Partial<File>).lastModified ?? Date.now() })
          : new Blob([file], { type: inspection.type }),
      name,
      path,
      size: file.size,
      type: inspection.type,
      inspection,
      sha256: hash,
    });
  }
  return { accepted, rejected, totalBytes, truncated };
}
