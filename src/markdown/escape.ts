/**
 * CommonMark escaping. Pasted text must render as the same text, never as
 * Markdown syntax and never as raw HTML, so every character that can start a
 * construct is backslash-escaped. Backslash escapes are valid before any ASCII
 * punctuation, so over-escaping is always safe; under-escaping is not.
 */

/**
 * Characters that are special anywhere in a line: emphasis, code spans,
 * links, strikethrough (GFM) and `<`, which starts raw HTML and autolinks.
 */
const INLINE = /[\\`*_[\]<~]/g;

/** `&` that would start an entity or numeric character reference. */
const ENTITY = /&(?=#?[A-Za-z0-9]+;)/g;

/** Escapes text for use inside a line. With `pipes`, also `|`, for GFM table cells. */
export function escapeInline(text: string, pipes = false): string {
  const escaped = text.replace(INLINE, '\\$&').replace(ENTITY, '\\&');
  return pipes ? escaped.replace(/\|/g, '\\|') : escaped;
}

const ORDERED_MARKER = /^(\d{1,9})([.)])/;
const BLOCK_START = /^[#>+=|-]/;

/**
 * Escapes the start of already inline-escaped text that begins a line, where
 * `#`, `>`, `-`, `+`, `=`, `|` and `1.` / `1)` would start a block.
 */
export function escapeLineStart(text: string): string {
  const ordered = ORDERED_MARKER.exec(text);
  if (ordered) return `${ordered[1] as string}\\${text.slice((ordered[1] as string).length)}`;
  return BLOCK_START.test(text) ? `\\${text}` : text;
}

/**
 * Escapes plain text so Markdown renders it literally: no emphasis, links,
 * headings, lists, code or raw HTML. Line breaks are kept; leading whitespace
 * on each line is removed, since Markdown would read four spaces as code.
 *
 * @example
 * escapeMarkdown('1. *Not* a list <b>') // '1\\. \\*Not\\* a list \\<b>'
 */
export function escapeMarkdown(text: string): string {
  return text
    .split(/\r\n|\r|\n/)
    .map((line) => escapeLineStart(escapeInline(line.replace(/^[ \t]+/, ''))))
    .join('\n');
}
