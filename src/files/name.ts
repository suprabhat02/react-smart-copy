/** File names: making them safe to show and store, and what they say about the file. */

/**
 * Extensions the operating system runs, or mounts, when the file is opened: Windows, macOS
 * and Linux programs, scripts and installers, shortcuts, and disk images (which can carry
 * programs past download warnings).
 */
export const EXECUTABLE_EXTENSIONS: ReadonlySet<string> = /* @__PURE__ */ new Set(
  (
    'exe com scr pif bat cmd ps1 ps1xml ps2 psc1 psm1 psd1 vb vbs vbe js jse mjs cjs ws wsf wsc wsh hta msi msp mst msc ' +
    'dll ocx sys cpl drv efi lnk url scf inf reg appref-ms application gadget xbap jar war ear class apk aab xapk ipa ' +
    'app command tool sh bash zsh csh ksh fish run py pyc pyw pl rb php elf so dylib bundle deb rpm pkg mpkg dmg iso img vhd vhdx ' +
    'appx appxbundle msix msixbundle wasm settingcontent-ms library-ms search-ms chm hlp'
  ).split(' '),
);

/** Extensions of documents, images and media: the decoy in front of an executable one (`invoice.pdf.exe`). */
const DECOY_EXTENSIONS: ReadonlySet<string> = /* @__PURE__ */ new Set(
  (
    'pdf doc docx xls xlsx ppt pptx odt ods odp rtf txt csv md jpg jpeg png gif webp heic bmp tif tiff svg ' +
    'mp3 mp4 mov avi wav m4a zip rar 7z html htm eml msg'
  ).split(' '),
);

/** Extensions of Office files that can hold macros. */
export const MACRO_EXTENSIONS: ReadonlySet<string> = /* @__PURE__ */ new Set(['docm', 'dotm', 'xlsm', 'xltm', 'xlam', 'pptm', 'potm', 'ppsm', 'ppam', 'sldm']);

/** Extensions of active content: it runs script when a browser opens it from your origin. */
export const ACTIVE_EXTENSIONS: ReadonlySet<string> = /* @__PURE__ */ new Set(['html', 'htm', 'xhtml', 'xht', 'shtml', 'mht', 'mhtml', 'svg', 'svgz']);

/**
 * Bidirectional controls, invisible and control characters, and other characters that make
 * a name display as something else, or break where it is stored.
 */
const HIDDEN_SOURCE = String.raw`[\u0000-\u001f\u007f-\u009f\u00AD\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0\uFFF0-\uFFFB]|[\u{e0000}-\u{e0fff}]`;
// Variation selectors and other combining characters are matched one by one, on purpose.
// eslint-disable-next-line no-misleading-character-class
const HIDDEN = /* @__PURE__ */ new RegExp(HIDDEN_SOURCE, 'u');
// eslint-disable-next-line no-misleading-character-class
const HIDDEN_ALL = /* @__PURE__ */ new RegExp(HIDDEN_SOURCE, 'gu');

/** Whether `name` holds characters that hide or reorder what it shows. */
export function hasHiddenCharacters(name: string): boolean {
  return HIDDEN.test(name);
}

/** The last extension of `name`, lowercase, without the dot; `null` for none (`README`, `.env`). */
export function extensionOf(name: string): string | null {
  const base = name.slice(Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\')) + 1).replace(/[\s.]+$/u, '');
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return null;
  // Not empty: trailing dots and whitespace are already gone.
  return base.slice(dot + 1).trim().toLowerCase();
}

/**
 * A document or image extension followed by an executable one, as in `invoice.pdf.exe`, or
 * an executable extension pushed out of view by a run of spaces (`invoice.pdf      .exe`).
 */
export function hasDoubleExtension(name: string): boolean {
  const cleaned = name.replace(HIDDEN_ALL, '');
  const last = extensionOf(cleaned);
  if (last === null || !EXECUTABLE_EXTENSIONS.has(last)) return false;
  const rest = cleaned.slice(0, cleaned.toLowerCase().lastIndexOf(`.${last}`));
  if (/\s{3,}$/u.test(rest)) return true;
  const previous = extensionOf(rest);
  return previous !== null && DECOY_EXTENSIONS.has(previous);
}

const WINDOWS_RESERVED = /^(?:con|prn|aux|nul|com[0-9\u00B9\u00B2\u00B3]|lpt[0-9\u00B9\u00B2\u00B3]|conin\$|conout\$)$/i;
const encoder = /* @__PURE__ */ new TextEncoder();

/** Cuts `text` to at most `bytes` UTF-8 bytes, never inside a character. */
function cutToBytes(text: string, bytes: number): string {
  let out = '';
  let used = 0;
  for (const char of text) {
    const size = encoder.encode(char).length;
    if (used + size > bytes) break;
    out += char;
    used += size;
  }
  return out;
}

export interface SafeFileNameOptions {
  /** Longest name, in UTF-8 bytes (what file systems limit). Default 255. The extension is kept. */
  readonly maxBytes?: number;
  /** Put in place of characters that can't be in a file name. Default `_`. */
  readonly replacement?: string;
  /** The name to use when nothing usable is left. Default `file`. */
  readonly fallback?: string;
}

/** A replacement that can itself be in a file name (up to 4 characters), or `_`. */
const safeReplacement = (value: string): string => (/^[^<>:"/\\|?*\s.]{0,4}$/u.test(value) && !hasHiddenCharacters(value) ? value : '_');

/**
 * `name` made safe to show and to store on any operating system:
 *
 * - only the last path segment is kept, so `../../etc/passwd` becomes `passwd`;
 * - bidirectional controls, invisible and control characters are removed (tabs and line breaks become spaces);
 * - characters Windows, macOS or Linux reject (`<>:"/\|?*`) become `replacement`;
 * - runs of whitespace become one space, and leading dots and spaces and trailing dots and
 *   spaces are removed (no hidden files, nothing Windows would change);
 * - Windows device names (`CON`, `NUL`, `COM1`, ...) are prefixed with `replacement`;
 * - the result is at most `maxBytes` long in UTF-8, keeping the extension; Unicode is NFC.
 *
 * Never empty: `fallback` is used when nothing is left. Idempotent.
 */
export function safeFileName(name: string, options: SafeFileNameOptions = {}): string {
  const replacement = safeReplacement(options.replacement ?? '_');
  const fallback = options.fallback ?? 'file';
  const maxBytes = Math.max(16, Math.floor(options.maxBytes ?? 255));
  // Line breaks and tabs separate words: they become spaces, before other control characters go.
  // Composed (NFC) after the hidden characters go: removing one can bring a letter and its accent together.
  let safe = name.replace(/[\t\n\v\f\r]/gu, ' ').replace(HIDDEN_ALL, '').normalize('NFC');
  safe = safe.slice(Math.max(safe.lastIndexOf('/'), safe.lastIndexOf('\\')) + 1);
  safe = safe
    .replace(/[<>:"|?*]/gu, replacement)
    .replace(/\s+/gu, ' ')
    .replace(/^[\s.]+/u, '')
    .replace(/[\s.]+$/u, '');
  if (safe === '') return fallback;
  const dot = safe.indexOf('.');
  if (WINDOWS_RESERVED.test((dot === -1 ? safe : safe.slice(0, dot)).trim())) safe = `${replacement === '' ? '_' : replacement}${safe}`;
  if (encoder.encode(safe).length <= maxBytes) return safe;
  const extension = extensionOf(safe);
  // The extension is kept when it is short, leaving room for a name in front of it.
  const kept = extension === null ? '' : `.${extension}`;
  const suffix = kept !== '' && encoder.encode(kept).length <= Math.min(17, maxBytes - 4) ? kept : '';
  const budget = maxBytes - encoder.encode(suffix).length;
  // Never empty: the budget fits any character, and the first is not a dot or a space.
  const stem = cutToBytes(safe.slice(0, safe.length - suffix.length), budget).replace(/[\s.]+$/u, '');
  return `${stem}${suffix}`;
}
