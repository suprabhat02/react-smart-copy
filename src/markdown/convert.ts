import { copyFailure } from '../core/errors';
import { CODE, EM, STRIKE, STRONG, renderInline, type InlineOptions, type Run } from './inline';
import { DEFAULT_IMAGE_PROTOCOLS, DEFAULT_LINK_PROTOCOLS, safeUrl } from './url';
import { parseInertHtml } from '../core/inert-html';

/* ------------------------------------------------------------------ Types */

export interface MarkdownOptions {
  /**
   * Images: `'alt'` (default) keeps their alt text, so nothing is fetched when the
   * Markdown is rendered (pasted images are often tracking pixels or expiring URLs);
   * `'keep'` writes `![alt](src)` for allowed URLs; `'drop'` removes them.
   */
  readonly images?: 'alt' | 'keep' | 'drop';
  /** Links: `'keep'` (default) writes `[text](url)` for allowed URLs; `'text'` keeps only their text. */
  readonly links?: 'keep' | 'text';
  /** URL schemes allowed in links. Default `['http:', 'https:', 'mailto:']`. */
  readonly linkProtocols?: readonly string[];
  /** URL schemes allowed in images. Default `['https:', 'http:']`; `data:` is never allowed by default. */
  readonly imageProtocols?: readonly string[];
  /** Resolves relative links and images. Without it, they keep only their text. */
  readonly baseUrl?: string;
  /** List marker for bullet lists. Default `'-'`. */
  readonly bullet?: '-' | '*' | '+';
  /** Hard line breaks as a trailing backslash (default, survives editors that trim spaces) or two spaces. */
  readonly hardBreak?: 'backslash' | 'spaces';
  /** Input size cap in characters; longer HTML is cut and `truncated` is set. Default 16 MiB. */
  readonly maxLength?: number;
  /** Elements and text nodes visited; the rest is left out and `truncated` is set. Default 200,000. */
  readonly maxNodes?: number;
  /** Nesting depth; deeper content keeps its text but loses its formatting. Default 200. */
  readonly maxDepth?: number;
}

export interface MarkdownResult {
  readonly markdown: string;
  /** Whether content was left out because a limit was reached. */
  readonly truncated: boolean;
}

export const DEFAULT_MARKDOWN_MAX_LENGTH = 16 * 1024 * 1024;
export const DEFAULT_MARKDOWN_MAX_NODES = 200_000;
export const DEFAULT_MARKDOWN_MAX_DEPTH = 200;

/** Merged-cell expansion cap for one table, so a tiny table can't claim millions of cells. */
const MAX_TABLE_CELLS = 100_000;
const MAX_COLSPAN = 1000;

export interface Resolved {
  readonly images: 'alt' | 'keep' | 'drop';
  readonly links: 'keep' | 'text';
  readonly linkProtocols: readonly string[];
  readonly imageProtocols: readonly string[];
  readonly baseUrl: string | undefined;
  readonly bullet: string;
  readonly hardBreak: string;
  readonly maxLength: number;
  readonly maxNodes: number;
  readonly maxDepth: number;
}

function limit(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (value === Infinity || (Number.isInteger(value) && value > 0)) return value;
  throw copyFailure('invalid-payload', `\`${name}\` must be a positive integer or Infinity (received ${String(value)}).`);
}

export function resolveOptions(options: MarkdownOptions): Resolved {
  return {
    images: options.images ?? 'alt',
    links: options.links ?? 'keep',
    linkProtocols: options.linkProtocols ?? DEFAULT_LINK_PROTOCOLS,
    imageProtocols: options.imageProtocols ?? DEFAULT_IMAGE_PROTOCOLS,
    baseUrl: options.baseUrl,
    bullet: options.bullet ?? '-',
    hardBreak: options.hardBreak === 'spaces' ? '  \n' : '\\\n',
    maxLength: limit(options.maxLength, DEFAULT_MARKDOWN_MAX_LENGTH, 'maxLength'),
    maxNodes: limit(options.maxNodes, DEFAULT_MARKDOWN_MAX_NODES, 'maxNodes'),
    maxDepth: limit(options.maxDepth, DEFAULT_MARKDOWN_MAX_DEPTH, 'maxDepth'),
  };
}

/* ------------------------------------------------------------- Elements */

/** Never rendered: scripts, metadata, embedded documents, media and form controls. */
const SKIP = new Set([
  'script', 'style', 'template', 'noscript', 'head', 'title', 'meta', 'link', 'base', 'xml',
  'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'svg', 'math', 'canvas',
  'video', 'audio', 'source', 'track', 'map', 'area',
  'input', 'button', 'select', 'option', 'optgroup', 'textarea', 'datalist', 'output', 'progress', 'meter', 'dialog',
  'o:p',
]);

/** Blocks without margins in the browser: their inline content forms lines, not paragraphs. */
const DIV_LIKE = new Set([
  'address', 'article', 'aside', 'center', 'dd', 'details', 'dir', 'div', 'dl', 'dt', 'fieldset', 'figcaption',
  'figure', 'footer', 'form', 'header', 'hgroup', 'legend', 'li', 'main', 'nav', 'search', 'section', 'summary',
  'caption', 'tbody', 'thead', 'tfoot', 'tr', 'td', 'th', 'colgroup', 'col',
]);

const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
/** Div-like blocks the browser gives vertical margins: their content is set apart as paragraphs. */
const SPACED = new Set(['dl', 'figure', 'fieldset']);
const OTHER_BLOCKS = new Set(['p', 'ul', 'ol', 'menu', 'pre', 'blockquote', 'table', 'hr']);

const isBlock = (tag: string): boolean => DIV_LIKE.has(tag) || HEADINGS.has(tag) || OTHER_BLOCKS.has(tag);

/** Inline CSS, lower-cased: only what changes the Markdown. */
function styleOf(element: Element): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  const attribute = element.getAttribute('style');
  if (attribute === null) return map;
  for (const declaration of attribute.split(';')) {
    const colon = declaration.indexOf(':');
    if (colon > 0) map.set(declaration.slice(0, colon).trim().toLowerCase(), declaration.slice(colon + 1).trim().toLowerCase());
  }
  return map;
}

const MONOSPACE =
  /\b(monospace|courier|consolas|menlo|monaco|source code pro|roboto mono|fira (code|mono)|jetbrains mono|sf mono|cascadia|ubuntu mono|lucida console|inconsolata)\b/;

function isHidden(element: Element, style: ReadonlyMap<string, string>): boolean {
  return (
    element.hasAttribute('hidden') ||
    style.get('display') === 'none' ||
    style.get('visibility') === 'hidden' ||
    style.get('mso-list') === 'ignore' // Word's list markers: the list itself carries them
  );
}

/** Style bits after this element: semantic tags first, then inline CSS, which wins (Google Docs, Word). */
function applyStyle(bits: number, tag: string, style: ReadonlyMap<string, string>): number {
  let next = bits;
  if (tag === 'b' || tag === 'strong') next |= STRONG;
  else if (tag === 'i' || tag === 'em') next |= EM;
  else if (tag === 's' || tag === 'strike' || tag === 'del') next |= STRIKE;
  else if (tag === 'code' || tag === 'kbd' || tag === 'samp' || tag === 'tt') next |= CODE;

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
  if (decoration?.includes('line-through')) next |= STRIKE;
  const family = style.get('font-family');
  if (family !== undefined && MONOSPACE.test(family)) next |= CODE;
  return next;
}

/** A `<div style="white-space: pre; font-family: monospace">`, as code editors (VS Code) write. */
function isCodeContainer(tag: string, style: ReadonlyMap<string, string>): boolean {
  const whiteSpace = style.get('white-space');
  const family = style.get('font-family');
  return tag === 'div' && whiteSpace !== undefined && whiteSpace.startsWith('pre') && family !== undefined && MONOSPACE.test(family);
}

/* --------------------------------------------------------------- Blocks */

/** How a block joins its neighbours: `line` blocks next to each other join with a line break. */
interface Block {
  readonly md: string;
  readonly before: 'line' | 'para';
  readonly after: 'line' | 'para';
  /** A list's top-level marker (`-`, `*`, `.`, `)`): two lists in a row need different ones, or they merge. */
  readonly list?: string;
}

const PARA = { before: 'para', after: 'para' } as const;

interface Ctx {
  readonly style: number;
  /** Style bits that never apply here (bold inside headings and header cells). */
  readonly mask: number;
  readonly href: string | null;
  readonly depth: number;
}

/** Where block elements go. `null` while collecting one line (headings, table cells): blocks become spaces. */
interface BlockSink {
  readonly blocks: Block[];
  /** Turns the inline runs collected so far into paragraphs. */
  readonly flush: () => void;
}

interface VItem {
  readonly blocks: Block[];
  readonly check: boolean | null;
  /** Lists nested under this item (Word lists, built level by level). */
  readonly nested: VList[];
}

interface VList {
  readonly ordered: boolean;
  readonly start: number;
  readonly items: VItem[];
}

const WORD_LIST = /mso-list\s*:\s*(l\d+)\s+level(\d+)/i;
const ORDERED_WORD_MARKER = /^\(?(\d+|[a-z]|[ivxlcdm]+)[.)]/i;

class Converter {
  private nodes = 0;
  truncated = false;

  constructor(private readonly options: Resolved) {}

  private inlineOptions(pipes = false): InlineOptions {
    return { pipes, hardBreak: this.options.hardBreak };
  }

  /** Converts nodes (usually an element's children) into blocks. `kind`: how loose inline content joins. */
  blocks(nodes: readonly Node[], ctx: Ctx, kind: 'line' | 'para'): Block[] {
    const blocks: Block[] = [];
    const runs: Run[] = [];
    // Cleared in place: nested visits hold on to this array.
    const sink: BlockSink = { blocks, flush: () => blocks.push(...this.paragraphs(runs.splice(0), kind)) };
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index] as Node;
      if (isWordListParagraph(node)) {
        sink.flush();
        const [list, consumed] = this.wordList(nodes, index, ctx);
        blocks.push(...list);
        index += consumed - 1;
        continue;
      }
      this.visit(node, ctx, runs, sink);
    }
    sink.flush();
    return blocks;
  }

  /** Visits one node: inline content goes into `runs`; block elements flush them into the sink. */
  private visit(node: Node, ctx: Ctx, runs: Run[], sink: BlockSink | null): void {
    if (this.nodes >= this.options.maxNodes) {
      this.truncated = true;
      return;
    }
    this.nodes += 1;
    if (node.nodeType === 3) {
      runs.push({ kind: 'text', text: (node as Text).data, style: ctx.style & ~ctx.mask, href: ctx.href });
      return;
    }
    if (node.nodeType !== 1) return;
    const element = node as Element;
    const tag = element.localName.toLowerCase();
    const style = styleOf(element);
    if (SKIP.has(tag) || isHidden(element, style)) return;
    if (ctx.depth >= this.options.maxDepth) {
      // Too deep to keep formatting: keep the text, so nothing is lost.
      runs.push({ kind: 'text', text: ` ${element.textContent} `, style: 0, href: ctx.href });
      return;
    }
    if (tag === 'br') {
      runs.push(sink === null ? { kind: 'text', text: ' ', style: 0, href: null } : { kind: 'break' });
      return;
    }
    if (tag === 'img') {
      this.image(element, ctx, runs);
      return;
    }

    const inner: Ctx = { ...ctx, style: applyStyle(ctx.style, tag, style), href: this.link(element, tag, ctx), depth: ctx.depth + 1 };
    if (!isBlock(tag) && !isCodeContainer(tag, style)) {
      for (let child = element.firstChild; child !== null; child = child.nextSibling) this.visit(child, inner, runs, sink);
      return;
    }
    if (sink === null) {
      // Headings and table cells: blocks inside become spaces.
      runs.push({ kind: 'text', text: ' ', style: 0, href: null });
      const flat = tag === 'pre' ? { ...inner, style: inner.style | CODE } : inner;
      for (let child = element.firstChild; child !== null; child = child.nextSibling) this.visit(child, flat, runs, null);
      runs.push({ kind: 'text', text: ' ', style: 0, href: null });
      return;
    }
    sink.flush();
    sink.blocks.push(...this.block(element, tag, style, inner));
  }

  private block(element: Element, tag: string, style: ReadonlyMap<string, string>, ctx: Ctx): Block[] {
    if (tag === 'pre' || isCodeContainer(tag, style)) return this.code(element, ctx);
    if (HEADINGS.has(tag)) return this.heading(element, Number(tag.slice(1)), ctx);
    switch (tag) {
      case 'p':
        return this.blocks(children(element), ctx, 'para');
      case 'ul':
      case 'ol':
      case 'menu':
        return [this.listBlock(this.htmlList(element, tag === 'ol', ctx))];
      case 'blockquote': {
        const inner = join(this.blocks(children(element), ctx, 'para'), this.options.hardBreak);
        return inner === '' ? [] : [{ md: inner.split('\n').map((line) => (line === '' ? '>' : `> ${line}`)).join('\n'), ...PARA }];
      }
      case 'table':
        return this.table(element as HTMLTableElement, ctx);
      case 'hr':
        return [{ md: '---', ...PARA }];
      default: {
        const blocks = this.blocks(children(element), ctx, 'line');
        return SPACED.has(tag) ? spaced(blocks) : blocks;
      }
    }
  }

  /** Inline runs → paragraphs. Two or more line breaks in a row end a paragraph. */
  private paragraphs(runs: readonly Run[], kind: 'line' | 'para'): Block[] {
    const chunks: Run[][] = [[]];
    let breaks = 0;
    for (const run of runs) {
      if (run.kind === 'break') breaks += 1;
      else if (run.kind === 'text' && run.text.trim() === '') {
        // whitespace between breaks doesn't separate them
      } else if (breaks >= 2) {
        chunks.push([]);
        breaks = 0;
      } else breaks = 0;
      (chunks[chunks.length - 1] as Run[]).push(run);
    }
    const rendered = chunks.map((chunk) => renderInline(chunk, this.inlineOptions()));
    const blocks: Block[] = [];
    rendered.forEach((md, index) => {
      if (md === '') return;
      const first = index === 0;
      const last = index === rendered.length - 1;
      blocks.push({ md, before: first ? kind : 'para', after: last ? kind : 'para' });
    });
    // A `line` container with no content (`<div><br></div>`) is a blank line: it separates its neighbours.
    if (blocks.length === 0 && kind === 'line' && runs.some((run) => run.kind === 'break')) blocks.push({ md: '', ...PARA });
    return blocks;
  }

  private heading(element: Element, level: number, ctx: Ctx): Block[] {
    const md = this.inline(element, { ...ctx, mask: ctx.mask | STRONG });
    if (md === '') return [];
    // A trailing `#` would be read as the heading's closing sequence, unless it is already escaped.
    const escaped = /(^|[^\\])(\\\\)*#$/.test(md) ? `${md.slice(0, -1)}\\#` : md;
    return [{ md: `${'#'.repeat(level)} ${escaped}`, ...PARA }];
  }

  /** An element's content as one line of inline Markdown. */
  private inline(element: Element, ctx: Ctx, pipes = false): string {
    const runs: Run[] = [];
    for (let child = element.firstChild; child !== null; child = child.nextSibling) this.visit(child, ctx, runs, null);
    return renderInline(runs, this.inlineOptions(pipes));
  }

  private image(element: Element, ctx: Ctx, runs: Run[]): void {
    const { images, imageProtocols, baseUrl } = this.options;
    if (images === 'drop') return;
    const alt = (element.getAttribute('alt') ?? '').replace(/\s+/g, ' ').trim();
    const src = images === 'keep' ? safeUrl(element.getAttribute('src') ?? '', imageProtocols, baseUrl) : null;
    const style = ctx.style & ~ctx.mask;
    if (src !== null) runs.push({ kind: 'image', alt, src, style, href: ctx.href });
    else if (alt !== '') runs.push({ kind: 'text', text: alt, style, href: ctx.href });
  }

  private link(element: Element, tag: string, ctx: Ctx): string | null {
    if (tag !== 'a' || ctx.href !== null || this.options.links === 'text') return ctx.href;
    const href = element.getAttribute('href');
    return href === null ? null : safeUrl(href, this.options.linkProtocols, this.options.baseUrl);
  }

  /* ---------------------------------------------------------------- Code */

  private code(element: Element, ctx: Ctx): Block[] {
    const text = this.codeText(element, ctx.depth)
      .replace(/\r\n?/g, '\n')
      .replace(/\u00a0/g, ' ')
      .replace(/^\n/, '')
      .replace(/\s+$/, '');
    if (text.trim() === '') return [];
    let longest = 0;
    for (const match of text.matchAll(/`+/g)) longest = Math.max(longest, match[0].length);
    const fence = '`'.repeat(Math.max(3, longest + 1));
    return [{ md: `${fence}${language(element)}\n${text}\n${fence}`, ...PARA }];
  }

  /** Text of a code block: line breaks and line-shaped elements (`<div>` per line) become newlines. */
  private codeText(element: Element, depth: number): string {
    let out = '';
    const walk = (node: Node, level: number): void => {
      for (let child = node.firstChild; child !== null; child = child.nextSibling) {
        if (this.nodes >= this.options.maxNodes) {
          this.truncated = true;
          return;
        }
        this.nodes += 1;
        if (child.nodeType === 3) out += (child as Text).data;
        if (child.nodeType !== 1) continue;
        const el = child as Element;
        const tag = el.localName.toLowerCase();
        if (SKIP.has(tag) || isHidden(el, styleOf(el))) continue;
        if (tag === 'br') {
          out += '\n';
          continue;
        }
        const lineShaped = isBlock(tag);
        if (lineShaped && out !== '' && !out.endsWith('\n')) out += '\n';
        if (level >= this.options.maxDepth) out += el.textContent;
        else walk(el, level + 1);
        if (lineShaped && !out.endsWith('\n')) out += '\n';
      }
    };
    walk(element, depth);
    return out;
  }

  /* --------------------------------------------------------------- Lists */

  private listBlock(list: VList): Block {
    const { bullet } = this.options;
    const lines = list.items.map((item, index) => {
      const marker = list.ordered ? `${String(list.start + index)}.` : bullet;
      const check = item.check === null ? '' : item.check ? '[x] ' : '[ ] ';
      const nested = item.nested.map((child) => this.listBlock(child));
      const body = join([...item.blocks, ...nested], this.options.hardBreak, true);
      const indent = ' '.repeat(marker.length + 1);
      const [first = '', ...rest] = body.split('\n');
      const head = `${marker} ${check}${first}`.trimEnd();
      return [head, ...rest.map((line) => (line === '' ? '' : indent + line))].join('\n');
    });
    return { md: lines.join('\n'), ...PARA, list: list.ordered ? '.' : bullet };
  }

  private htmlList(element: Element, ordered: boolean, ctx: Ctx): VList {
    const start = ordered ? Number.parseInt(element.getAttribute('start') ?? '1', 10) : 1;
    const list: VList = { ordered, start: Number.isSafeInteger(start) && start >= 0 && start <= 999_999_999 ? start : 1, items: [] };
    for (let child = element.firstChild; child !== null; child = child.nextSibling) {
      if (child.nodeType === 3 && (child as Text).data.trim() === '') continue;
      const tag = child.nodeType === 1 ? (child as Element).localName.toLowerCase() : '';
      const previous = list.items[list.items.length - 1];
      if ((tag === 'ul' || tag === 'ol' || tag === 'menu') && previous !== undefined) {
        // Google Docs nests lists as siblings of the items: attach to the item before.
        previous.blocks.push(...this.block(child as Element, tag, styleOf(child as Element), { ...ctx, depth: ctx.depth + 1 }));
        continue;
      }
      const nodes = tag === 'li' ? children(child) : [child];
      list.items.push({ blocks: this.blocks(nodes, { ...ctx, depth: ctx.depth + 1 }, 'line'), check: tag === 'li' ? checkState(child as Element) : null, nested: [] });
    }
    return list;
  }

  /**
   * Word writes lists as paragraphs with `mso-list: l0 level2`, and the marker
   * (`1.`, `·`) as text inside a span hidden with `mso-list: Ignore`. Collects
   * the consecutive list paragraphs from `nodes[start]` into nested lists.
   * Returns the list blocks and how many nodes they consumed.
   */
  private wordList(nodes: readonly Node[], start: number, ctx: Ctx): [Block[], number] {
    const roots: VList[] = [];
    const stack: { level: number; list: VList }[] = [];
    let consumed = 0;
    for (let index = start; index < nodes.length; index += 1) {
      const node = nodes[index] as Node;
      if (node.nodeType === 8 || (node.nodeType === 3 && (node as Text).data.trim() === '')) continue;
      if (!isWordListParagraph(node)) break;
      consumed = index - start + 1;
      const paragraph = node as Element;
      const level = Number(WORD_LIST.exec(paragraph.getAttribute('style') as string)?.[2]);
      const marker = (paragraph.querySelector('[style*="mso-list"][style*="gnore"]')?.textContent ?? '').replace(/\s+/g, '');
      const ordered = ORDERED_WORD_MARKER.exec(marker);
      const first = ordered && /^\d+$/.test(ordered[1] as string) ? Number(ordered[1]) : 1;
      while (stack.length > 0 && (stack[stack.length - 1] as { level: number }).level > level) stack.pop();
      let top = stack[stack.length - 1];
      if (top !== undefined && top.level === level && top.list.ordered !== (ordered !== null)) {
        stack.pop(); // the list type changed: a new list at this level
        top = stack[stack.length - 1];
      }
      if (top === undefined || top.level < level) {
        const list: VList = { ordered: ordered !== null, start: first, items: [] };
        const parent = top?.list.items[top.list.items.length - 1];
        if (parent === undefined) roots.push(list);
        else parent.nested.push(list);
        top = { level, list };
        stack.push(top);
      }
      top.list.items.push({ blocks: this.blocks(children(paragraph), { ...ctx, depth: ctx.depth + 1 }, 'line'), check: null, nested: [] });
    }
    return [roots.map((list) => this.listBlock(list)), consumed];
  }

  /* -------------------------------------------------------------- Tables */

  private table(table: HTMLTableElement, ctx: Ctx): Block[] {
    const rows = Array.from(table.rows);
    const caption = table.caption ? this.blocks(children(table.caption), ctx, 'para') : [];
    const role = table.getAttribute('role');
    const layout =
      role === 'presentation' ||
      role === 'none' ||
      rows.some((row) => Array.from(row.cells).some((cell) => cell.querySelector('table, ul, ol, pre, blockquote, h1, h2, h3, h4, h5, h6') !== null)) ||
      (rows.length === 1 && rows[0]?.cells.length === 1);
    if (layout) {
      // A table used for layout (mail, old pages): its cells are just content, in reading order.
      return [...caption, ...rows.flatMap((row) => Array.from(row.cells).flatMap((cell) => this.blocks(children(cell), ctx, 'line')))];
    }

    const grid: string[][] = [];
    const align: string[] = [];
    let cells = 0;
    let expand = true;
    rows.forEach((row, r) => {
      const line = (grid[r] ??= []);
      let c = 0;
      for (const cell of Array.from(row.cells)) {
        while (line[c] !== undefined) c += 1;
        let span = Math.min(Math.max(cell.colSpan, 1), MAX_COLSPAN);
        let down = Math.min(Math.max(cell.rowSpan || rows.length - r, 1), rows.length - r);
        if (!expand || cells + span * down > MAX_TABLE_CELLS) {
          // Merged cells would exceed the budget: keep the content, drop merging from here on.
          this.truncated = true;
          expand = false;
          span = 1;
          down = 1;
        }
        cells += span * down;
        const content = this.inline(cell, { ...ctx, mask: cell.localName === 'th' ? ctx.mask | STRONG : ctx.mask }, true);
        // Renderers trim cells, Unicode spaces included, so the cell is written trimmed.
        const md = content.trim();
        if (r === 0) align[c] = alignment(cell);
        for (let dr = 0; dr < down; dr += 1) {
          const target = (grid[r + dr] ??= []);
          for (let dc = 0; dc < span; dc += 1) target[c + dc] = dr === 0 && dc === 0 ? md : '';
        }
        c += span;
      }
    });
    const width = grid.reduce((max, line) => Math.max(max, line.length), 0);
    if (width === 0 || grid.every((line) => line.every((cell) => cell === ''))) return caption;
    const format = (line: readonly (string | undefined)[]): string =>
      `| ${Array.from({ length: width }, (_, index) => line[index] ?? '').join(' | ')} |`;
    const [head = [], ...body] = grid;
    const delimiter = `| ${Array.from({ length: width }, (_, index) => align[index] ?? '---').join(' | ')} |`;
    return [...caption, { md: [format(head), delimiter, ...body.map(format)].join('\n'), ...PARA }];
  }
}

/* -------------------------------------------------------------- Helpers */

/**
 * Joins blocks: `line` blocks next to each other with a hard break, others with
 * a blank line. Inside a list item, a nested list follows its text directly so
 * the list stays tight. An empty block is a blank line between its neighbours.
 */
function join(blocks: readonly Block[], hardBreak: string, inItem = false): string {
  let out = '';
  let separate = false;
  let previous: Block | null = null;
  for (const original of blocks) {
    if (original.md === '') {
      separate = true;
      continue;
    }
    // Two lists in a row with the same marker would merge into one: switch the marker.
    const block: Block = original.list !== undefined && previous?.list === original.list ? switchMarker(original) : original;
    if (previous !== null) {
      if (inItem && block.list !== undefined && previous.list === undefined && !separate) out += '\n';
      else out += !separate && previous.after === 'line' && block.before === 'line' ? hardBreak : '\n\n';
    }
    out += block.md;
    previous = block;
    separate = false;
  }
  return out;
}

const OTHER_MARKER: Readonly<Record<string, string>> = { '-': '*', '*': '-', '+': '-', '.': ')', ')': '.' };

/** The same list with its top-level marker switched. Item lines are the only lines at column 0. */
function switchMarker(block: Block): Block {
  const from = block.list as string;
  const to = OTHER_MARKER[from] as string;
  const md = block.md
    .split('\n')
    .map((line) => {
      if (line === '' || line.startsWith(' ')) return line;
      return from === '.' || from === ')' ? line.replace(/^(\d+)[.)]/, `$1${to}`) : `${to}${line.slice(1)}`;
    })
    .join('\n');
  return { ...block, md, list: to };
}

function checkState(item: Element): boolean | null {
  const aria = item.getAttribute('aria-checked');
  if (item.getAttribute('role') === 'checkbox' && (aria === 'true' || aria === 'false')) return aria === 'true';
  for (const input of Array.from(item.querySelectorAll('input[type="checkbox" i]'))) {
    if (input.closest('li') === item) return input.hasAttribute('checked');
  }
  return null;
}

const children = (node: Node): Node[] => Array.from(node.childNodes);

/** The blocks with paragraph breaks at both ends. */
function spaced(blocks: Block[]): Block[] {
  const first = blocks[0];
  if (first !== undefined) blocks[0] = { ...first, before: 'para' };
  const last = blocks[blocks.length - 1];
  if (last !== undefined) blocks[blocks.length - 1] = { ...last, after: 'para' };
  return blocks;
}

function isWordListParagraph(node: Node): boolean {
  return node.nodeType === 1 && WORD_LIST.test((node as Element).getAttribute('style') ?? '');
}

function language(element: Element): string {
  const candidates = [element, element.querySelector('code'), element.parentElement];
  for (const candidate of candidates) {
    if (candidate === null) continue;
    const data = candidate.getAttribute('data-language') ?? candidate.getAttribute('data-lang');
    const named = data ?? /(?:^|\s)(?:language|lang|highlight-source)-(\S+)/.exec(candidate.getAttribute('class') ?? '')?.[1];
    if (named !== undefined && /^[A-Za-z0-9_+#.-]{1,30}$/.test(named)) return named;
  }
  return '';
}

function alignment(cell: Element): string {
  const value = (cell.getAttribute('align') ?? styleOf(cell).get('text-align') ?? '').toLowerCase();
  return value === 'center' ? ':---:' : value === 'right' ? '---:' : value === 'left' ? ':---' : '---';
}

/* --------------------------------------------------------------- Public */

/**
 * Converts HTML to CommonMark with GFM tables, strikethrough and task lists.
 *
 * Strings are parsed in an inert document (scripts never run, nothing is
 * fetched), so pasted HTML is safe to pass. The output never contains raw HTML:
 * text that looks like Markdown or HTML is escaped, links and images keep only
 * allowed URL schemes, and images default to their alt text.
 *
 * Handles what real clipboards contain: Google Docs (bold and italic set by CSS,
 * the non-bold `<b>` wrapper, redirect links), Word (`mso-list` lists, hidden
 * markers), GitHub, Notion, code editors and mail layout tables.
 *
 * Needs `DOMParser` for strings (any browser, or jsdom); pass a `Node` to use
 * your own DOM. Throws an `unsupported` `CopyFailure` for a string without one.
 */
export function htmlToMarkdown(source: string | Node, options: MarkdownOptions = {}): MarkdownResult {
  const resolved = resolveOptions(options);
  if (typeof source !== 'string') {
    // A document converts its body (an XML document, which has none, its root element).
    const body = source.nodeType === 9 ? ((source as Document).body as HTMLElement | null) : null;
    return convert(body ?? (source.nodeType === 9 ? (source as Document).documentElement : source), resolved, false);
  }
  const { body, truncated } = parseHtml(source, resolved);
  return convert(body, resolved, truncated);
}

/** Parses HTML in an inert document, cut to `maxLength`. Throws `unsupported` without `DOMParser`. */
export function parseHtml(html: string, resolved: Resolved): { readonly body: HTMLElement; readonly truncated: boolean } {
  if (typeof DOMParser === 'undefined') {
    throw copyFailure('unsupported', 'htmlToMarkdown needs DOMParser to read an HTML string; pass a DOM node instead.');
  }
  // Inert: scripts never run and nothing is fetched; the output is Markdown text.
  const body = parseInertHtml(html.slice(0, resolved.maxLength)).body;
  return { body, truncated: html.length > resolved.maxLength };
}

/** Converts a node: an element with itself included (its heading, list or table), a body or fragment by its children. */
export function convert(root: Node, resolved: Resolved, truncated: boolean): MarkdownResult {
  const converter = new Converter(resolved);
  const ctx: Ctx = { style: 0, mask: 0, href: null, depth: 0 };
  const nodes = root.nodeType === 1 && root.nodeName !== 'BODY' ? [root] : children(root);
  const blocks = converter.blocks(nodes, ctx, 'para');
  return { markdown: join(blocks, resolved.hardBreak).trim(), truncated: truncated || converter.truncated };
}
