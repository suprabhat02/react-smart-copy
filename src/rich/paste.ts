import { copyFailure } from '../core/errors';
import { linkUrlResolver } from '../link/url';
import { unwrapRedirect } from '../markdown/url';
import { DROP } from './policy';
import { prepareRich, type RichOptions, type RichRemoval, type RichRemovalReason, type RichResult } from './walk';
import { parseInertHtml } from '../core/inert-html';

/**
 * What a destination can hold. A format left out of `formats` is written as the closest thing
 * that is allowed, and its text is always kept:
 *
 * - `bold`, `italic`, `underline`, `strike`, `code`, `superscript`, `subscript`: the text, unformatted.
 * - `link`: the link text. `image`: the image's alt text.
 * - `heading`: a paragraph, in bold when `bold` is allowed.
 * - `list`: a paragraph per item, after its marker (`\u2022`, `1.`).
 * - `quote`: its paragraphs. `table`: a paragraph per cell, in reading order.
 * - `codeBlock`: a paragraph per line, as inline code when `code` is allowed.
 * - `rule`: nothing.
 */
export type RichPasteFormat =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'code'
  | 'superscript'
  | 'subscript'
  | 'link'
  | 'image'
  | 'heading'
  | 'list'
  | 'quote'
  | 'codeBlock'
  | 'table'
  | 'rule';

/** Every format, in the order the docs list them. */
export const RICH_PASTE_FORMATS: readonly RichPasteFormat[] = [
  'bold', 'italic', 'underline', 'strike', 'code', 'superscript', 'subscript', 'link', 'image',
  'heading', 'list', 'quote', 'codeBlock', 'table', 'rule',
];

export interface PasteToRichOptions extends Pick<RichOptions, 'protocols' | 'dataImages' | 'maxElements' | 'maxLength' | 'text'> {
  /**
   * What the destination can hold, such as an editor's schema or a comment box's toolbar.
   * Default: every format. See {@link RichPasteFormat} for what happens to the rest.
   */
  readonly formats?: readonly RichPasteFormat[];
  /**
   * Resolves relative links and images, when you know where the content was copied from
   * (your own site, say). Default: none, so relative links keep only their text: a pasted
   * `/docs` would otherwise point into your site, not the one it came from.
   */
  readonly base?: string | URL;
  /** Most nodes of the pasted HTML read; the rest is left out and `truncated` is set. Default 200,000. */
  readonly maxNodes?: number;
}

/** Cleaned rich content: semantic HTML, its plain text, and what was left out. */
export interface RichPaste extends RichResult {
  /** `html` when cleaned from the rich flavour; `text` when built from plain text (paragraphs and line breaks). */
  readonly source: 'html' | 'text';
}

/** The clipboard flavours: a `PasteResult` from `usePaste`, or anything with `html` / `text`. */
export interface RichPasteSource {
  readonly html?: string | null;
  readonly text?: string | null;
}

/* ---------------------------------------------------------------- Inline */

const STRONG = 1;
const EM = 2;
const UNDERLINE = 4;
const STRIKE = 8;
const CODE = 16;
const SUP = 32;
const SUB = 64;

/** Inline formats, outermost first: the fixed order makes the output canonical. */
const INLINE: readonly (readonly [bit: number, tag: string, format: RichPasteFormat])[] = [
  [STRONG, 'strong', 'bold'],
  [EM, 'em', 'italic'],
  [UNDERLINE, 'u', 'underline'],
  [STRIKE, 's', 'strike'],
  [CODE, 'code', 'code'],
  [SUP, 'sup', 'superscript'],
  [SUB, 'sub', 'subscript'],
];

const TAG_BITS: Readonly<Record<string, number>> = {
  b: STRONG, strong: STRONG,
  i: EM, em: EM, cite: EM, dfn: EM, var: EM,
  u: UNDERLINE, ins: UNDERLINE,
  s: STRIKE, strike: STRIKE, del: STRIKE,
  code: CODE, kbd: CODE, samp: CODE, tt: CODE,
  sup: SUP, sub: SUB,
};

const MONOSPACE =
  /\b(monospace|courier|consolas|menlo|monaco|source code pro|roboto mono|fira (code|mono)|jetbrains mono|sf mono|cascadia|ubuntu mono|lucida console|inconsolata)\b/;

type Run =
  | { readonly kind: 'text'; readonly text: string; readonly bits: number; readonly href: string | null }
  | { readonly kind: 'break'; readonly bits: number; readonly href: string | null }
  | { readonly kind: 'image'; readonly image: Element; readonly bits: number; readonly href: string | null };

/** Inline CSS, lower-cased. */
function styleOf(element: Element): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const declaration of (element.getAttribute('style') ?? '').split(';')) {
    const colon = declaration.indexOf(':');
    if (colon > 0) map.set(declaration.slice(0, colon).trim().toLowerCase(), declaration.slice(colon + 1).trim().toLowerCase());
  }
  return map;
}

/** Formats after this element: its tag first, then its inline CSS, which wins (Google Docs, Word). */
function bitsOf(bits: number, tag: string, style: ReadonlyMap<string, string>): number {
  let next = bits | (TAG_BITS[tag] ?? 0);
  const weight = style.get('font-weight');
  if (weight !== undefined) {
    const numeric = Number.parseInt(weight, 10);
    if (weight === 'bold' || weight === 'bolder' || numeric >= 600) next |= STRONG;
    else if (weight === 'normal' || weight === 'lighter' || numeric > 0) next &= ~STRONG;
  }
  const fontStyle = style.get('font-style');
  if (fontStyle === 'italic' || fontStyle === 'oblique') next |= EM;
  else if (fontStyle === 'normal') next &= ~EM;
  const decoration = style.get('text-decoration-line') ?? style.get('text-decoration');
  if (decoration !== undefined) {
    if (decoration.includes('underline')) next |= UNDERLINE;
    if (decoration.includes('line-through')) next |= STRIKE;
    if (decoration === 'none') next &= ~(UNDERLINE | STRIKE);
  }
  const vertical = style.get('vertical-align');
  if (vertical === 'super') next = (next | SUP) & ~SUB;
  else if (vertical === 'sub') next = (next | SUB) & ~SUP;
  else if (vertical === 'baseline') next &= ~(SUP | SUB);
  const family = style.get('font-family');
  if (family !== undefined && MONOSPACE.test(family)) next |= CODE;
  return next;
}

/* ---------------------------------------------------------------- Blocks */

/** Never content: scripts, metadata, embeds, media, controls, and Word's `<o:p>` spacers. */
const SKIP: ReadonlySet<string> = /* @__PURE__ */ new Set([...DROP, 'xml', 'o:p', 'area', 'menuitem']);

/** Left out without a report: what every clipboard document carries (its head, Office markup), not content. */
const QUIET: ReadonlySet<string> = /* @__PURE__ */ new Set(['head', 'meta', 'title', 'link', 'base', 'style', 'xml', 'o:p']);

const HEADINGS: ReadonlySet<string> = /* @__PURE__ */ new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

/** Elements that start a new block. Anything else is inline: its content joins the current line. */
const BLOCKS: ReadonlySet<string> = /* @__PURE__ */ new Set([
  'address', 'article', 'aside', 'blockquote', 'body', 'caption', 'center', 'dd', 'details', 'dialog', 'dir', 'div', 'dl', 'dt',
  'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'hr', 'legend',
  'li', 'listing', 'main', 'menu', 'nav', 'ol', 'p', 'pre', 'search', 'section', 'summary', 'table', 'tbody', 'td', 'tfoot',
  'th', 'thead', 'tr', 'ul', 'xmp',
]);

/** What ends a line in an item already: a line break, or a block written into it. */
const LINE_ENDS: ReadonlySet<string> = /* @__PURE__ */ new Set(['br', 'ul', 'ol', 'table', 'pre', 'blockquote', 'hr', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

/** Containers that hold their own lines: inline content goes straight into them, not into a paragraph. */
const ITEMS: ReadonlySet<string> = /* @__PURE__ */ new Set(['li', 'td', 'th', 'dt', 'dd', 'caption']);

const BLOCK_SELECTOR = /* @__PURE__ */ [...BLOCKS].join(',');

const WORD_LIST = /mso-list\s*:\s*l\d+\s+level(\d+)/i;
const ORDERED_MARKER = /^\(?(\d+|[a-z]|[ivxlcdm]+)[.)]/i;

/** Deeper than this, content is kept as plain text: nothing is lost, and nothing overflows the stack. */
const MAX_DEPTH = 200;
/** Most characters of pasted HTML read. */
const MAX_INPUT = 16 * 1024 * 1024;

function isHidden(element: Element, style: ReadonlyMap<string, string>): boolean {
  return (
    element.hasAttribute('hidden') ||
    element.getAttribute('aria-hidden') === 'true' ||
    style.get('display') === 'none' ||
    style.get('visibility') === 'hidden' ||
    style.get('mso-list') === 'ignore' // Word's list markers: the list carries them
  );
}

const isWordListParagraph = (node: Node): node is Element => node.nodeType === 1 && WORD_LIST.test((node as Element).getAttribute('style') ?? '');

/**
 * The text of a code block, with its lines: line breaks, and one per block (as code editors put each
 * line in a `<div>`). `skipped` hears of each element left out.
 */
function codeText(element: Element, skipped: (tag: string) => void): string {
  let text = '';
  const walk = (node: Node): void => {
    if (node.nodeType === 3) {
      text += (node as Text).data.replace(/\u00A0/g, ' ');
      return;
    }
    if (node.nodeType !== 1) return;
    const child = node as Element;
    const tag = child.localName;
    if (SKIP.has(tag)) {
      skipped(tag);
      return;
    }
    if (isHidden(child, styleOf(child))) return;
    if (tag === 'br') {
      text += '\n';
      return;
    }
    const block = BLOCKS.has(tag);
    if (block && text !== '' && !text.endsWith('\n')) text += '\n';
    child.childNodes.forEach(walk);
    if (block && text !== '' && !text.endsWith('\n')) text += '\n';
  };
  element.childNodes.forEach(walk);
  return text.replace(/\r\n?/g, '\n').replace(/\n$/, '');
}

/** A `<div style="white-space: pre; font-family: monospace">`, as code editors (VS Code) write. */
function isCodeContainer(tag: string, style: ReadonlyMap<string, string>): boolean {
  const whiteSpace = style.get('white-space');
  const family = style.get('font-family');
  return tag === 'div' && whiteSpace !== undefined && whiteSpace.startsWith('pre') && family !== undefined && MONOSPACE.test(family);
}

/** A table used for layout (mail, old pages): its cells are just content, in reading order. */
function isLayoutTable(table: Element): boolean {
  const role = table.getAttribute('role');
  if (role === 'presentation' || role === 'none') return true;
  const cells = table.querySelectorAll('td, th');
  return cells.length === 1 || table.querySelector('td table, th table') !== null;
}

interface WordList {
  readonly ordered: boolean;
  readonly start: number;
  readonly items: { readonly runs: readonly Run[]; readonly nested: WordList[] }[];
}

interface Ctx {
  readonly bits: number;
  readonly href: string | null;
  readonly depth: number;
}

/** A URL's scheme for reports, read as the URL parser reads it: tabs and line breaks inside it don't count. */
function positive(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (Number.isInteger(value) && value > 0) return value;
  throw copyFailure('invalid-payload', `\`${name}\` must be a positive integer.`);
}

const scheme = (raw: string): string => /^\s*([a-z][a-z\d+.-]*):/i.exec(raw.replace(/[\t\n\r]/g, ''))?.[1]?.toLowerCase() ?? 'relative';

class Cleaner {
  private nodes = 0;
  truncated = false;
  readonly removals = new Map<string, RichRemoval>();
  private readonly allowedBits: number;
  private readonly resolveLink: (url: string) => string;
  private readonly resolveImage: (url: string) => string;
  /** Pasted content has no address of its own: relative URLs resolve only against `base`, never the page's. */
  private readonly absolute: (raw: string) => string;
  private readonly maxNodes: number;

  constructor(
    private readonly out: Document,
    private readonly formats: ReadonlySet<RichPasteFormat>,
    options: PasteToRichOptions,
  ) {
    this.allowedBits = INLINE.reduce((bits, [bit, , format]) => (formats.has(format) ? bits | bit : bits), 0);
    // The sanitizer's own checks, run here so a rejected link keeps only its text and a rejected image its alt text.
    const base = options.base === undefined ? {} : { base: options.base };
    this.resolveLink = linkUrlResolver({ ...base, ...(options.protocols === undefined ? {} : { protocols: options.protocols }) });
    this.resolveImage = linkUrlResolver({ ...base, protocols: options.dataImages === true ? ['https:', 'http:', 'data:'] : ['https:', 'http:'] });
    this.absolute = options.base === undefined ? (raw) => new URL(raw.trim()).href : (raw) => raw;
    this.maxNodes = positive(options.maxNodes, 200_000, 'maxNodes');
  }

  private remove(reason: RichRemovalReason, name: string): void {
    const key = `${reason} ${name}`;
    this.removals.set(key, { reason, name, count: (this.removals.get(key)?.count ?? 0) + 1 });
  }

  /** A link's address, absolute and scheme-checked, with click-tracking redirects (Google, Outlook Safe Links) unwrapped; `null` when unsafe. */
  private link(element: Element): string | null {
    const raw = (element.getAttribute('href') ?? '').trim();
    if (raw === '') return null;
    try {
      return unwrapRedirect(new URL(this.resolveLink(this.absolute(raw)))).href;
    } catch {
      this.remove('unsafe-link', scheme(raw));
      return null;
    }
  }

  /** Whether an image may be kept: an absolute, scheme-checked address. */
  private safeImage(image: Element): boolean {
    const raw = image.getAttribute('src') ?? '';
    try {
      this.resolveImage(this.absolute(raw));
      return true;
    } catch {
      this.remove('unsafe-image', scheme(raw));
      return false;
    }
  }

  private el(tag: string, ...children: Node[]): HTMLElement {
    const element = this.out.createElement(tag);
    element.append(...children);
    return element;
  }

  /** Whether reading may go on: a budget on source nodes, so huge or hostile input stays bounded. */
  private count(): boolean {
    if (this.nodes >= this.maxNodes) {
      this.truncated = true;
      return false;
    }
    this.nodes += 1;
    return true;
  }

  /**
   * Converts `nodes` into blocks inside `parent`. Inline content goes straight into `parent` when it is an
   * item (a list item, a table cell), or into paragraphs otherwise.
   */
  blocks(nodes: readonly Node[], parent: HTMLElement | DocumentFragment, ctx: Ctx): void {
    const item = parent.nodeType === 1 && ITEMS.has((parent as Element).localName);
    let runs: Run[] = [];
    const flush = (): void => {
      if (item) {
        // Paragraphs in a list item or a cell (Google Docs writes them) are its lines.
        this.line(runs, parent as HTMLElement);
      } else {
        const paragraph = this.out.createElement('p');
        if (this.emit(runs, paragraph)) parent.append(paragraph);
      }
      runs = [];
    };
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index] as Node;
      if (isWordListParagraph(node)) {
        flush();
        index += this.wordList(nodes, index, parent, ctx) - 1;
        continue;
      }
      if (node.nodeType !== 1 || !BLOCKS.has((node as Element).localName)) {
        const wrapper = node.nodeType === 1 ? this.wrapper(node as Element, ctx) : null;
        if (wrapper === null) this.inline(node, ctx, runs);
        else {
          // An inline element around blocks (Google Docs wraps the whole document in a <b>): its formats
          // and link carry over, and its blocks stay blocks.
          flush();
          this.blocks(Array.from(node.childNodes), parent, wrapper);
        }
        continue;
      }
      const element = node as Element;
      const tag = element.localName;
      const style = styleOf(element);
      if (isHidden(element, style) || !this.count()) continue;
      if (item && (tag === 'p' || (tag === 'div' && !isCodeContainer(tag, style)))) {
        // A paragraph in an item: a line of the item.
        flush();
        runs = this.runsOf(element, ctx);
        flush();
        continue;
      }
      flush();
      this.block(element, tag, style, parent, ctx);
    }
    flush();
  }

  /** The context inside an inline element that holds blocks, or `null` for one that holds only inline content. */
  private wrapper(element: Element, ctx: Ctx): Ctx | null {
    if (ctx.depth >= MAX_DEPTH || element.querySelector(BLOCK_SELECTOR) === null) return null;
    const tag = element.localName;
    const style = styleOf(element);
    if (SKIP.has(tag) || element.namespaceURI !== 'http://www.w3.org/1999/xhtml' || isHidden(element, style)) return null;
    return this.inner(element, tag, style, ctx);
  }

  /** The formats and link inside an inline element. */
  private inner(element: Element, tag: string, style: ReadonlyMap<string, string>, ctx: Ctx): Ctx {
    const href = tag === 'a' && ctx.href === null && this.formats.has('link') ? this.link(element) : ctx.href;
    // CSS wins over the tag, so Google Docs' wrapper, a `<b style="font-weight:normal">`, is not bold.
    return { bits: bitsOf(ctx.bits, tag, style), href, depth: ctx.depth + 1 };
  }

  private block(element: Element, tag: string, style: ReadonlyMap<string, string>, parent: HTMLElement | DocumentFragment, ctx: Ctx): void {
    const deeper: Ctx = { ...ctx, depth: ctx.depth + 1 };
    if (ctx.depth >= MAX_DEPTH) {
      this.paragraph([{ kind: 'text', text: element.textContent, bits: 0, href: null }], parent);
      return;
    }
    if (tag === 'pre' || tag === 'listing' || tag === 'xmp' || isCodeContainer(tag, style)) {
      this.codeBlock(codeText(element, (skipped) => { if (!QUIET.has(skipped)) this.remove('unsafe-element', skipped); }), parent);
      return;
    }
    if (HEADINGS.has(tag)) {
      // Headings are bold already: bold inside one is noise.
      const runs = this.runsOf(element, deeper).map((run) => ({ ...run, bits: run.bits & ~STRONG }));
      if (this.formats.has('heading')) {
        const heading = this.out.createElement(tag);
        if (this.emit(runs, heading)) parent.append(heading);
      } else this.paragraph(runs.map((run) => ({ ...run, bits: run.bits | STRONG })), parent);
      return;
    }
    if (tag === 'ul' || tag === 'ol' || tag === 'menu' || tag === 'dir') {
      this.list(element, tag === 'ol', parent, deeper);
      return;
    }
    if (tag === 'li') {
      // A list item outside a list: the list is implied.
      this.list(element, false, parent, deeper, [element]);
      return;
    }
    if (tag === 'blockquote') {
      if (!this.formats.has('quote')) {
        this.blocks(Array.from(element.childNodes), parent, deeper);
        return;
      }
      const quote = this.out.createElement('blockquote');
      this.blocks(Array.from(element.childNodes), quote, deeper);
      if (quote.firstChild !== null) parent.append(quote);
      return;
    }
    if (tag === 'table') {
      this.table(element, parent, deeper);
      return;
    }
    if (tag === 'hr') {
      if (this.formats.has('rule')) parent.append(this.out.createElement('hr'));
      return;
    }
    if (tag === 'dl') {
      // A description list keeps its terms and details as paragraphs: few editors have one.
      this.blocks(Array.from(element.childNodes), parent, deeper);
      return;
    }
    // Paragraphs, divisions and sections: their inline content forms paragraphs, their blocks stay blocks.
    this.blocks(Array.from(element.childNodes), parent, deeper);
  }

  /** A new line of an item: after a line break when the item already ends in text. */
  private line(runs: readonly Run[], item: HTMLElement): void {
    const last = item.lastChild;
    if (last !== null && hasContent(runs) && (last.nodeType !== 1 || !LINE_ENDS.has((last as Element).localName))) item.append(this.out.createElement('br'));
    this.emit(runs, item);
  }

  /** A paragraph for `runs` (or the item's own line), when they hold anything. */
  private paragraph(runs: readonly Run[], parent: HTMLElement | DocumentFragment): void {
    if (parent.nodeType === 1 && ITEMS.has((parent as Element).localName)) {
      this.line(runs, parent as HTMLElement);
      return;
    }
    const paragraph = this.out.createElement('p');
    if (this.emit(runs, paragraph)) parent.append(paragraph);
  }

  private codeBlock(text: string, parent: HTMLElement | DocumentFragment): void {
    if (text.trim() === '') return;
    if (this.formats.has('codeBlock')) {
      parent.append(this.el('pre', this.el('code', this.out.createTextNode(text))));
      return;
    }
    // A line per paragraph, its spaces kept as no-break spaces so indentation survives.
    for (const line of text.split('\n')) {
      this.paragraph([{ kind: 'text', text: line.replace(/ /g, '\u00A0'), bits: CODE, href: null }], parent);
    }
  }

  private list(element: Element, ordered: boolean, parent: HTMLElement | DocumentFragment, ctx: Ctx, items?: readonly Element[]): void {
    const start = ordered ? Number.parseInt(element.getAttribute('start') ?? '1', 10) : 1;
    const first = Number.isFinite(start) ? start : 1;
    if (!this.formats.has('list')) {
      // Each item a paragraph after its marker, nested lists after their item.
      let number = first;
      for (const child of items ?? Array.from(element.childNodes)) {
        if (child.nodeType !== 1 || (child as Element).localName !== 'li') {
          this.blocks([child], parent, ctx);
          continue;
        }
        const marker: Run = { kind: 'text', text: ordered ? `${String(number)}. ` : '\u2022 ', bits: 0, href: null };
        number += 1;
        const own = Array.from(child.childNodes).filter((node) => !(node.nodeType === 1 && /^(?:ul|ol|menu|dir)$/.test((node as Element).localName)));
        const runs = own.flatMap((node) => (node.nodeType === 1 && BLOCKS.has((node as Element).localName) ? [...this.runsOf(node as Element, ctx), BREAK] : this.inlineRuns(node, ctx)));
        this.paragraph([marker, ...trimBreaks(runs)], parent);
        for (const nested of Array.from((child as Element).children)) if (/^(?:ul|ol|menu|dir)$/.test(nested.localName)) this.list(nested, nested.localName === 'ol', parent, ctx);
      }
      return;
    }
    const list = this.out.createElement(ordered ? 'ol' : 'ul');
    if (ordered && first !== 1) list.setAttribute('start', String(first));
    for (const child of items ?? Array.from(element.childNodes)) {
      if (child.nodeType === 1 && (child as Element).localName === 'li') {
        const li = this.out.createElement('li');
        this.blocks(Array.from(child.childNodes), li, ctx);
        list.append(li);
        continue;
      }
      // Google Docs nests a list as the sibling of its item, not inside it; text between items is an item.
      const host = list.lastElementChild ?? list.appendChild(this.out.createElement('li'));
      this.blocks([child], host as HTMLElement, ctx);
    }
    // Items with nothing in them are left out; a list with no items is too.
    for (const li of Array.from(list.children)) if (li.firstChild === null) li.remove();
    if (list.firstChild !== null) parent.append(list);
  }

  /**
   * Word writes lists as paragraphs with `mso-list: l0 level2`, and each marker (`1.`, `·`) as
   * text in a span hidden with `mso-list: Ignore`. Rebuilds the consecutive list paragraphs
   * from `nodes[start]` as nested lists. Returns how many nodes they took.
   */
  private wordList(nodes: readonly Node[], start: number, parent: HTMLElement | DocumentFragment, ctx: Ctx): number {
    const roots: WordList[] = [];
    const stack: { level: number; list: WordList }[] = [];
    let consumed = 0;
    const flat = !this.formats.has('list');
    for (let index = start; index < nodes.length; index += 1) {
      const node = nodes[index] as Node;
      if (node.nodeType === 8 || (node.nodeType === 3 && (node as Text).data.trim() === '')) continue;
      if (!isWordListParagraph(node)) break;
      // Taken even past the node budget, so the caller always moves on.
      consumed = index - start + 1;
      if (!this.count()) break;
      const level = Number(WORD_LIST.exec(node.getAttribute('style') as string)?.[1]);
      const marker = (node.querySelector('[style*="mso-list"][style*="gnore"]')?.textContent ?? '').replace(/\s+/g, '');
      const ordered = ORDERED_MARKER.exec(marker);
      const runs = this.runsOf(node, ctx);
      if (flat) {
        // Word's own marker, as Word shows it.
        const shown = ordered !== null ? `${marker} ` : '\u2022 ';
        this.paragraph([{ kind: 'text', text: shown, bits: 0, href: null }, ...runs], parent);
        continue;
      }
      while (stack.length > 0 && (stack[stack.length - 1] as { level: number }).level > level) stack.pop();
      let top = stack[stack.length - 1];
      if (top !== undefined && top.level === level && top.list.ordered !== (ordered !== null)) {
        stack.pop(); // The list type changed: a new list at this level.
        top = stack[stack.length - 1];
      }
      if (top === undefined || top.level < level) {
        const number = ordered !== null && /^\d+$/.test(ordered[1] as string) ? Number(ordered[1]) : 1;
        const list: WordList = { ordered: ordered !== null, start: number, items: [] };
        const host = top?.list.items[top.list.items.length - 1];
        if (host === undefined) roots.push(list);
        else host.nested.push(list);
        top = { level, list };
        stack.push(top);
      }
      top.list.items.push({ runs, nested: [] });
    }
    for (const list of roots) this.writeWordList(list, parent);
    return consumed;
  }

  /** Writes a rebuilt Word list. An item with nothing in it is left out, unless it holds a nested list. */
  private writeWordList(list: WordList, parent: Node): void {
    const element = this.out.createElement(list.ordered ? 'ol' : 'ul');
    if (list.ordered && list.start !== 1) element.setAttribute('start', String(list.start));
    for (const item of list.items) {
      const li = this.out.createElement('li');
      this.emit(item.runs, li);
      for (const nested of item.nested) this.writeWordList(nested, li);
      if (li.firstChild !== null) element.append(li);
    }
    if (element.firstChild !== null) parent.appendChild(element);
  }

  private table(table: Element, parent: HTMLElement | DocumentFragment, ctx: Ctx): void {
    const rows = Array.from(table.querySelectorAll('tr')).filter((row) => row.closest('table') === table);
    const caption = Array.from(table.children).find((child) => child.localName === 'caption');
    if (!this.formats.has('table') || isLayoutTable(table)) {
      // Its content in reading order: the caption, then each cell's blocks.
      if (caption !== undefined) this.blocks(Array.from(caption.childNodes), parent, ctx);
      for (const row of rows) for (const cell of Array.from(row.children)) if (cell.localName === 'td' || cell.localName === 'th') this.blocks(Array.from(cell.childNodes), parent, ctx);
      return;
    }
    const out = this.out.createElement('table');
    if (caption !== undefined) {
      const element = this.out.createElement('caption');
      this.blocks(Array.from(caption.childNodes), element, ctx);
      if (element.firstChild !== null) out.append(element);
    }
    const sections = new Map<Element, HTMLElement>();
    for (const row of rows) {
      if (!this.count()) break;
      // The HTML parser puts every row in a section (a <tbody> when none is written).
      const group = row.parentElement as Element;
      let section = sections.get(group);
      if (section === undefined) {
        section = this.out.createElement(group.localName === 'thead' || group.localName === 'tfoot' ? group.localName : 'tbody');
        sections.set(group, section);
        out.append(section);
      }
      const tr = this.out.createElement('tr');
      for (const cell of Array.from(row.children)) {
        if (cell.localName !== 'td' && cell.localName !== 'th') continue;
        const element = this.out.createElement(cell.localName);
        for (const attribute of ['colspan', 'rowspan', 'scope']) {
          const value = cell.getAttribute(attribute);
          if (value !== null) element.setAttribute(attribute, value);
        }
        // Header cells are bold already.
        this.blocks(Array.from(cell.childNodes), element, cell.localName === 'th' ? { ...ctx, bits: ctx.bits & ~STRONG } : ctx);
        if (cell.localName === 'th') stripBold(element);
        tr.append(element);
      }
      section.append(tr);
    }
    if (rows.length > 0) parent.append(out);
  }

  /** The inline content of `element` as runs: its blocks become lines, separated by line breaks. */
  private runsOf(element: Element, ctx: Ctx): Run[] {
    const runs: Run[] = [];
    const inner = { ...ctx, bits: bitsOf(ctx.bits, element.localName, styleOf(element)) };
    for (const child of Array.from(element.childNodes)) {
      if (child.nodeType === 1 && BLOCKS.has((child as Element).localName) && (child as Element).localName !== 'br') {
        const element = child as Element;
        if (isHidden(element, styleOf(element))) continue;
        if (runs.length > 0) runs.push(BREAK);
        runs.push(...this.runsOf(element, { ...inner, depth: inner.depth + 1 }));
        runs.push(BREAK);
        continue;
      }
      this.inline(child, inner, runs);
    }
    return trimBreaks(runs);
  }

  private inlineRuns(node: Node, ctx: Ctx): Run[] {
    const runs: Run[] = [];
    this.inline(node, ctx, runs);
    return runs;
  }

  /** Inline content into runs: text with its formats and link, line breaks and images. */
  private inline(node: Node, ctx: Ctx, runs: Run[]): void {
    if (!this.count()) return;
    if (node.nodeType === 3) {
      runs.push({ kind: 'text', text: (node as Text).data, bits: ctx.bits, href: ctx.href });
      return;
    }
    if (node.nodeType !== 1) return;
    const element = node as Element;
    const tag = element.localName;
    const style = styleOf(element);
    if (SKIP.has(tag) || element.namespaceURI !== 'http://www.w3.org/1999/xhtml') {
      if (!QUIET.has(tag)) this.remove('unsafe-element', tag);
      return;
    }
    if (isHidden(element, style)) return;
    if (tag === 'br') {
      runs.push({ kind: 'break', bits: ctx.bits, href: ctx.href });
      return;
    }
    if (tag === 'img') {
      if (!this.formats.has('image') || this.safeImage(element)) runs.push({ kind: 'image', image: element, bits: ctx.bits, href: ctx.href });
      else runs.push({ kind: 'text', text: element.getAttribute('alt') ?? '', bits: ctx.bits, href: ctx.href });
      return;
    }
    if (ctx.depth >= MAX_DEPTH) {
      runs.push({ kind: 'text', text: element.textContent, bits: ctx.bits, href: ctx.href });
      return;
    }
    const inner = this.inner(element, tag, style, ctx);
    if (BLOCKS.has(tag)) {
      // A block inside inline content (a heading's paragraphs, a link around a division): a line of its own.
      runs.push(BREAK, ...this.runsOf(element, inner), BREAK);
      return;
    }
    for (const child of Array.from(element.childNodes)) this.inline(child, inner, runs);
  }

  /**
   * Writes `runs` into `target` as minimal, canonical markup: links outermost, then the formats in a
   * fixed order, each over the longest stretch it covers. Whitespace collapses as the browser shows it.
   * Returns whether anything was written.
   */
  emit(runs: readonly Run[], target: Node): boolean {
    const cleaned = collapse(
      runs.map((run) => {
        const bits = run.bits & this.allowedBits;
        const href = this.formats.has('link') ? run.href : null;
        return run.kind === 'image' && !this.formats.has('image')
          ? ({ kind: 'text', text: run.image.getAttribute('alt') ?? '', bits, href } as const)
          : { ...run, bits, href };
      }),
    );
    if (cleaned.length === 0) return false;
    this.write(cleaned, target, 0);
    return true;
  }

  private write(runs: readonly Run[], target: Node, level: number): void {
    if (level === 0) {
      for (const group of groups(runs, (run) => run.href)) {
        const href = (group[0] as Run).href;
        if (href === null) this.write(group, target, 1);
        else {
          const link = this.out.createElement('a');
          link.setAttribute('href', href);
          this.write(group, link, 1);
          target.appendChild(link);
        }
      }
      return;
    }
    const format = INLINE[level - 1];
    if (format === undefined) {
      for (const run of runs) {
        if (run.kind === 'text') target.appendChild(this.out.createTextNode(run.text));
        else if (run.kind === 'break') target.appendChild(this.out.createElement('br'));
        else target.appendChild(copyImage(this.out, run.image));
      }
      return;
    }
    const [bit, tag] = format;
    for (const group of groups(runs, (run) => (run.bits & bit) !== 0)) {
      if (((group[0] as Run).bits & bit) === 0) this.write(group, target, level + 1);
      else {
        const element = this.out.createElement(tag);
        this.write(group, element, level + 1);
        target.appendChild(element);
      }
    }
  }
}

const BREAK: Run = { kind: 'break', bits: 0, href: null };

const hasContent = (runs: readonly Run[]): boolean => runs.some((run) => run.kind === 'image' || (run.kind === 'text' && /[^\s]/.test(run.text)));

function trimBreaks(runs: Run[]): Run[] {
  let start = 0;
  let end = runs.length;
  while (start < end && (runs[start] as Run).kind === 'break') start += 1;
  while (end > start && (runs[end - 1] as Run).kind === 'break') end -= 1;
  return runs.slice(start, end);
}

/** Maximal stretches of runs with the same key. */
function groups(runs: readonly Run[], key: (run: Run) => unknown): Run[][] {
  const out: Run[][] = [];
  let last: unknown;
  for (const run of runs) {
    const value = key(run);
    const current = out[out.length - 1];
    if (current !== undefined && value === last) current.push(run);
    else out.push([run]);
    last = value;
  }
  return out;
}

/**
 * Whitespace as the browser shows it: runs of it are one space, none at the start or end of a line,
 * and line breaks without text after them (or several in a row at the edges) are left out.
 * Spaces take no formats, so formatting never starts or ends with one.
 */
function collapse(runs: readonly Run[]): Run[] {
  const out: Run[] = [];
  let lineStart = true;
  let pendingSpace = false;
  for (const run of runs) {
    if (run.kind === 'break') {
      pendingSpace = false;
      out.push(run);
      lineStart = true;
      continue;
    }
    if (run.kind === 'image') {
      if (pendingSpace) out.push({ kind: 'text', text: ' ', bits: 0, href: null });
      pendingSpace = false;
      out.push(run);
      lineStart = false;
      continue;
    }
    const parts = run.text.split(/[ \t\n\r\f]+/);
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index] as string;
      if (index > 0 && !lineStart) pendingSpace = true;
      if (part === '') continue;
      if (pendingSpace) {
        // A space takes the formats and link on both sides of it, so "<b>on</b> <b>Friday</b>" stays one bold run.
        // A pending space always follows text or an image on the same line.
        const last = out[out.length - 1] as Run;
        out.push({ kind: 'text', text: ' ', bits: last.bits & run.bits, href: last.href === run.href ? run.href : null });
      }
      pendingSpace = false;
      out.push({ kind: 'text', text: part, bits: run.bits, href: run.href });
      lineStart = false;
    }
  }
  // Join neighbouring text with the same formats and link, so the output is canonical.
  const merged: Run[] = [];
  for (const run of trimBreaks(out)) {
    const last = merged[merged.length - 1];
    if (run.kind === 'text' && last?.kind === 'text' && last.bits === run.bits && last.href === run.href) merged[merged.length - 1] = { ...last, text: last.text + run.text };
    else merged.push(run);
  }
  return hasContent(merged) ? merged : [];
}

/** An image with what describes it, never its styles or event handlers. */
function copyImage(doc: Document, image: Element): HTMLElement {
  const out = doc.createElement('img');
  for (const name of ['src', 'alt', 'title', 'width', 'height']) {
    const value = image.getAttribute(name);
    if (value !== null) out.setAttribute(name, value);
  }
  return out;
}

/** Bold inside a header cell is noise: the cell is bold already. */
function stripBold(cell: Element): void {
  for (const strong of Array.from(cell.querySelectorAll('strong'))) strong.replaceWith(...Array.from(strong.childNodes));
  cell.normalize();
}

/* ---------------------------------------------------------------- Public */

function resolveFormats(formats: readonly RichPasteFormat[] | undefined): ReadonlySet<RichPasteFormat> {
  if (formats === undefined) return new Set(RICH_PASTE_FORMATS);
  const value: unknown = formats;
  if (!Array.isArray(value) || !value.every((format) => (RICH_PASTE_FORMATS as readonly unknown[]).includes(format))) {
    throw copyFailure('invalid-payload', `\`formats\` must be an array of: ${RICH_PASTE_FORMATS.join(', ')}.`);
  }
  return new Set(formats);
}

const escapeHtml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Plain text as rich content: a paragraph per block of lines, a line break per line. Needs no DOM. */
function fromText(text: string, maxLength: number): RichPaste {
  const normalized = text.replace(/\r\n?/g, '\n');
  const paragraphs = normalized
    .split(/\n[ \t]*\n+/)
    .map((block) => block.split('\n').map((line) => escapeHtml(line.trim())).filter((line) => line !== ''))
    .filter((lines) => lines.length > 0);
  let html = '';
  let truncated = false;
  for (const lines of paragraphs) {
    const paragraph = `<p>${lines.join('<br>')}</p>`;
    if (html.length + paragraph.length > maxLength) {
      truncated = true;
      break;
    }
    html += paragraph;
  }
  return { html, text: normalized.trim(), removed: [], truncated, source: 'text' };
}

/**
 * Cleans what was pasted into semantic, safe HTML for a rich-text editor: the HTML Google Docs,
 * Word, Outlook, Gmail, Notion and web pages put on the clipboard becomes paragraphs, headings,
 * lists, quotes, code blocks, tables, links and images, with bold, italic, underline,
 * strikethrough, code, superscript and subscript as tags (`<strong>`, `<em>`, ...).
 *
 * - Formatting set by CSS (`font-weight: 700`, `font-style: italic`) becomes tags, and every
 *   style, class and id is left out: pasted content takes the editor's look, not the source's.
 * - Word's paragraph lists become real lists; Google Docs' wrappers, empty spacers and hidden
 *   markers go. Layout tables (mail) become their content.
 * - The output is canonical (the same content always gives the same HTML) and goes through the
 *   same sanitizer as {@link prepareRich}: only allowlisted elements and attributes, links and
 *   images with absolute, scheme-checked URLs. `removed` says what was left out.
 * - `formats` limits the output to what your editor holds, keeping all of the text.
 *
 * Plain text (no HTML on the clipboard) becomes paragraphs and line breaks. Returns `null` when
 * there is nothing to paste. HTML needs `DOMParser` (any browser, or jsdom); without one, the
 * plain text is used.
 *
 * @example
 * // TipTap / ProseMirror
 * editorProps: { transformPastedHTML: (html) => pasteToRich({ html })?.html ?? '' }
 */
export function pasteToRich(source: RichPasteSource, options: PasteToRichOptions = {}): RichPaste | null {
  const formats = resolveFormats(options.formats); // invalid options are a programming error: they throw
  const maxLength = options.maxLength ?? 1_000_000;
  const html = source.html ?? null;
  const text = source.text ?? null;
  if (html !== null && html.trim() !== '' && typeof DOMParser !== 'undefined') {
    // Inert: scripts never run and nothing is fetched. Its nodes are only read.
    const parsed = parseInertHtml(`<!doctype html><body>${html.slice(0, MAX_INPUT)}`);
    // Built in a document with no address, so relative links resolve only against `base`.
    const out = parsed.implementation.createHTMLDocument('');
    const cleaner = new Cleaner(out, formats, options);
    const fragment = out.createDocumentFragment();
    cleaner.blocks(Array.from(parsed.body.childNodes), fragment, { bits: 0, href: null, depth: 0 });
    const result = prepareRich(fragment, {
      styles: 'none',
      images: formats.has('image') ? 'keep' : 'alt',
      ...(options.base === undefined ? {} : { base: options.base }),
      ...(options.protocols === undefined ? {} : { protocols: options.protocols }),
      ...(options.dataImages === undefined ? {} : { dataImages: options.dataImages }),
      ...(options.maxElements === undefined ? {} : { maxElements: options.maxElements }),
      maxLength,
      ...(options.text === undefined ? {} : { text: options.text }),
    });
    if (result.html !== '') {
      // Never the same entry twice: the sanitizer only sees what the cleaner kept.
      const removed = [...cleaner.removals.values(), ...result.removed];
      return { ...result, removed, truncated: result.truncated || cleaner.truncated || html.length > MAX_INPUT, source: 'html' };
    }
  }
  if (text === null || text.trim() === '') return null;
  const value: unknown = maxLength;
  if (!(Number.isInteger(value) && maxLength > 0)) throw copyFailure('invalid-payload', '`maxLength` must be a positive integer.');
  return fromText(text, maxLength);
}

/** Structural paste event: a DOM `ClipboardEvent` and React's `onPaste` event both fit. */
export interface RichPasteEvent {
  readonly clipboardData: { getData(format: string): string } | null;
  readonly currentTarget: EventTarget | null;
  readonly target: EventTarget | null;
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}

export interface PasteAsRichOptions extends PasteToRichOptions {
  /**
   * Called with the cleaned content before it is inserted. Return `false` to insert it yourself
   * (through your editor's API, say): the browser's paste is still prevented.
   */
  readonly onPaste?: (pasted: RichPaste) => boolean | undefined;
}

/** The editable element a paste lands in: the handler's element when it is `contenteditable`. */
function editableHost(event: RichPasteEvent): HTMLElement | null {
  const target: unknown = event.currentTarget ?? event.target;
  if (typeof target !== 'object' || target === null || (target as Partial<Node>).nodeType !== 1) return null;
  const element = target as HTMLElement;
  return element.isContentEditable ? element : null;
}

/**
 * Inserts HTML at the selection in an editable element, as a paste would: the browser's undo
 * (Ctrl/Cmd+Z) still works and `input` events fire. Without a selection inside the element,
 * the HTML goes at its end.
 */
function insertHtml(host: HTMLElement, html: string): void {
  const doc = host.ownerDocument;
  const selection = doc.getSelection();
  const current = selection !== null && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  // Where it goes: the selection in the element, or its end. Kept across focusing, which can move the
  // caret, and insertHTML acts in the focused editing host.
  let range: Range;
  if (current !== null && host.contains(current.commonAncestorContainer)) range = current.cloneRange();
  else {
    range = doc.createRange();
    range.selectNodeContents(host);
    range.collapse(false);
  }
  if (doc.activeElement !== host) host.focus();
  selection?.removeAllRanges();
  selection?.addRange(range);
  try {
    // The only way to keep the native undo stack. The HTML is sanitized: allowlisted elements and
    // attributes only, scheme-checked URLs, no styles, scripts or event handlers.
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- no replacement keeps undo history
    if (doc.activeElement === host && doc.execCommand('insertHTML', false, html)) return;
  } catch {
    // Fall through to the manual insertion.
  }
  range.deleteContents();
  // codeql[js/xss] Sanitized above: allowlisted elements and attributes, scheme-checked URLs.
  const fragment = range.createContextualFragment(html);
  // Never empty: an empty cleaning result is not inserted.
  const last = fragment.lastChild as Node;
  range.insertNode(fragment);
  range.setStartAfter(last);
  range.collapse(true);
  const view = doc.defaultView;
  host.dispatchEvent(
    view !== null && typeof view.InputEvent === 'function'
      ? new view.InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' })
      : new Event('input', { bubbles: true }),
  );
}

/**
 * A paste handler for `contenteditable` elements: what is pasted from Google Docs, Word, mail or
 * a web page goes in as clean, semantic HTML (see {@link pasteToRich}), with undo intact. Plain-text
 * pastes are left to the browser. Returns whether it handled the paste.
 *
 * Rich-text editors (TipTap, ProseMirror, Lexical, Quill) have their own paste pipelines: use
 * {@link pasteToRich} in their hook instead, so the editor keeps its document model.
 *
 * @example
 * <div contentEditable onPaste={pasteAsRich} />
 * <div contentEditable onPaste={(event) => pasteAsRich(event, { formats: ['bold', 'italic', 'link', 'list'] })} />
 */
export function pasteAsRich(event: RichPasteEvent, options?: PasteAsRichOptions): boolean {
  if (event.defaultPrevented || event.clipboardData === null) return false;
  const host = editableHost(event);
  if (host === null) return false;
  const html = event.clipboardData.getData('text/html');
  if (html === '') return false;
  let pasted: RichPaste | null;
  try {
    pasted = pasteToRich({ html, text: event.clipboardData.getData('text/plain') }, options);
  } catch {
    return false; // Invalid options or an unexpected failure: the native paste still happens.
  }
  if (pasted?.source !== 'html') return false;
  event.preventDefault();
  if (options?.onPaste?.(pasted) === false) return true;
  insertHtml(host, pasted.html);
  return true;
}
