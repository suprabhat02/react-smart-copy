import { copyFailure } from '../core/errors';
import { FILE_SNIFF_BYTES, FILE_TYPES, detect } from './detect';
import { ACTIVE_EXTENSIONS, EXECUTABLE_EXTENSIONS, MACRO_EXTENSIONS, extensionOf, hasDoubleExtension, hasHiddenCharacters, safeFileName, type SafeFileNameOptions } from './name';
import { FILE_RISKS, type DetectedType, type FileInspection, type FileRisk } from './types';

/** Content types that any text extension may hold (`.csv`, `.md`, `.log`, ...). */
const PLAIN_TEXT: ReadonlySet<string> = /* @__PURE__ */ new Set([FILE_TYPES.text.mime, FILE_TYPES.json.mime, FILE_TYPES.xml.mime]);

/** Extensions of text formats this module doesn't tell apart: any plain text content fits them. */
const TEXT_EXTENSIONS: ReadonlySet<string> = /* @__PURE__ */ new Set(
  (
    'txt text csv tsv md markdown mdx rst adoc org tex bib log ini cfg conf toml yaml yml env properties ics vcf vcard sql srt vtt sub ' +
    'css scss sass less js mjs cjs jsx ts tsx mts cts vue svelte astro py rb pl php go rs java kt kts c h cc cpp hpp cs swift m ' +
    'sh bash zsh bat cmd ps1 r lua dart scala clj ex exs erl hs ml fs diff patch gitignore editorconfig'
  ).split(' '),
);

/** MIME types of text formats known by their extension, for `accept` lists such as `text/csv`. */
export const TEXT_MIME_BY_EXTENSION: Readonly<Record<string, readonly string[]>> = {
  csv: ['text/csv'],
  tsv: ['text/tab-separated-values'],
  md: ['text/markdown'],
  markdown: ['text/markdown'],
  yaml: ['application/yaml', 'text/yaml'],
  yml: ['application/yaml', 'text/yaml'],
  ics: ['text/calendar'],
  vcf: ['text/vcard'],
  css: ['text/css'],
  js: ['text/javascript'],
  mjs: ['text/javascript'],
  vtt: ['text/vtt'],
  srt: ['application/x-subrip'],
  json: ['application/json'],
  xml: ['application/xml', 'text/xml'],
};

let byExtension: ReadonlyMap<string, readonly DetectedType[]> | null = null;

/** Every type saved with `extension`. Built on first use. */
function typesFor(extension: string): readonly DetectedType[] {
  if (byExtension === null) {
    const map = new Map<string, DetectedType[]>();
    for (const type of Object.values(FILE_TYPES)) {
      for (const ext of type.extensions) map.set(ext, [...(map.get(ext) ?? []), type]);
    }
    byExtension = map;
  }
  return byExtension.get(extension) ?? [];
}

/** Whether `extension` is saved for text: a known text format, or a type that is text inside. */
function isTextExtension(extension: string): boolean {
  return TEXT_EXTENSIONS.has(extension) || typesFor(extension).some((type) => type.parent === FILE_TYPES.text.mime || type === FILE_TYPES.text);
}

/**
 * Whether the content contradicts the extension. An unknown extension never does; a known one
 * does when the content is another type (a container and what it packages are the same family:
 * `.zip` and a Word document), or is not recognised at all.
 */
export function contradicts(extension: string | null, detected: DetectedType | null): boolean {
  if (extension === null) return false;
  const expected = typesFor(extension);
  const text = isTextExtension(extension);
  if (expected.length === 0 && !text) return false;
  if (detected === null) return true;
  // A container and what it packages are one family (`.zip` and a Word document); text is not a
  // container here: HTML and scripts are text, but a `.txt` holding one is not what it says.
  const related = (child: DetectedType, parent: DetectedType): boolean => child.parent === parent.mime && parent !== FILE_TYPES.text;
  if (expected.some((type) => type.mime === detected.mime || related(detected, type) || related(type, detected))) return false;
  return !(text && PLAIN_TEXT.has(detected.mime));
}

/** The type to store a file as: the detected one, made precise by the extension for plain text (`text/csv`). */
function typeOf(detected: DetectedType | null, extension: string | null, mismatch: boolean): string {
  if (detected === null) return 'application/octet-stream';
  const named = extension === null || mismatch ? undefined : TEXT_MIME_BY_EXTENSION[extension]?.[0];
  return named !== undefined && PLAIN_TEXT.has(detected.mime) ? named : detected.mime;
}

/** An inspection of `bytes`, the start of a file (all of it when `complete`). */
export function inspectBytes(bytes: Uint8Array, name: string, declaredType: string, size: number, complete: boolean, names: SafeFileNameOptions = {}): FileInspection {
  const extension = extensionOf(name);
  const detection = detect(bytes, complete);
  const detected = detection.type;
  // An empty file is reported as `empty`: it has no content to contradict its name.
  const mismatch = size > 0 && contradicts(extension, detected);
  const found = new Set<FileRisk>();
  if (detected?.family === 'executable' || (extension !== null && EXECUTABLE_EXTENSIONS.has(extension))) found.add('executable');
  if (detection.active || (extension !== null && ACTIVE_EXTENSIONS.has(extension))) found.add('active-content');
  if (detection.macros || (extension !== null && MACRO_EXTENSIONS.has(extension))) found.add('macros');
  if (mismatch) found.add('type-mismatch');
  if (hasDoubleExtension(name)) found.add('double-extension');
  if (hasHiddenCharacters(name)) found.add('hidden-characters');
  if (size === 0) found.add('empty');
  return {
    name,
    safeName: safeFileName(name, names),
    extension,
    size,
    declaredType,
    detected,
    type: typeOf(detected, extension, mismatch),
    mismatch,
    risks: FILE_RISKS.filter((risk) => found.has(risk)),
  };
}

export interface InspectFileOptions {
  /** The file's name. Default: `file.name`, for a `File`. */
  readonly name?: string;
  /** The type it claims. Default: `file.type`. Kept for reference only: never trusted. */
  readonly declaredType?: string;
  /** How {@link FileInspection.safeName} is made. */
  readonly names?: SafeFileNameOptions;
}

/** Reads the first `bytes` of `blob`. */
export async function readHead(blob: Blob, bytes: number): Promise<Uint8Array> {
  const candidate: unknown = blob; // Plain-JS callers can pass anything.
  if (typeof candidate !== 'object' || candidate === null || typeof (candidate as Partial<Blob>).slice !== 'function') {
    throw copyFailure('invalid-payload', 'Expected a Blob or File.');
  }
  return new Uint8Array(await blob.slice(0, bytes).arrayBuffer());
}

/**
 * What a file really is, and why it may be unsafe to accept: its type from its content (never
 * its name or claimed type), whether that contradicts its extension, and its risks.
 * Reads only the first {@link FILE_SNIFF_BYTES} bytes, so it is fast for any size. Server-safe.
 *
 * @throws {CopyFailure} `invalid-payload` when `file` is not a Blob.
 */
export async function inspectFile(file: Blob, options: InspectFileOptions = {}): Promise<FileInspection> {
  const head = await readHead(file, FILE_SNIFF_BYTES);
  const name = options.name ?? (file as Partial<File>).name ?? '';
  return inspectBytes(head, name, options.declaredType ?? file.type, file.size, file.size <= FILE_SNIFF_BYTES, options.names);
}
