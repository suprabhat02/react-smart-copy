import { copyFailure } from '../core/errors';
import type { Run } from './lines';

/** Never code: scripts, embedded content, form controls (the block's own Copy button) and media. */
const SKIP = new Set([
  'script', 'style', 'template', 'noscript', 'head', 'button', 'input', 'textarea', 'select', 'option', 'datalist',
  'dialog', 'svg', 'math', 'canvas', 'iframe', 'object', 'embed', 'img', 'picture', 'video', 'audio', 'source', 'track',
]);

/** Elements that start their own line. */
const BLOCK = new Set([
  'address', 'article', 'aside', 'blockquote', 'dd', 'details', 'div', 'dl', 'dt', 'figcaption', 'figure', 'footer',
  'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section',
  'summary', 'table', 'tbody', 'tfoot', 'thead', 'tr', 'ul',
]);

/**
 * Line-number gutters by the class names highlighters give them (Prism, highlight.js,
 * Rouge, Pygments, react-syntax-highlighter, CodeMirror and others).
 */
/** Whitespace between table rows and cells is never rendered. */
const TABLE_PARTS = new Set(['table', 'thead', 'tbody', 'tfoot', 'tr', 'colgroup']);

const GUTTER = /(?:^|[\s_-])(?:gutter|linenos?|lineno|line-?numbers?|ln-numbers?|line-?nums?)(?:$|[\s_-])/i;
const NO_SELECT = /(?:^|;)\s*(?:-webkit-)?user-select\s*:\s*none/i;

/** Colours as browsers serialise them. Anything else (`url(...)`, `var(...)`) is never copied into the HTML. */
const SAFE_COLOR =
  /^(?:#[\da-f]{3,8}|[a-z]{3,20}|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\([\d\s.,%/+-]{1,80}\)|color\([a-z\d-]{1,24}[\d\s.,%/+-]{1,80}\))$/i;
const TRANSPARENT = /^(?:transparent|rgba\(\s*0,\s*0,\s*0,\s*0\s*\))$/i;

export interface ExtractOptions {
  /** A CSS selector for more parts to leave out. */
  readonly ignore?: string | undefined;
  /** Keep each token's colour and weight, for the HTML flavour. */
  readonly styles: boolean;
}

export interface Extracted {
  readonly runs: readonly Run[];
  /** The block's own text and background colour, as CSS. */
  readonly blockStyle: string;
}

interface Look {
  readonly color: string;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly decoration: string;
}

export function assertElement(value: unknown, name: string): asserts value is Element {
  if (typeof value !== 'object' || value === null || (value as { nodeType?: unknown }).nodeType !== 1) {
    throw copyFailure('invalid-payload', `\`${name}\` must be a string or an Element.`);
  }
}

function lookOf(style: CSSStyleDeclaration): Look {
  const weight = style.fontWeight;
  const decoration = `${style.textDecorationLine || style.textDecoration} `;
  return {
    color: SAFE_COLOR.test(style.color) ? style.color : '',
    bold: weight === 'bold' || weight === 'bolder' || Number(weight) >= 600,
    italic: style.fontStyle === 'italic' || style.fontStyle.startsWith('oblique'),
    decoration: ['underline', 'line-through'].filter((line) => decoration.includes(line)).join(' '),
  };
}

/**
 * The code a rendered block shows, as styled runs: line-number gutters, hidden
 * and unselectable parts (`user-select: none`), `aria-hidden` decorations,
 * buttons and anything marked `data-copy-ignore` are left out.
 */
export function extract(root: Element, options: ExtractOptions): Extracted {
  const { ignore } = options;
  if (ignore !== undefined) {
    try {
      root.matches(ignore);
    } catch (cause) {
      throw copyFailure('invalid-payload', `\`ignore\` is not a valid CSS selector: ${ignore}`, cause);
    }
  }
  const view = root.ownerDocument.defaultView;
  const computed = (element: Element): CSSStyleDeclaration | null => (view === null ? null : view.getComputedStyle(element));
  const rootStyle = computed(root);
  const base: Look = rootStyle === null ? { color: '', bold: false, italic: false, decoration: '' } : lookOf(rootStyle);
  const runs: Run[] = [];
  const styles = new Map<Element, string>();
  let last = '';

  const push = (text: string, style: string): void => {
    if (text === '') return;
    const previous = runs[runs.length - 1];
    if (previous?.style === style) runs[runs.length - 1] = { text: previous.text + text, style };
    else runs.push({ text, style });
    last = text.charAt(text.length - 1);
  };
  const breakLine = (): void => {
    if (last !== '' && last !== '\n') push('\n', '');
  };

  const styleOf = (element: Element): string => {
    let style = styles.get(element);
    if (style === undefined) {
      const declared = computed(element);
      style = '';
      if (declared !== null) {
        const look = lookOf(declared);
        if (look.color !== '' && look.color !== base.color) style += `color:${look.color};`;
        if (look.bold && !base.bold) style += 'font-weight:bold;';
        if (look.italic && !base.italic) style += 'font-style:italic;';
        if (look.decoration !== '' && look.decoration !== base.decoration) style += `text-decoration:${look.decoration};`;
      }
      styles.set(element, style);
    }
    return style;
  };

  const leftOut = (element: Element): boolean => {
    if (SKIP.has(element.localName)) return true;
    if (element.hasAttribute('hidden') || element.hasAttribute('data-copy-ignore') || element.getAttribute('aria-hidden') === 'true') return true;
    if (GUTTER.test(element.getAttribute('class') ?? '') || NO_SELECT.test(element.getAttribute('style') ?? '')) return true;
    if (ignore !== undefined && element.matches(ignore)) return true;
    const style = computed(element);
    return style !== null && (style.display === 'none' || style.userSelect === 'none' || style.getPropertyValue('-webkit-user-select') === 'none');
  };

  const walk = (parent: Element): void => {
    for (let node = parent.firstChild; node !== null; node = node.nextSibling) {
      if (node.nodeType === 3) {
        const { data } = node as Text;
        if (TABLE_PARTS.has(parent.localName) && data.trim() === '') continue;
        push(data, options.styles ? styleOf(parent) : '');
      } else if (node.nodeType === 1) {
        const element = node as Element;
        if (leftOut(element)) continue;
        if (element.localName === 'br') {
          push('\n', '');
        } else if (BLOCK.has(element.localName)) {
          breakLine();
          walk(element);
          breakLine();
        } else {
          walk(element);
        }
      }
    }
  };
  walk(root);

  let blockStyle = '';
  if (options.styles && rootStyle !== null) {
    if (base.color !== '') blockStyle += `color:${base.color};`;
    const background = rootStyle.backgroundColor;
    if (SAFE_COLOR.test(background) && !TRANSPARENT.test(background)) blockStyle += `background-color:${background};`;
  }
  return { runs, blockStyle };
}
