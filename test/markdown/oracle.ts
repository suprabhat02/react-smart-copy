import MarkdownIt from 'markdown-it';
import { micromark } from 'micromark';
import { gfm, gfmHtml } from 'micromark-extension-gfm';

/** CommonMark + GFM tables and strikethrough, raw HTML enabled so any leak would show up as a real element. */
export const markdownIt = new MarkdownIt('commonmark', { html: true }).enable(['table', 'strikethrough']);

/** Renders Markdown into a detached element, the way a Markdown preview would. */
export function render(markdown: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = markdownIt.render(markdown);
  return host;
}

/**
 * Renders with micromark and GFM: the reference implementation of the CommonMark and
 * GFM specifications, which GitHub follows. It is stricter than markdown-it in places,
 * such as how a backslash before a pipe splits table cells. Raw HTML is allowed, so
 * any leak would show up as a real element.
 */
export function renderGfm(markdown: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = micromark(markdown, { allowDangerousHtml: true, extensions: [gfm()], htmlExtensions: [gfmHtml()] });
  return host;
}

export const STYLE_TAGS = { STRONG: 1, B: 1, EM: 2, I: 2, DEL: 4, S: 4, CODE: 8 } as const;

/** Per-character text and style bits of rendered output (strong 1, em 2, strike 4, code 8). */
export function styledChars(root: Node): { text: string; styles: number[] } {
  let text = '';
  const styles: number[] = [];
  const walk = (node: Node, bits: number): void => {
    if (node.nodeType === 3) {
      for (const char of (node as Text).data) {
        text += char;
        styles.push(bits);
      }
      return;
    }
    const tag = (node as Element).tagName as keyof typeof STYLE_TAGS | undefined;
    const next = tag !== undefined && tag in STYLE_TAGS ? bits | STYLE_TAGS[tag] : bits;
    node.childNodes.forEach((child) => {
      walk(child, next);
    });
  };
  walk(root, 0);
  return { text, styles };
}

/** Every element name in rendered output. */
export function tagsOf(root: Element): Set<string> {
  return new Set(Array.from(root.querySelectorAll('*'), (element) => element.tagName.toLowerCase()));
}
