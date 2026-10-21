/** What a file is for, by its content. */
export type FileFamily = 'image' | 'audio' | 'video' | 'document' | 'archive' | 'text' | 'font' | 'executable' | 'data';

/** A file type recognised from the file's bytes, never from its name or its claimed MIME type. */
export interface DetectedType {
  /** The MIME type to store and serve it as, e.g. `application/pdf`. */
  readonly mime: string;
  readonly family: FileFamily;
  /** Extensions this type is saved with, lowercase and without the dot; the first is the usual one. */
  readonly extensions: readonly string[];
  /**
   * The container it is a kind of: `application/zip` for a Word document, `text/plain` for
   * JSON. A file named for the container is not a mismatch (`.zip` holding a `.docx`).
   */
  readonly parent: string | null;
}

/**
 * Why a file may be unsafe to accept. Each is reported by {@link inspectFile}; the ones in
 * `block` (all of them by default) make {@link acceptFiles} reject the file.
 *
 * - `executable`: a program or script, by content (`MZ`, ELF, Mach-O, `#!`, a shortcut) or
 *   by a name the operating system runs (`.exe`, `.bat`, `.ps1`, `.js`, `.jar`, `.iso`, ...).
 * - `active-content`: runs script when opened in a browser from your origin: HTML, SVG, XHTML.
 * - `macros`: an Office file that can hold macros (`.docm`, `.xlsm`, or a `vbaProject.bin`).
 * - `type-mismatch`: the content is not what the extension says (`report.pdf` holding HTML).
 * - `double-extension`: a document or image extension hiding an executable one (`invoice.pdf.exe`).
 * - `hidden-characters`: the name holds bidirectional controls, invisible or control characters,
 *   which can make `invoice\u202Egpj.exe` display as `invoiceexe.jpg`.
 * - `empty`: the file has no bytes (a folder dragged where folders are not read, or a failed save).
 */
export type FileRisk = 'executable' | 'active-content' | 'macros' | 'type-mismatch' | 'double-extension' | 'hidden-characters' | 'empty';

/** Every risk, in a stable order. */
export const FILE_RISKS: readonly FileRisk[] = Object.freeze(['executable', 'active-content', 'macros', 'type-mismatch', 'double-extension', 'hidden-characters', 'empty']);

export interface FileInspection {
  /** The name as given, which may be unsafe to display or store. */
  readonly name: string;
  /** The name made safe to show and store: see {@link safeFileName}. */
  readonly safeName: string;
  /** The last extension, lowercase and without the dot; `null` when there is none. */
  readonly extension: string | null;
  readonly size: number;
  /** The MIME type the browser or caller claimed. Never trusted: kept for reference. */
  readonly declaredType: string;
  /** What the bytes are, or `null` when they are not a type this module recognises. */
  readonly detected: DetectedType | null;
  /**
   * The type to store and serve the file as: the detected one, or `application/octet-stream`
   * when the content is not recognised (never the claimed type).
   */
  readonly type: string;
  /** Whether the content contradicts the extension. Also listed in `risks`. */
  readonly mismatch: boolean;
  /** In the order of {@link FILE_RISKS}. */
  readonly risks: readonly FileRisk[];
}
