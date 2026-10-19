import { copyFailure } from '../core/errors';
import { resolveLinkUrl, type LinkUrlOptions } from './url';

/**
 * A passage to link to: `start` alone, or `start` to `end` for a longer one.
 * `prefix` and `suffix` are the words around it, used to tell apart passages
 * that appear more than once. Each term must lie within one block of the page
 * (a paragraph, a list item, a heading).
 */
export interface TextFragment {
  readonly start: string;
  readonly end?: string;
  readonly prefix?: string;
  readonly suffix?: string;
}

export interface TextFragmentOptions extends LinkUrlOptions {
  /** Passages longer than this many words link by their first and last words (`start,end`). Default 10. */
  readonly maxWords?: number;
  /** Words kept at each end of a long passage, and of prefix and suffix context. Default 4. */
  readonly contextWords?: number;
  /** Where to look for repeats of the passage, to decide whether context is needed. Default `document.body`. */
  readonly root?: Node;
}

const invalid = (message: string) => copyFailure('invalid-payload', message);

const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim();
const words = (text: string): string[] => collapse(text).split(' ').filter((word) => word !== '');

/**
 * Percent-encodes a directive term. `encodeURIComponent` leaves `-` alone, but the
 * directive syntax uses it (`prefix-,` and `,-suffix`), so it is encoded too.
 */
export function encodeTerm(term: string): string {
  return encodeURIComponent(term).replace(/-/g, '%2D');
}

/** The `text=` directive for a fragment. */
export function textDirective(fragment: TextFragment): string {
  const terms: string[] = [];
  if (fragment.prefix !== undefined && fragment.prefix !== '') terms.push(`${encodeTerm(fragment.prefix)}-`);
  terms.push(encodeTerm(fragment.start));
  if (fragment.end !== undefined && fragment.end !== '') terms.push(encodeTerm(fragment.end));
  if (fragment.suffix !== undefined && fragment.suffix !== '') terms.push(`-${encodeTerm(fragment.suffix)}`);
  return `text=${terms.join(',')}`;
}

function positive(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (Number.isInteger(value) && value >= 1) return value;
  throw invalid(`\`${name}\` must be a positive integer (received ${String(value)}).`);
}

/** Elements that start a new block: text fragment terms never span them. */
const BLOCK = new Set([
  'address', 'article', 'aside', 'blockquote', 'body', 'caption', 'dd', 'details', 'dialog', 'div', 'dl', 'dt', 'fieldset',
  'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'hr', 'li', 'main', 'nav',
  'ol', 'p', 'pre', 'section', 'summary', 'table', 'td', 'th', 'tr', 'ul',
]);

/** The nearest block around `node`, or the top of its tree (a detached node's fragment, or the page body). */
function blockOf(node: Node): Node {
  let top = node;
  for (let current: Node | null = node; current !== null; current = current.parentNode) {
    if (current.nodeType === 1 && BLOCK.has((current as Element).localName)) return current;
    top = current;
  }
  if (top.nodeType !== 9) return top;
  const body: unknown = (top as Document).body; // Null in an XML document, despite its type.
  return body instanceof Node ? body : top;
}

/** The text of `block` from its start to (`before`) or from (`after`) a boundary point. */
function around(block: Node, container: Node, offset: number, side: 'before' | 'after'): string {
  const range = (container.ownerDocument as Document).createRange();
  range.selectNodeContents(block);
  if (side === 'before') range.setEnd(container, offset);
  else range.setStart(container, offset);
  return range.toString();
}

const count = (haystack: string, needle: string): number => {
  let found = 0;
  for (let at = haystack.indexOf(needle); at !== -1 && found < 2; at = haystack.indexOf(needle, at + 1)) found += 1;
  return found;
};

function rootText(root: Node | undefined): string | null {
  const node = root ?? (typeof document === 'undefined' ? undefined : document.body);
  if (node === undefined) return null;
  // A range reads the text of any node, a whole Document included (whose `textContent` is null).
  const range = ((node.ownerDocument ?? node) as Document).createRange();
  range.selectNodeContents(node);
  return collapse(range.toString()).toLowerCase();
}

/** Splits a passage into a directive: whole when short, first and last words when long. */
function fromText(text: string, maxWords: number, contextWords: number): TextFragment {
  const all = words(text);
  if (all.length === 0) throw invalid('A text fragment needs some text.');
  if (all.length <= maxWords) return { start: all.join(' ') };
  return { start: all.slice(0, contextWords).join(' '), end: all.slice(-contextWords).join(' ') };
}

/** A fragment for a selected range: terms taken from within their own blocks, context added when the passage repeats. */
function fromRange(range: Range, maxWords: number, contextWords: number, root: Node | undefined): TextFragment {
  const startBlock = blockOf(range.startContainer);
  const endBlock = blockOf(range.endContainer);
  const text = collapse(range.toString());
  if (text === '') throw invalid('A text fragment needs some text: the range is empty.');
  let fragment: TextFragment;
  if (startBlock === endBlock) {
    fragment = fromText(text, maxWords, contextWords);
  } else {
    // A passage across blocks: start in the first block, end in the last.
    const head = words(around(startBlock, range.startContainer, range.startOffset, 'after')).slice(0, contextWords);
    const tail = words(around(endBlock, range.endContainer, range.endOffset, 'before')).slice(-contextWords);
    fragment = head.length === 0 || tail.length === 0 ? fromText(text, maxWords, contextWords) : { start: head.join(' '), end: tail.join(' ') };
  }
  const page = rootText(root);
  if (page !== null && count(page, fragment.start.toLowerCase()) < 2) return fragment;
  // The start appears more than once (or the page can't be read): add the words around the passage.
  const prefix = words(around(startBlock, range.startContainer, range.startOffset, 'before')).slice(-contextWords).join(' ');
  const suffix = words(around(endBlock, range.endContainer, range.endOffset, 'after')).slice(0, contextWords).join(' ');
  return { ...fragment, prefix, suffix }; // Empty terms are left out of the directive.
}

/** A caller's fragment with each term on one line; empty optional terms are left out of the directive. */
function fromObject(passage: TextFragment): TextFragment {
  const term = (value: unknown): string => (typeof value === 'string' ? collapse(value) : '');
  const start = term(passage.start);
  if (start === '') throw invalid('A text fragment needs a non-empty `start`.');
  return { start, end: term(passage.end), prefix: term(passage.prefix), suffix: term(passage.suffix) };
}

function isRange(value: unknown): value is Range {
  return typeof value === 'object' && value !== null && typeof (value as Range).cloneContents === 'function' && 'startContainer' in value;
}

/**
 * A link that scrolls to, and highlights, a passage of the page: the
 * [text fragment](https://wicg.github.io/scroll-to-text-fragment/) syntax
 * (`#:~:text=`), supported by Chromium, Safari and Firefox. Browsers without it
 * open the page at its normal position (or its existing `#section`).
 *
 * The passage is a string, a {@link TextFragment}, or a DOM `Range` (the user's
 * selection): long passages link by their first and last words, and the words
 * around a passage are added when it appears more than once on the page.
 *
 * @example
 * textFragmentUrl(location.href, window.getSelection()!.getRangeAt(0));
 * textFragmentUrl('https://example.com/docs#install', 'npm install react-smart-copy');
 */
export function textFragmentUrl(url: string | URL, passage: string | TextFragment | Range, options: TextFragmentOptions = {}): string {
  const maxWords = positive(options.maxWords, 10, 'maxWords');
  const contextWords = positive(options.contextWords, 4, 'contextWords');
  let fragment: TextFragment;
  if (typeof passage === 'string') {
    fragment = fromText(passage, maxWords, contextWords);
  } else if (isRange(passage)) {
    fragment = fromRange(passage, maxWords, contextWords, options.root);
  } else if (typeof passage === 'object' && (passage as unknown) !== null && typeof (passage as { start?: unknown }).start === 'string') {
    fragment = fromObject(passage);
  } else {
    throw invalid('The passage must be a string, a TextFragment or a Range.');
  }
  const href = resolveLinkUrl(url, options);
  const hashAt = href.indexOf('#');
  const base = hashAt === -1 ? href : href.slice(0, hashAt);
  // Keep an existing #section; replace any earlier directive.
  const section = hashAt === -1 ? '' : (href.slice(hashAt + 1).split(':~:')[0] as string);
  return `${base}#${section}:~:${textDirective(fragment)}`;
}

/** Whether this browser scrolls to text fragments (`document.fragmentDirective`). */
export function supportsTextFragments(): boolean {
  return typeof document !== 'undefined' && 'fragmentDirective' in document;
}
