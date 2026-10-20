import { copyFailure } from '../core/errors';
import { asTextField, insertText } from '../core/text-field';
import { cleanTitle, DEFAULT_LINK_TITLE_LENGTH, markdownLink, type ResolvedLink } from './payload';
import { textFragmentUrl, type TextFragmentOptions } from './fragment';
import { linkUrlResolver, type LinkUrlOptions } from './url';
import { parseInertHtml } from '../core/inert-html';

/** What was pasted or dropped: a `PasteResult` from `usePaste`, a `DataTransfer`-like source, or the flavours themselves. */
export interface LinkPasteSource {
  readonly text?: string | null;
  readonly html?: string | null;
  /** `text/uri-list`. */
  readonly uriList?: string | null;
  /** A `PasteResult`'s entries: a `text/uri-list` entry is read from here. */
  readonly items?: readonly { readonly type: string; readonly data: string | Blob }[];
}

/** One URL with no spaces, as a whole pasted text (surrounding whitespace allowed). */
const SINGLE_URL = /^\s*<?([a-z][a-z\d+.-]*:[^\s<>]+?)>?\s*$/i;

type Resolve = (input: string) => string;

/** The URL, or `null` when the clipboard content is not a valid, allowed link. */
function tryUrl(resolve: Resolve, candidate: string): string | null {
  try {
    return resolve(candidate);
  } catch {
    return null;
  }
}

function fromUriList(list: string, resolve: Resolve): string | null {
  // RFC 2483: one URI per line, lines starting with "#" are comments.
  const first = list.split(/\r?\n/).find((line) => line.trim() !== '' && !line.startsWith('#'));
  return first === undefined ? null : tryUrl(resolve, first.trim());
}

/** The single link in pasted HTML (one `<a href>` and nothing else visible besides its text), parsed inertly. */
function fromHtml(html: string, resolve: Resolve): ResolvedLink | null {
  if (typeof DOMParser === 'undefined' || html.trim() === '') return null;
  const body = parseInertHtml(html.slice(0, 100_000)).body;
  const anchors = body.querySelectorAll('a[href]');
  if (anchors.length !== 1) return null;
  const anchor = anchors[0] as HTMLAnchorElement;
  const visible = body.textContent.replace(/\s+/g, ' ').trim();
  const label = anchor.textContent.replace(/\s+/g, ' ').trim();
  if (visible !== label) return null; // A link inside more text is not "a link".
  const url = tryUrl(resolve, String(anchor.getAttribute('href'))); // Matched by `a[href]`.
  if (url === null) return null;
  const title = cleanTitle(label, DEFAULT_LINK_TITLE_LENGTH);
  return { url, title: title === '' ? url : title, titled: title !== '' && title !== url };
}

/**
 * The link the clipboard (or a drop) holds, or `null`: from `text/uri-list`,
 * from HTML that is exactly one link (keeping its title), or from text that is
 * exactly one URL. Every URL is validated: allowed schemes only (never
 * `javascript:`), credentials removed. Never throws for clipboard content.
 *
 * @example
 * usePaste({ accept: ['text', 'html', 'text/uri-list'], onPaste: (result) => {
 *   const link = readLink(result);
 *   if (link) addBookmark(link.url, link.title);
 * } });
 */
export function readLink(source: LinkPasteSource, options: LinkUrlOptions = {}): ResolvedLink | null {
  return readWith(source, linkUrlResolver(options));
}

function readWith(source: LinkPasteSource, resolve: Resolve): ResolvedLink | null {
  const uriList = source.uriList ?? source.items?.find((item) => item.type === 'text/uri-list' && typeof item.data === 'string')?.data;
  if (typeof uriList === 'string') {
    const url = fromUriList(uriList, resolve);
    if (url !== null) {
      const fromMarkup = typeof source.html === 'string' ? fromHtml(source.html, resolve) : null;
      return fromMarkup?.url === url ? fromMarkup : { url, title: url, titled: false };
    }
  }
  if (typeof source.html === 'string') {
    const link = fromHtml(source.html, resolve);
    if (link !== null) return link;
  }
  const match = typeof source.text === 'string' ? SINGLE_URL.exec(source.text) : null;
  const url = match === null ? null : tryUrl(resolve, match[1] as string);
  return url === null ? null : { url, title: url, titled: false };
}

/** Structural paste event: a DOM `ClipboardEvent` and React's `onPaste` event both fit. */
export interface LinkPasteEvent {
  readonly clipboardData: { getData(format: string): string } | null;
  readonly currentTarget: EventTarget | null;
  readonly target: EventTarget | null;
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}

export interface PasteAsLinkOptions extends LinkUrlOptions {
  /**
   * What replaces the selection. Default: a Markdown link, `[selection](url)`.
   * Receives the selected text and the pasted link.
   */
  readonly format?: (selection: string, link: ResolvedLink) => string;
}

/**
 * A paste handler for text fields: pasting a link over selected text turns the
 * selection into a link (`[selected text](url)` by default), as GitHub, Slack
 * and Notion do. Everything else is left to the browser: pasting with nothing
 * selected, pasting over a URL, or pasting something that is not one link. The
 * browser's undo still works. Returns whether it handled the paste.
 *
 * @example
 * <textarea onPaste={pasteAsLink} />
 */
export function pasteAsLink(event: LinkPasteEvent, options: PasteAsLinkOptions = {}): boolean {
  const { format, ...urlOptions } = options;
  // Invalid options are a programming error: thrown before the paste is touched, so the native paste still happens.
  const resolve = linkUrlResolver(urlOptions);
  if (event.defaultPrevented || event.clipboardData === null) return false;
  const field = asTextField(event.currentTarget) ?? asTextField(event.target);
  if (field === null || field.disabled || field.readOnly || field.selectionStart === null || field.selectionEnd === null) return false;
  const selection = field.value.slice(field.selectionStart, field.selectionEnd);
  if (selection.trim() === '' || SINGLE_URL.test(selection)) return false;
  const data = event.clipboardData;
  const link = readWith({ text: data.getData('text/plain'), html: data.getData('text/html'), uriList: data.getData('text/uri-list') }, resolve);
  if (link === null) return false;
  const text = format === undefined ? markdownLink({ ...link, title: selection, titled: true }) : format(selection, link);
  if (typeof text !== 'string') throw copyFailure('invalid-payload', '`format` must return a string.');
  event.preventDefault();
  return insertText(field, text);
}

/** A link to the current selection, as returned by {@link selectionLink}. */
export interface SelectionLink extends ResolvedLink {
  /** The selected text, as one line. */
  readonly quote: string;
}

export interface SelectionLinkOptions extends TextFragmentOptions {
  /** The page to link to. Default: `location.href`. */
  readonly url?: string | URL;
  /** Default: `document.title`. */
  readonly title?: string;
}

/**
 * A link to the passage the user has selected (a text fragment link), with the
 * page title and the quote, or `null` when nothing is selected. Pass it to
 * `linkPayload` to copy it.
 *
 * @example
 * const link = selectionLink();
 * if (link) copy(() => linkPayload(link));
 */
export function selectionLink(options: SelectionLinkOptions = {}): SelectionLink | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  const selection = window.getSelection();
  if (selection === null || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  const quote = range.toString().replace(/\s+/g, ' ').trim();
  if (quote === '') return null;
  const { url = location.href, title = document.title, ...fragmentOptions } = options;
  const href = textFragmentUrl(url, range, fragmentOptions);
  const clean = cleanTitle(title, DEFAULT_LINK_TITLE_LENGTH);
  return { url: href, title: clean === '' ? href : clean, titled: clean !== '', quote };
}
