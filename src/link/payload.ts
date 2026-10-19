import { copyFailure } from '../core/errors';
import type { HtmlPayload, MultiPayload } from '../core/payload';
import { resolveLinkUrl, type LinkUrlOptions } from './url';

/** A link with an optional title. */
export interface Link {
  readonly url: string | URL;
  /** What the link says when pasted into a document or chat. Default: the URL. */
  readonly title?: string;
}

/** A link: a URL, a `{ url, title }` object, or an `<a>` element (its `href` and text). */
export type LinkSource = string | URL | Link | HTMLAnchorElement;

/** A validated link: an absolute, safe URL and a clean title. */
export interface ResolvedLink {
  readonly url: string;
  /** Never empty: the URL when there is no title. */
  readonly title: string;
  /** Whether `title` came from the input (`false`: it is the URL). */
  readonly titled: boolean;
}

/**
 * What the plain-text flavour holds (editors, terminals and address bars paste it):
 * `'url'` (the default), `'title'`, `'title-and-url'` (the title, then the URL on
 * the next line) or `'markdown'` (`[Title](URL)`).
 */
export type LinkTextFormat = 'url' | 'title' | 'title-and-url' | 'markdown';

export interface LinkPayloadOptions extends LinkUrlOptions {
  /** Default `'url'`. */
  readonly text?: LinkTextFormat;
  /** Longest title kept, in characters; longer ones end in an ellipsis. Default {@link DEFAULT_LINK_TITLE_LENGTH}. */
  readonly maxTitleLength?: number;
}

export interface LinkDragPayloadOptions extends LinkPayloadOptions {
  /**
   * `'drag'`: a multi-format payload that also carries `text/uri-list` and
   * Firefox's `text/x-moz-url`, for `useDragCopy` and `useCopyInterceptor` (a link
   * dropped on the tab bar opens). Clipboard writes skip those two where the
   * browser can't write them.
   */
  readonly target: 'drag';
}

export const DEFAULT_LINK_TITLE_LENGTH = 300;

const invalid = (message: string) => copyFailure('invalid-payload', message);

/**
 * Characters a title never keeps: controls, bidi overrides and isolates (which can
 * make a title read differently), and zero-width characters.
 */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const HIDDEN = /[\0-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

/** A title as one clean line: hidden characters removed, whitespace collapsed, length capped. */
export function cleanTitle(title: string, maxLength: number): string {
  const clean = title.replace(HIDDEN, '').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  // Cut on a code point boundary and mark the cut.
  return `${Array.from(clean).slice(0, maxLength - 1).join('').trimEnd()}\u2026`;
}

function maxTitle(value: number | undefined): number {
  if (value === undefined) return DEFAULT_LINK_TITLE_LENGTH;
  if (Number.isInteger(value) && value >= 1) return value;
  throw invalid(`\`maxTitleLength\` must be a positive integer (received ${String(value)}).`);
}

function isAnchor(source: unknown): source is HTMLAnchorElement {
  return typeof source === 'object' && source !== null && (source as { nodeName?: unknown }).nodeName === 'A' && typeof (source as { href?: unknown }).href === 'string';
}

/**
 * Validates a link and its title: see {@link resolveLinkUrl} for the URL rules.
 * An `<a>` element gives its `href` and its text (or `title` attribute).
 */
export function resolveLink(source: LinkSource, options: LinkPayloadOptions = {}): ResolvedLink {
  let url: string | URL;
  let title: unknown;
  if (typeof source === 'string' || source instanceof URL) {
    url = source;
  } else if (isAnchor(source)) {
    url = source.getAttribute('href') ?? '';
    title = source.textContent.trim() !== '' ? source.textContent : (source.getAttribute('title') ?? undefined);
    if (url !== '' && options.base === undefined) url = source.href; // Resolved against the anchor's own document.
  } else if (typeof (source as unknown) === 'object' && (source as unknown) !== null && 'url' in source) {
    url = source.url;
    title = source.title;
  } else {
    throw invalid('A link must be a URL, a { url, title } object or an <a> element.');
  }
  if (title !== undefined && typeof title !== 'string') throw invalid('A link title must be a string.');
  const href = resolveLinkUrl(url, options);
  const clean = title === undefined ? '' : cleanTitle(title, maxTitle(options.maxTitleLength));
  return { url: href, title: clean === '' ? href : clean, titled: clean !== '' };
}

export const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** `[title](url)`, safe in every CommonMark renderer: brackets and backslashes escaped, parentheses and spaces encoded. */
export function markdownLink(link: ResolvedLink): string {
  const label = link.title.replace(/[\\[\]]/g, '\\$&');
  const target = link.url.replace(/[()<> ]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `[${label}](${target})`;
}

function plainText(link: ResolvedLink, format: LinkTextFormat): string {
  switch (format) {
    case 'url':
      return link.url;
    case 'title':
      return link.title;
    case 'title-and-url':
      return link.titled ? `${link.title}\n${link.url}` : link.url;
    case 'markdown':
      return markdownLink(link);
    default:
      throw invalid(`\`text\` must be "url", "title", "title-and-url" or "markdown" (received ${JSON.stringify(format)}).`);
  }
}

/**
 * A copy payload for a link: an HTML anchor, so Slack, Google Docs, Notion,
 * Teams, Word and mail paste a titled link, and plain text (the URL by default)
 * for editors and address bars. The URL is validated (allowed schemes only,
 * credentials removed, optionally cleaned of tracking) and the title is cleaned
 * of hidden characters; both are escaped.
 *
 * @example
 * copy(() => linkPayload({ url: location.href, title: document.title }, { clean: true }));
 * useDragCopy({ payload: () => linkPayload(anchor, { target: 'drag' }) });
 */
export function linkPayload(source: LinkSource, options: LinkDragPayloadOptions): MultiPayload;
export function linkPayload(source: LinkSource, options?: LinkPayloadOptions): HtmlPayload;
export function linkPayload(source: LinkSource, options: LinkPayloadOptions & { readonly target?: 'drag' | 'clipboard' } = {}): HtmlPayload | MultiPayload {
  const target: unknown = options.target ?? 'clipboard'; // Plain-JS callers can pass anything.
  if (target !== 'drag' && target !== 'clipboard') throw invalid('`target` must be "clipboard" or "drag".');
  const link = resolveLink(source, options);
  const text = plainText(link, options.text ?? 'url');
  const html = `<a href="${escapeHtml(link.url)}">${escapeHtml(link.title)}</a>`;
  if (target === 'clipboard') return { kind: 'html', html, text };
  return {
    kind: 'multi',
    items: [
      { mimeType: 'text/plain', data: text },
      { mimeType: 'text/html', data: html },
      { mimeType: 'text/uri-list', data: link.url, optional: true },
      // Firefox's titled-link format: the URL, a line break, the title.
      { mimeType: 'text/x-moz-url', data: `${link.url}\n${link.title}`, optional: true },
    ],
  };
}
