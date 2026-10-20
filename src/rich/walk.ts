import type { Color } from '../color/convert';
import { copyFailure } from '../core/errors';
import { linkUrlResolver, type LinkUrlOptions } from '../link/url';
import { AS_BLOCK, attributeAllowed, closesItem, CLOSES_P, DROP, HEADINGS, KEEP, PHRASING, TABLE_CHILDREN, TABLE_PARTS } from './policy';
import { parseColor } from '../color/parse';
import { declarations, inherit, readValues, ROOT_PARENT, WHITE, type RichColors, type StyleSource, type Values } from './style';
import { plainText } from './text';

export interface RichOptions extends Pick<LinkUrlOptions, 'protocols'> {
  /** Resolves relative links and images. Default: the source document's address. */
  readonly base?: string | URL;
  /** Default `"readable"`. See {@link RichColors}. */
  readonly colors?: RichColors;
  /**
   * Images: `"keep"` (default) with absolute `https:` and `http:` addresses and their
   * displayed size; `"alt"` writes their alt text instead; `"drop"` leaves them out.
   */
  readonly images?: 'keep' | 'alt' | 'drop';
  /** Also keep `data:` images (PNG, JPEG, GIF, WebP, up to 2 MB each). Many mail clients block them. Default `false`. */
  readonly dataImages?: boolean;
  /**
   * Where styles come from: `"computed"` (default for elements and selections on the
   * page: what the reader sees), `"inline"` (only `style` attributes: the default for
   * HTML strings and detached nodes), or `"none"`.
   */
  readonly styles?: 'computed' | 'inline' | 'none';
  /** More elements to leave out, as a CSS selector. `[data-copy-ignore]`, `[hidden]` and `[aria-hidden="true"]` always are. */
  readonly ignore?: string;
  /** The background the content is pasted on, for readability checks. Default `"#ffffff"`. */
  readonly background?: string;
  /** Most elements written; the rest is left out and `truncated` is set. Default 10,000. */
  readonly maxElements?: number;
  /** Most characters of HTML written, roughly. Default 1,000,000. */
  readonly maxLength?: number;
  /** The plain-text version. Default: readable text with lists, tables and line breaks. Pass `htmlToMarkdown` for Markdown. */
  readonly text?: (root: HTMLElement) => string;
  /** Reads an element's computed style. Default `getComputedStyle`; set it for DOMs that lack one. */
  readonly computedStyle?: (element: Element) => StyleSource | null;
}

/**
 * Why something was left out: `unsafe-element` (scripts, embeds, forms, SVG, media),
 * `hidden`, `ignored`, `unsafe-link`, `unsafe-image`, `image` (by the `images` option),
 * `unreadable-color` (by `colors: "readable"`), or `misplaced` (content a table can't
 * hold where it is, which every HTML parser would move out of the table).
 */
export type RichRemovalReason = 'unsafe-element' | 'hidden' | 'ignored' | 'unsafe-link' | 'unsafe-image' | 'image' | 'unreadable-color' | 'misplaced';

export interface RichRemoval {
  readonly reason: RichRemovalReason;
  /** The element name, or the URL scheme for links and images. */
  readonly name: string;
  readonly count: number;
}

export interface RichResult {
  /** Portable HTML: allowlisted elements and attributes, inline styles, absolute URLs. */
  readonly html: string;
  /** The same content as plain text. */
  readonly text: string;
  /** What was left out, and why: for logs and audits. */
  readonly removed: readonly RichRemoval[];
  /** The content went past `maxElements` or `maxLength` and was cut there. */
  readonly truncated: boolean;
}

/** What can be copied: an element, a selection range, a fragment, or HTML text. */
export type RichSource = Element | DocumentFragment | Range | string;

const VOID = new Set(['br', 'hr', 'img', 'col']);
const BLOCK_DISPLAY = /^(?:block|flex|grid|flow-root|list-item|table)$/;
const DATA_IMAGE = /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z\d+/]+=*$/i;

function positive(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (Number.isInteger(value) && value > 0) return value;
  throw copyFailure('invalid-payload', `\`${name}\` must be a positive integer.`);
}

/** Whether `source` holds an element that would close a paragraph around it. */
function holdsBlocks(source: Element): boolean {
  for (let child = source.firstElementChild; child !== null; child = child.nextElementSibling) {
    if (CLOSES_P.has(child.localName) || holdsBlocks(child)) return true;
  }
  return false;
}

/** Whether `node` is (inside) a link in the output. */
function insideLink(node: Node | null): boolean {
  for (let current = node; current !== null; current = current.parentNode) if ((current as Element).localName === 'a') return true;
  return false;
}

const isRange = (value: unknown): value is Range =>
  typeof value === 'object' && value !== null && 'commonAncestorContainer' in value && typeof (value as Range).intersectsNode === 'function';

class Builder {
  readonly removals = new Map<string, RichRemoval>();
  truncated = false;
  private elements = 0;
  private size = 0;
  /** Table parts added around misplaced cells and rows, which later cells and rows share. */
  private readonly implied = new WeakSet<Node>();
  private readonly resolveLink: (url: string) => string;
  private readonly resolveImage: (url: string) => string;

  constructor(
    readonly out: Document,
    private readonly options: RichOptions,
    private readonly mode: 'computed' | 'inline' | 'none',
    private readonly computed: (element: Element) => StyleSource | null,
    private readonly colors: RichColors,
    private readonly ignore: string | null,
    private readonly maxElements: number,
    private readonly maxLength: number,
    base: string | URL | undefined,
  ) {
    const baseOption = base === undefined ? {} : { base };
    this.resolveLink = linkUrlResolver({ ...baseOption, ...(options.protocols === undefined ? {} : { protocols: options.protocols }) });
    this.resolveImage = linkUrlResolver({ ...baseOption, protocols: options.dataImages === true ? ['https:', 'http:', 'data:'] : ['https:', 'http:'] });
  }

  remove(reason: RichRemovalReason, name: string): void {
    const key = `${reason} ${name}`;
    const known = this.removals.get(key);
    this.removals.set(key, { reason, name, count: (known?.count ?? 0) + 1 });
  }

  /** The style values to use for an element, or `null` when it is hidden. */
  private values(element: Element, parent: Values): Values | null {
    if (this.mode === 'computed') {
      const style = this.computed(element);
      if (style === null) return inherit(parent, undefined, element.localName);
      const display = style.getPropertyValue('display').trim();
      const visibility = style.getPropertyValue('visibility').trim();
      if (display === 'none' || visibility === 'hidden' || visibility === 'collapse') return null;
      return { ...readValues(style), display };
    }
    const declared = (element as Partial<HTMLElement>).style;
    if (declared?.getPropertyValue('display').trim() === 'none') return null;
    // Declared values on top of the inherited ones, as the browser would compute them.
    const tag = element.localName;
    return this.mode === 'none' || declared === undefined ? inherit(parent, undefined, tag) : inherit(parent, readValues(declared), tag);
  }

  private url(raw: string | null, resolve: (url: string) => string): string | null {
    if (raw === null || raw.trim() === '') return null;
    try {
      return resolve(raw);
    } catch {
      return null;
    }
  }

  private budget(cost: number): boolean {
    if (this.elements >= this.maxElements || this.size + cost > this.maxLength) {
      this.truncated = true;
      return false;
    }
    this.size += cost;
    return true;
  }

  /** A URL's scheme for reports, read as the URL parser reads it: tabs and line breaks inside it don't count. */
  private scheme = (raw: string | null): string => /^\s*([a-z][a-z\d+.-]*):/i.exec((raw ?? '').replace(/[\t\n\r]/g, ''))?.[1]?.toLowerCase() ?? 'relative';

  /** Converts `source` into `parent`, keeping only what lies inside `range` when given. */
  node(source: Node, parent: Node, inherited: Values, background: Color, range: Range | null, root = false): void {
    if (source.nodeType === 3) {
      let text = (source as Text).data;
      if (range !== null) {
        const end = source === range.endContainer ? range.endOffset : text.length;
        text = text.slice(source === range.startContainer ? range.startOffset : 0, end);
      }
      if (TABLE_CHILDREN[(parent as Element).localName] !== undefined && text.trim() !== '') {
        this.remove('misplaced', '#text');
        return;
      }
      if (text !== '' && this.budget(text.length)) parent.appendChild(this.out.createTextNode(text));
      return;
    }
    if (source.nodeType === 11 || source.nodeType === 9) {
      this.children(source, parent, inherited, background, range);
      return;
    }
    if (source.nodeType !== 1) return;
    this.element(source as Element, parent, inherited, background, range, root);
  }

  children(source: Node, parent: Node, inherited: Values, background: Color, range: Range | null): void {
    for (let child = source.firstChild; child !== null && !this.truncated; child = child.nextSibling) {
      if (range === null || range.intersectsNode(child)) this.node(child, parent, inherited, background, range);
    }
  }

  private element(source: Element, parent: Node, inherited: Values, background: Color, range: Range | null, root: boolean): void {
    const tag = source.localName.toLowerCase();
    if (DROP.has(tag) || source.namespaceURI !== 'http://www.w3.org/1999/xhtml') {
      this.remove('unsafe-element', tag);
      return;
    }
    // Attribute checks, not a selector: selector engines are slow to start in DOMs like jsdom.
    if (
      source.hasAttribute('data-copy-ignore') ||
      source.hasAttribute('hidden') ||
      source.getAttribute('aria-hidden') === 'true' ||
      (this.ignore !== null && source.matches(this.ignore))
    ) {
      this.remove('ignored', tag);
      return;
    }
    let values = this.values(source, inherited);
    if (values === null) {
      this.remove('hidden', tag);
      return;
    }
    // A selection's container is page chrome: only its inherited text style is kept.
    if (root && range !== null) values = { ...values, 'background-color': '', 'border-top-style': '', 'border-right-style': '', 'border-bottom-style': '', 'border-left-style': '', 'padding-top': '', 'padding-right': '', 'padding-bottom': '', 'padding-left': '' };
    if (tag === 'img') {
      this.image(source as HTMLImageElement, parent);
      return;
    }
    let name = KEEP.has(tag) ? tag : AS_BLOCK.has(tag) || BLOCK_DISPLAY.test(values.display ?? '') ? 'div' : 'span';
    let href: string | null = null;
    if (tag === 'a') {
      const raw = source.getAttribute('href');
      href = this.url(raw, this.resolveLink);
      if (href === null) {
        if (raw !== null && raw.trim() !== '') this.remove('unsafe-link', this.scheme(raw));
        name = 'span';
      }
    }
    let target = parent;
    let parentTag = (parent as Element).localName;
    // Outside a table, HTML parsers ignore table tags: a selection inside a table gets its table, anything else is a block.
    if (TABLE_PARTS.has(name) && TABLE_CHILDREN[parentTag] === undefined) {
      if (root) {
        target = parent.appendChild(this.out.createElement('table'));
        parentTag = 'table';
      } else if (name === 'col') {
        this.remove('misplaced', tag);
        return;
      } else name = 'div';
    }
    // The table parts that HTML parsers add around cells, rows and columns.
    const implied: string[] = [];
    if (parentTag === 'table' && (name === 'tr' || name === 'td' || name === 'th')) implied.push('tbody');
    if ((name === 'td' || name === 'th') && (implied.length > 0 || parentTag === 'tbody' || parentTag === 'thead' || parentTag === 'tfoot')) implied.push('tr');
    if (parentTag === 'table' && name === 'col') implied.push('colgroup');
    // A table part can hold only its own parts: anything else is left out, not moved around.
    const allowed = TABLE_CHILDREN[implied.at(-1) ?? parentTag];
    if (allowed !== undefined && !allowed.has(name)) {
      this.remove('misplaced', tag);
      return;
    }
    // What HTML parsers would split apart: a paragraph around blocks, a heading in a heading, a list item in a list item.
    if (name === 'p' && holdsBlocks(source)) name = 'div';
    if (HEADINGS.has(name) && HEADINGS.has(parentTag)) name = 'span';
    if ((name === 'li' || name === 'dd' || name === 'dt') && closesItem(name, parent)) name = 'div';
    // Inside text-level content, a block becomes inline and a link inside a link loses its link.
    if (name === 'div' && PHRASING.has(parentTag)) name = 'span';
    if (name === 'a' && insideLink(parent)) name = 'span';
    if (!this.budget(name.length * 2 + 5)) return;
    for (const wrapper of implied) {
      const last = (target as Element).lastElementChild;
      target = last !== null && this.implied.has(last) && last.localName === wrapper ? last : target.appendChild(this.out.createElement(wrapper));
      this.implied.add(target);
    }
    this.elements += 1;
    const out = this.out.createElement(name);
    if (href !== null && name === 'a') out.setAttribute('href', href);
    for (const attribute of Array.from(source.attributes)) {
      const key = attribute.name.toLowerCase();
      if (name === tag && attributeAllowed(tag, key, attribute.value)) out.setAttribute(key, attribute.value);
    }
    const style = declarations(name, values, root ? ROOT_PARENT : inherited, background, this.colors);
    if (style.droppedColor) this.remove('unreadable-color', tag);
    if (style.css !== '' && this.budget(style.css.length)) out.setAttribute('style', style.css);
    target.appendChild(out);
    if (!VOID.has(name)) this.children(source, out, values, style.background, range);
  }

  private image(source: HTMLImageElement, parent: Node): void {
    const alt = source.getAttribute('alt') ?? '';
    const policy = this.options.images ?? 'keep';
    if (policy === 'drop') {
      this.remove('image', 'img');
      return;
    }
    const raw = this.mode === 'computed' && source.currentSrc !== '' ? source.currentSrc : source.getAttribute('src');
    const src = policy === 'keep' ? this.url(raw, this.resolveImage) : null;
    const safe = src !== null && (!src.startsWith('data:') || (DATA_IMAGE.test(src) && src.length <= 2_000_000));
    if (!safe) {
      this.remove(policy === 'keep' ? 'unsafe-image' : 'image', policy === 'keep' ? this.scheme(raw) : 'img');
      if (alt !== '' && this.budget(alt.length)) parent.appendChild(this.out.createTextNode(alt));
      return;
    }
    if (!this.budget(src.length + alt.length + 40)) return;
    this.elements += 1;
    const out = this.out.createElement('img');
    out.setAttribute('src', src);
    if (alt !== '') out.setAttribute('alt', alt);
    // Mail clients size images by their attributes: write the displayed size.
    for (const side of ['width', 'height'] as const) {
      const shown = this.mode === 'computed' ? Math.round(source[side]) : NaN;
      const declared = source.getAttribute(side) ?? '';
      const value = shown > 0 ? String(shown) : /^\d{1,5}$/.test(declared) ? declared : '';
      if (value !== '') out.setAttribute(side, value);
    }
    const title = source.getAttribute('title');
    if (title !== null) out.setAttribute('title', title);
    parent.appendChild(out);
  }
}

/** The DOM document to read and write with, or a typed error outside a browser. */
function domFor(source: RichSource): { readonly doc: Document; readonly root: Node; readonly range: Range | null; readonly live: boolean } {
  if (typeof source === 'string') {
    if (typeof DOMParser === 'undefined') throw copyFailure('unsupported', 'Reading HTML text needs a DOM (DOMParser); pass a DOM node, or use a browser or jsdom.');
    // A parsed document is inert: scripts never run and nothing is fetched.
    // In standards mode, as pages and mail clients read HTML (not quirks mode, which keeps a table inside a paragraph).
    const doc = new DOMParser().parseFromString(`<!doctype html><body>${source}`, 'text/html');
    return { doc, root: doc.body, range: null, live: false };
  }
  if (isRange(source)) {
    const container = source.commonAncestorContainer;
    const element = container.nodeType === 1 ? container : container.parentNode;
    if (element === null || container.ownerDocument === null) throw copyFailure('invalid-payload', 'The range is not in a document.');
    return { doc: container.ownerDocument, root: element, range: source, live: container.isConnected };
  }
  const value: unknown = source;
  if (typeof value !== 'object' || value === null || !('nodeType' in value) || ((value as Node).nodeType !== 1 && (value as Node).nodeType !== 11)) {
    throw copyFailure('invalid-payload', 'Rich content must be an element, a fragment, a range or HTML text.');
  }
  const node = value as Node;
  return { doc: node.ownerDocument as Document, root: node, range: null, live: node.isConnected };
}

/**
 * Converts content into portable rich text: the HTML that mail clients, Google Docs,
 * Word, Notion and Slack paste as it looks, plus a plain-text version.
 *
 * - Only safe, widely supported elements and attributes are kept: never scripts,
 *   event handlers, embeds, forms or tracking pixels from `data:` or `blob:` URLs.
 * - Styles are inline, from what the reader sees (computed styles) for content on
 *   the page. Classes, stylesheets and CSS variables can't travel; their result can.
 * - Every colour becomes an opaque hex value, which every mail client understands
 *   (not `oklch()` or `rgb(r g b / 50%)`). Text that would be unreadable on a white
 *   page, such as light text from a dark theme, keeps the destination's colour.
 * - Links and images get absolute, scheme-checked URLs; images get their displayed size.
 *
 * Never inserts anything into the page: the output is built in a separate, inert document.
 *
 * @example
 * const { html, text, removed } = prepareRich(articleRef.current);
 */
export function prepareRich(source: RichSource, options: RichOptions = {}): RichResult {
  const { doc, root, range, live } = domFor(source);
  // Computed styles need content on a page with a window; anything else has only its style attributes.
  const mode = options.styles ?? (live && doc.defaultView !== null ? 'computed' : 'inline');
  const modeValue: unknown = mode; // Plain-JS callers can pass anything.
  if (modeValue !== 'computed' && modeValue !== 'inline' && modeValue !== 'none') throw copyFailure('invalid-payload', '`styles` must be "computed", "inline" or "none".');
  const colors = options.colors ?? 'readable';
  const colorsValue: unknown = colors;
  if (colorsValue !== 'readable' && colorsValue !== 'keep' && colorsValue !== 'none') throw copyFailure('invalid-payload', '`colors` must be "readable", "keep" or "none".');
  const images: unknown = options.images ?? 'keep';
  if (images !== 'keep' && images !== 'alt' && images !== 'drop') throw copyFailure('invalid-payload', '`images` must be "keep", "alt" or "drop".');
  const view = doc.defaultView;
  const computed = options.computedStyle ?? ((element: Element) => (view === null ? null : view.getComputedStyle(element)));
  const page = options.background === undefined ? WHITE : declarationsBackground(options.background);
  if (options.ignore !== undefined) {
    // An invalid selector is a programming error: it throws a typed error here, not mid-copy.
    try {
      doc.createElement('div').matches(options.ignore);
    } catch (cause) {
      throw copyFailure('invalid-payload', `\`ignore\` is not a valid CSS selector: ${options.ignore}`, cause);
    }
  }
  const out = doc.implementation.createHTMLDocument('');
  const builder = new Builder(
    out,
    options,
    mode,
    computed,
    colors,
    options.ignore ?? null,
    positive(options.maxElements, 10_000, 'maxElements'),
    positive(options.maxLength, 1_000_000, 'maxLength'),
    options.base ?? (doc.baseURI === 'about:blank' ? undefined : doc.baseURI),
  );
  const container = out.createElement('div');
  // HTML text is its body's content; anything else is converted with its root element.
  if (typeof source === 'string') builder.children(root, container, ROOT_PARENT, page, null);
  else builder.node(root, container, ROOT_PARENT, page, range, true);
  // Left-out nodes can leave text in pieces: join them, as reading the HTML back would.
  container.normalize();
  const text = (options.text ?? plainText)(container);
  if (typeof text !== 'string') throw copyFailure('invalid-payload', '`text` must return a string.');
  // Whitespace at the very edges shows nothing, and HTML parsers drop it when reading the copy.
  const first = container.firstChild;
  if (first?.nodeType === 3) (first as Text).data = (first as Text).data.replace(/^\s+/, '');
  const last = container.lastChild;
  if (last?.nodeType === 3) (last as Text).data = (last as Text).data.replace(/\s+$/, '');
  // Only whitespace is no content: nothing to copy.
  const empty = container.textContent.trim() === '' && container.querySelector('img, br, hr') === null;
  return { html: empty ? '' : container.innerHTML, text: empty ? '' : text, removed: [...builder.removals.values()], truncated: builder.truncated };
}

/** The destination background as an opaque colour; a typed error for anything else. */
function declarationsBackground(value: string): Color {
  const parsed: Color | null = typeof value === 'string' ? parseColor(value) : null;
  if (parsed === null || parsed.alpha !== 1) throw copyFailure('invalid-payload', '`background` must be an opaque CSS colour.');
  return parsed;
}
