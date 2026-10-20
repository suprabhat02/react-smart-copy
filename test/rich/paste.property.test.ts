import DOMPurify from 'dompurify';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { runs } from '../property';
import { pasteToRich, RICH_PASTE_FORMATS, type RichPasteFormat } from '../../src/rich';

const RUNS = runs(300);

/* What the clipboard holds: Google Docs, Word, mail and web pages, with their quirks, and hostile parts. */

const word = fc.constantFrom('alpha', 'beta', 'Gamma', 'd\u00E9j\u00E0', '42', 'x&y', '<tag>', '"q"', 'a|b', 'foo_bar', '\u00A0', 'z\u200Bz');
const space = fc.constantFrom(' ', '  ', '\n', '\t', '');
const text = fc.array(fc.tuple(word, space), { minLength: 1, maxLength: 4 }).map((parts) => parts.map(([w, s]) => escape(w) + s).join(''));

function escape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const STYLES = [
  'font-weight:700', 'font-weight:bold', 'font-weight:400', 'font-weight:normal', 'font-style:italic', 'font-style:normal',
  'text-decoration:underline', 'text-decoration:line-through', 'text-decoration:none', 'vertical-align:super', 'vertical-align:sub',
  'vertical-align:baseline', "font-family:'Courier New',monospace", 'color:#1155cc', 'font-size:20pt', 'display:none', 'mso-list:Ignore',
];
const HREFS = ['https://example.com/a', 'https://www.google.com/url?q=https://example.com/b&sa=D', 'javascript:alert(1)', '/relative', 'mailto:a@example.com', 'data:text/html,x', ''];

const inline: fc.Memo<string> = fc.memo((depth) =>
  depth <= 1
    ? text
    : fc.oneof(
        { weight: 3, arbitrary: text },
        fc.tuple(fc.constantFrom('b', 'strong', 'i', 'em', 'u', 's', 'del', 'code', 'sup', 'sub', 'span', 'font', 'mark'), inline(depth - 1)).map(([tag, inner]) => `<${tag}>${inner}</${tag}>`),
        fc.tuple(fc.subarray(STYLES, { maxLength: 3 }), inline(depth - 1)).map(([styles, inner]) => `<span style="${styles.join(';')}">${inner}</span>`),
        fc.tuple(fc.constantFrom(...HREFS), inline(depth - 1)).map(([href, inner]) => `<a href="${escape(href)}">${inner}</a>`),
        fc.constant('<br>'),
        fc.constantFrom('<img src="https://example.com/i.png" alt="">', '<img src="data:image/png;base64,AAAA" alt="">', '<img src="javascript:x" alt="">'),
        fc.constantFrom('<script>alert(1)</script>', '<style>p{}</style>', '<o:p>&nbsp;</o:p>', '<!-- note -->', '<input value="x">', '<span hidden>h</span>'),
        fc.tuple(inline(depth - 1), inline(depth - 1)).map(([a, b]) => a + b),
      ),
);

const block: fc.Memo<string> = fc.memo((depth) =>
  depth <= 1
    ? inline(3).map((content) => `<p>${content}</p>`)
    : fc.oneof(
        { weight: 3, arbitrary: fc.tuple(fc.constantFrom('p', 'div', 'h1', 'h3', 'blockquote', 'section'), inline(3)).map(([tag, content]) => `<${tag}>${content}</${tag}>`) },
        fc.tuple(fc.constantFrom('ul', 'ol'), fc.array(fc.oneof(inline(3), block(depth - 1)), { minLength: 1, maxLength: 3 })).map(
          ([tag, items]) => `<${tag}>${items.map((item) => `<li>${item}</li>`).join('')}</${tag}>`,
        ),
        // Google Docs: a list nested as the sibling of its item, paragraphs inside items.
        fc.tuple(inline(2), inline(2)).map(([a, b]) => `<ul><li><p>${a}</p></li><ul><li><p>${b}</p></li></ul></ul>`),
        // Word: list paragraphs, with markers hidden by mso-list: Ignore.
        fc.array(fc.tuple(fc.integer({ min: 1, max: 3 }), fc.constantFrom('1.', 'a)', '\u00B7', 'o', 'iv.'), inline(2)), { minLength: 1, maxLength: 4 }).map((items) =>
          items.map(([level, marker, content]) => `<p class=MsoListParagraph style='mso-list:l0 level${String(level)} lfo1'><span style='mso-list:Ignore'>${marker}<span>&nbsp;&nbsp;</span></span>${content}</p>`).join(''),
        ),
        fc.tuple(inline(2), inline(2), fc.boolean()).map(([a, b, header]) => `<table><tr><${header ? 'th' : 'td'}>${a}</${header ? 'th' : 'td'}><td colspan="2">${b}</td></tr><tr><td><p>${b}</p></td></tr></table>`),
        fc.tuple(inline(2), inline(2)).map(([a, b]) => `<table role="presentation"><tr><td>${a}</td><td>${b}</td></tr></table>`),
        fc.constantFrom('<pre>  indented\n\tcode &lt;x&gt;</pre>', '<div style="white-space:pre;font-family:Consolas,monospace"><div>line 1</div><div>  line 2</div></div>', '<hr>'),
        // The Google Docs wrapper: a <b> that is not bold, around blocks.
        fc.array(block(depth - 1), { minLength: 1, maxLength: 2 }).map((blocks) => `<b style="font-weight:normal" id="docs-internal-guid-1">${blocks.join('')}</b>`),
        fc.tuple(fc.constantFrom('i', 'a href="https://example.com/w"', 'span style="font-weight:700"'), block(depth - 1)).map(([open, inner]) => `<${open}>${inner}</${open.split(' ')[0] as string}>`),
      ),
);

const pasted = fc.array(block(3), { minLength: 1, maxLength: 4 }).map((blocks) => blocks.join(''));

/* Oracles, written independently of the implementation. */

const ALLOWED_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'table', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'hr', 'br', 'a', 'img', 'strong', 'em', 'u', 's', 'sup', 'sub']);
const ALLOWED_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = { a: ['href'], img: ['src', 'alt', 'title', 'width', 'height'], td: ['colspan', 'rowspan', 'scope'], th: ['colspan', 'rowspan', 'scope'], ol: ['start'] };

function parse(html: string): HTMLElement {
  return new DOMParser().parseFromString(`<!doctype html><body>${html}`, 'text/html').body;
}

const HIDDEN_STYLE = /display\s*:\s*none|mso-list\s*:\s*ignore/i;
const SKIPPED = new Set(['script', 'style', 'o:p', 'input', 'template', 'noscript']);

/** What a reader sees of pasted HTML, without any whitespace: the text that must survive. */
function visibleText(root: Node): string {
  let out = '';
  const walk = (node: Node): void => {
    if (node.nodeType === 3) {
      out += (node as Text).data;
      return;
    }
    if (node.nodeType !== 1) return;
    const element = node as Element;
    if (SKIPPED.has(element.localName) || element.hasAttribute('hidden') || HIDDEN_STYLE.test(element.getAttribute('style') ?? '')) return;
    if (element.localName === 'img') out += element.getAttribute('alt') ?? '';
    element.childNodes.forEach(walk);
  };
  walk(root);
  return out.replace(/[\s\u00A0]+/g, '');
}

const FORMAT_TAGS: Readonly<Record<string, number>> = { strong: 1, b: 1, em: 2, i: 2, u: 4, s: 8, del: 8, code: 16, sup: 32, sub: 64 };

/** Each visible character's formats in the cleaned output. Code blocks hold plain text. */
function outputFormats(root: Node): number[] {
  const bits: number[] = [];
  const walk = (node: Node, current: number): void => {
    if (node.nodeType === 3) {
      for (const char of (node as Text).data) if (!/[\s\u00A0]/.test(char)) bits.push(current);
      return;
    }
    const element = node as Element;
    if (element.localName === 'img') return;
    const next = element.localName === 'pre' ? -1 : current === -1 ? -1 : current | (FORMAT_TAGS[element.localName] ?? 0);
    element.childNodes.forEach((child) => {
      walk(child, next);
    });
  };
  walk(root, 0);
  return bits.map((value) => (value === -1 ? 0 : value));
}

/**
 * Each visible character's formats in the pasted input, from its tags and inline CSS (CSS wins).
 * Code blocks hold plain text; headings and header cells are bold already, so bold in them is not written.
 */
function inputFormats(root: Node): number[] {
  const bits: number[] = [];
  const walk = (node: Node, current: number, mask: number): void => {
    if (node.nodeType === 3) {
      for (const char of (node as Text).data) if (!/[\s\u00a0]/.test(char)) bits.push(current === -1 ? 0 : current & ~mask);
      return;
    }
    if (node.nodeType !== 1) return;
    const element = node as Element;
    const tag = element.localName;
    const style = (element.getAttribute('style') ?? '').toLowerCase();
    if (SKIPPED.has(tag) || element.hasAttribute('hidden') || HIDDEN_STYLE.test(style) || tag === 'img') return;
    const pre = tag === 'pre' || (/white-space\s*:\s*pre/.test(style) && /monospace/.test(style));
    let next = current;
    if (pre || current === -1) next = -1;
    else {
      next |= FORMAT_TAGS[tag] ?? 0;
      const declarations = new Map(style.split(';').map((part) => part.split(':').map((side) => side.trim()) as [string, string]));
      const weight = declarations.get('font-weight');
      if (weight === '700' || weight === 'bold') next |= 1;
      if (weight === '400' || weight === 'normal') next &= ~1;
      if (declarations.get('font-style') === 'italic') next |= 2;
      if (declarations.get('font-style') === 'normal') next &= ~2;
      const decoration = declarations.get('text-decoration');
      if (decoration === 'underline') next |= 4;
      if (decoration === 'line-through') next |= 8;
      if (decoration === 'none') next &= ~12;
      if (declarations.get('vertical-align') === 'super') next = (next | 32) & ~64;
      if (declarations.get('vertical-align') === 'sub') next = (next | 64) & ~32;
      if (declarations.get('vertical-align') === 'baseline') next &= ~96;
      if ((declarations.get('font-family') ?? '').includes('monospace')) next |= 16;
    }
    const inner = /^(?:h[1-6]|th)$/.test(tag) ? mask | 1 : mask;
    element.childNodes.forEach((child) => {
      walk(child, next, inner);
    });
  };
  walk(root, 0, 0);
  return bits;
}

function purifyRemovals(html: string): string[] {
  DOMPurify.sanitize(html);
  return DOMPurify.removed.map((item) => ('element' in item ? (item.element as Element).nodeName : `@${(item as { attribute: Attr | null }).attribute?.name ?? '?'}`));
}

describe('pasteToRich against independent oracles', () => {
  it('writes only allowlisted elements and attributes, and leaves DOMPurify nothing to remove', () => {
    fc.assert(
      fc.property(pasted, (html) => {
        const result = pasteToRich({ html });
        if (result === null) return;
        const root = parse(result.html);
        for (const element of Array.from(root.querySelectorAll('*'))) {
          expect(ALLOWED_TAGS.has(element.localName), `${element.localName} in ${result.html}`).toBe(true);
          for (const attribute of Array.from(element.attributes)) {
            expect(ALLOWED_ATTRIBUTES[element.localName] ?? [], `${element.localName}[${attribute.name}] in ${result.html}`).toContain(attribute.name);
          }
        }
        for (const link of Array.from(root.querySelectorAll('a'))) expect(link.getAttribute('href')).toMatch(/^(?:https?|mailto):/);
        for (const image of Array.from(root.querySelectorAll('img'))) expect(image.getAttribute('src')).toMatch(/^https?:/);
        expect(purifyRemovals(result.html), result.html).toEqual([]);
      }),
      RUNS,
    );
  });

  it('is a fixpoint: cleaning its own output changes nothing', () => {
    fc.assert(
      fc.property(pasted, (html) => {
        const first = pasteToRich({ html });
        if (first === null) return;
        const second = pasteToRich({ html: first.html });
        expect(second?.html, html).toBe(first.html);
        expect(second?.text).toBe(first.text);
        expect(second?.removed).toEqual([]);
      }),
      RUNS,
    );
  });

  it('keeps every visible character, in order', () => {
    fc.assert(
      fc.property(pasted, (html) => {
        const expected = visibleText(parse(html));
        const result = pasteToRich({ html });
        expect(result === null ? '' : visibleText(parse(result.html)), html).toBe(expected);
      }),
      RUNS,
    );
  });

  it('gives every character the formats it showed: bold, italic, underline, strike, code, superscript, subscript', () => {
    fc.assert(
      fc.property(pasted, (html) => {
        const result = pasteToRich({ html });
        const output = result === null ? [] : outputFormats(parse(result.html));
        expect(output, `${html}\n=> ${result?.html ?? ''}`).toEqual(inputFormats(parse(html)));
      }),
      RUNS,
    );
  });

  it('holds only the formats it was given, and still every character', () => {
    const TAGS_FOR: Readonly<Record<RichPasteFormat, readonly string[]>> = {
      bold: ['strong'], italic: ['em'], underline: ['u'], strike: ['s'], code: ['code'], superscript: ['sup'], subscript: ['sub'],
      link: ['a'], image: ['img'], heading: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'], list: ['ul', 'ol', 'li'], quote: ['blockquote'],
      codeBlock: ['pre'], table: ['table', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th'], rule: ['hr'],
    };
    fc.assert(
      fc.property(pasted, fc.subarray([...RICH_PASTE_FORMATS]), (html, formats) => {
        const result = pasteToRich({ html }, { formats });
        const allowed = new Set(['p', 'br', ...formats.flatMap((format) => TAGS_FOR[format])]);
        // Code blocks hold their code element; without code blocks, lines may be inline code.
        if (formats.includes('codeBlock')) allowed.add('code');
        const root = parse(result?.html ?? '');
        for (const element of Array.from(root.querySelectorAll('*'))) expect(allowed.has(element.localName), `${element.localName} with ${formats.join(',')}`).toBe(true);
        // The text survives, in order: list markers and image alt text may be added around it.
        const kept = visibleText(root);
        let at = 0;
        for (const char of visibleText(parse(html))) {
          at = kept.indexOf(char, at);
          expect(at, `${char} of ${html} in ${kept}`).toBeGreaterThanOrEqual(0);
          at += 1;
        }
      }),
      RUNS,
    );
  });
});
