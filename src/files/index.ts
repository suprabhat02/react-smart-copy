/**
 * `react-smart-copy/files`
 *
 * Take files people paste or drop (folders included) safely: know what each file really is,
 * whatever its name says, and turn away the ones that could harm your users or your servers.
 * Framework-agnostic and free of dependencies: use it in `onPaste` and `onDrop`, with a file
 * input, or on a server.
 *
 * - {@link acceptFiles}: reads a paste, a drop (walking folders), a `FileList` or a list of
 *   files, and accepts or rejects each: by content type and `accept`, risks, size, count and
 *   depth limits, and optional SHA-256 duplicates. Every rejection has a reason and a message.
 * - {@link inspectFile}: one file's type from its content, whether that contradicts its
 *   extension, and its risks (programs, active content, macros, double extensions, hidden characters).
 * - {@link safeFileName}: a name safe to show and store on any operating system.
 * - {@link detectFileType} and {@link matchesAccept}: the building blocks.
 *
 * @module
 */

export { matchesAccept, parseAccept } from './accept';
export {
  acceptFiles,
  DEFAULT_MAX_FILE_BYTES,
  DEFAULT_MAX_FILES,
  DEFAULT_MAX_FOLDER_DEPTH,
  DEFAULT_MAX_TOTAL_BYTES,
  formatBytes,
  type AcceptedFile,
  type AcceptFilesOptions,
  type AcceptFilesResult,
  type FileRejectReason,
  type FileSource,
  type RejectedFile,
} from './collect';
export { detectFileType, FILE_SNIFF_BYTES, FILE_TYPES } from './detect';
export { inspectFile, type InspectFileOptions } from './inspect';
export { EXECUTABLE_EXTENSIONS, extensionOf, safeFileName, type SafeFileNameOptions } from './name';
export { FILE_RISKS, type DetectedType, type FileFamily, type FileInspection, type FileRisk } from './types';
