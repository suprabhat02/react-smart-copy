/**
 * CommonMark escaping. Pasted text must render as the same text, never as
 * Markdown syntax and never as raw HTML, so every character that can start a
 * construct is backslash-escaped. Backslash escapes are valid before any ASCII
 * punctuation, so over-escaping is safe in CommonMark, with one exception GitHub
 * adds: a bare URL is linked with its backslashes kept, so a URL is written as an
 * autolink (`<https://…>`) instead, which every renderer shows exactly.
 */

/**
 * Characters that are special anywhere in a line: emphasis, code spans,
 * links, strikethrough (GFM) and `<`, which starts raw HTML and autolinks.
 */
const INLINE = /[\\`*_[\]<~]/g;

/** `&` that would start an entity or numeric character reference. */
const ENTITY = /&(?=#?[A-Za-z0-9]+;)/g;

/** A letter or digit: an `_` between two of them never starts or ends emphasis. */
const WORD = /[\p{L}\p{N}]/u;

/**
 * A bare `http(s)` URL where GitHub would link it: at the start or after anything but a
 * letter. No lookbehind: older Safari cannot parse one.
 */
const URL_AT = /(^|[^A-Za-z])(https?:\/\/[^\s<>|`\\]+)/g;

/** What GitHub leaves out of a URL's end: trailing punctuation, and an unbalanced `)`. */
function trimUrl(url: string): string {
  let end = url.length;
  for (;;) {
    const last = url.charAt(end - 1);
    const head = url.slice(0, end);
    if (last !== '' && '?!.,:;*_~\'"'.includes(last)) end -= 1;
    else if (last === ')' && head.split(')').length > head.split('(').length) end -= 1;
    else return head;
  }
}

/**
 * GitHub links `http://` after any non-letter, and `www.` after a space or `*_~(`, keeping any
 * backslash escapes inside the link. Where this module does not write an autolink, it breaks
 * the pattern instead: `http\://` and `www\.` render as `http://` and `www.` everywhere, and
 * GitHub leaves them as text.
 */
const BARE_PROTOCOL = /(^|[^A-Za-z])(https?)(:\/\/)/gi;
const BARE_WWW = /(^|[\s*_~(])(www)\.(?=\S*\\)/gi;

function isPlainUrl(url: string): boolean {
  if (!/^https?:\/\/[\x21-\x7e]+$/.test(url)) return false;
  try {
    return new URL(url).hostname !== '';
  } catch {
    return false;
  }
}

function escapeText(text: string): string {
  return text
    .replace(INLINE, (char, offset: number) => (char === '_' && WORD.test(text.charAt(offset - 1)) && WORD.test(text.charAt(offset + 1)) ? char : `\\${char}`))
    .replace(ENTITY, '\\&')
    .replace(BARE_PROTOCOL, '$1$2\\$3')
    .replace(BARE_WWW, '$1$2\\.');
}

/**
 * Escapes text for use inside a line. With `pipes`, also `|`, for GFM table cells. With
 * `autolink` (the default), bare URLs become autolinks; pass `false` inside a link's text,
 * where a second link is not allowed, and inside image descriptions.
 */
export function escapeInline(text: string, pipes = false, autolink = true): string {
  let escaped = '';
  let from = 0;
  for (const match of autolink ? text.matchAll(URL_AT) : []) {
    const url = trimUrl(match[2] as string);
    // Only an address every renderer links the same way: ASCII, and one a browser accepts.
    // Anything else (a bare `https://`, `http://x]`, a non-ASCII host) stays as text.
    if (!isPlainUrl(url)) continue;
    const start = match.index + (match[1] as string).length;
    escaped += `${escapeText(text.slice(from, start))}<${url}>`;
    from = start + url.length;
  }
  escaped += escapeText(text.slice(from));
  return pipes ? escaped.replace(/\|/g, '\\|') : escaped;
}

// Only what CommonMark would read as a block: a list marker or heading needs a space (or the
// end of the line) after it, and `=` / `-` underline a heading only as a whole line. So `0.75`,
// `#hashtag` and `-5 °C` stay as written.
const ORDERED_MARKER = /^(\d{1,9})([.)])(?=[ \t]|$)/;
const BLOCK_START = /^(?:#{1,6}(?:[ \t]|$)|[>|]|[-+](?:[ \t]|$)|=+[ \t]*$|-+[ \t]*$|(?=[-:| \t]*-)[-:| \t]+$)/;

/**
 * Escapes the start of already inline-escaped text that begins a line, where it would start
 * a block: a heading (`# `), a quote (`>`), a list (`- `, `+ `, `1. `, `1) `), a table (`|`,
 * or a delimiter row such as `:-` that GitHub reads as one), or a heading underline (`===`, `---`).
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
