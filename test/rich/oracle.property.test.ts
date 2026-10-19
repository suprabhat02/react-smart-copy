import DOMPurify from 'dompurify';
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { prepareRich } from '../../src/rich';
import { KEEP } from '../../src/rich/policy';
import { PROPERTIES } from '../../src/rich/style';

// Property tests run hundreds of cases, often next to other suites on shared CI runners.
vi.setConfig({ testTimeout: 60_000 });

// PROPERTY_RUNS raises the count for a local stress run; CI uses the default.
const RUNS = { numRuns: Number(process.env['PROPERTY_RUNS'] ?? 300) };
// Hundreds of parses and DOMPurify runs, under coverage on shared CI runners; longer for deeper local runs.
const TIMEOUT = Math.max(60_000, RUNS.numRuns * 200);

const TAGS = ['p', 'div', 'span', 'b', 'strong', 'em', 'a', 'img', 'ul', 'ol', 'li', 'table', 'tr', 'td', 'th', 'h2', 'pre', 'code', 'blockquote', 'section', 'my-card', 'font',
  'script', 'style', 'iframe', 'svg', 'math', 'form', 'input', 'button', 'object', 'embed', 'template', 'noscript', 'video', 'textarea', 'select', 'base', 'link', 'meta'];
const ATTRIBUTES = fc.constantFrom(
  'onclick="alert(1)"', 'onerror=alert(1)', 'onmouseover="x()"', 'href="javascript:alert(1)"', 'href=" jAvAsCrIpT:alert(1)"', 'href="java&#x09;script:alert(1)"',
  'href="data:text/html,<script>alert(1)</script>"', 'href="vbscript:x"', 'href="https://ok.example/x?a=1&b=2"', 'href="/relative"', 'href="mailto:a@b.example"',
  'src="javascript:alert(1)"', 'src="https://img.example/a.png"', 'src="data:image/svg+xml,<svg onload=alert(1)>"', 'srcdoc="<script>alert(1)</script>"',
  'style="background:url(javascript:alert(1))"', 'style="color:red;behavior:url(x.htc)"', 'style="width:expression(alert(1))"', 'style="color: oklch(60% 0.2 20)"',
  'style="font-weight:bold; position:fixed; top:0"', 'class="x"', 'id="y"', 'data-x="z"', 'title="t"', 'alt="a"', 'width="10"', 'colspan="2"', 'dir="rtl"', 'lang="en"',
  'formaction="javascript:x"', 'xlink:href="javascript:x"', 'action="javascript:x"', 'autofocus', 'tabindex="1"', 'contenteditable', 'hidden', 'aria-hidden="true"',
);
const text = fc.constantFrom('hello', ' ', '&lt;b&gt;', '<!-- c -->', '"quoted"', 'a&amp;b', '\u00A0', '\u03C0', '</p>', '<', '>', '&#106;avascript:');
const html = fc.letrec<{ node: string }>((tie) => ({
  node: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    text,
    fc.tuple(fc.constantFrom(...TAGS), fc.array(ATTRIBUTES, { maxLength: 3 }), fc.array(tie('node'), { maxLength: 3 })).map(
      ([tag, attributes, children]) => `<${tag}${attributes.map((a) => ` ${a}`).join('')}>${children.join('')}</${tag}>`,
    ),
  ),
})).node;

const ALLOWED_ELEMENTS = new Set([...KEEP, 'div', 'span']);
const ALLOWED_ATTRIBUTES = new Set(['href', 'src', 'alt', 'title', 'width', 'height', 'style', 'dir', 'lang', 'colspan', 'rowspan', 'scope', 'span', 'start', 'reversed', 'type', 'value', 'datetime']);
const SAFE_URL = /^(?:https?:\/\/|mailto:|tel:)/;
const STYLE_NAMES = new Set([...PROPERTIES, 'border', 'border-top', 'border-right', 'border-bottom', 'border-left', 'padding', 'text-decoration']);

describe('prepareRich against hostile HTML (DOMPurify as oracle)', () => {
  it('writes only allowlisted elements, attributes, URLs and styles', () => {
    fc.assert(
      fc.property(html, (input) => {
        const { html: output } = prepareRich(input, { base: 'https://app.example/' });
        const root = document.createElement('div');
        root.innerHTML = output;
        for (const element of Array.from(root.querySelectorAll('*'))) {
          expect(ALLOWED_ELEMENTS.has(element.localName), element.localName).toBe(true);
          for (const attribute of Array.from(element.attributes)) {
            expect(ALLOWED_ATTRIBUTES.has(attribute.name), `${element.localName}[${attribute.name}]`).toBe(true);
            if (attribute.name === 'href' || attribute.name === 'src') expect(attribute.value).toMatch(SAFE_URL);
            if (attribute.name === 'style') {
              expect(attribute.value).not.toMatch(/url\(|expression|javascript|behavior|@import|\\/i);
              for (const declaration of attribute.value.split(';')) expect(STYLE_NAMES.has(declaration.split(':')[0] as string), declaration).toBe(true);
            }
          }
        }
      }),
      RUNS,
    );
  }, TIMEOUT);

  it('leaves DOMPurify nothing to remove', () => {
    fc.assert(
      fc.property(html, (input) => {
        const { html: output } = prepareRich(input, { base: 'https://app.example/' });
        const removed: string[] = [];
        DOMPurify.removeHooks('uponSanitizeElement');
        DOMPurify.sanitize(output);
        for (const item of DOMPurify.removed) removed.push('element' in item ? (item.element as Element).nodeName : `@${(item as { attribute: Attr | null }).attribute?.name ?? '?'}`);
        expect(removed, output).toEqual([]);
      }),
      RUNS,
    );
  }, TIMEOUT);

  it('is a fixpoint: its own output comes back unchanged', () => {
    fc.assert(
      fc.property(html, (input) => {
        const first = prepareRich(input, { base: 'https://app.example/' });
        const second = prepareRich(first.html, { base: 'https://app.example/' });
        expect(second.html).toBe(first.html);
        expect(second.text).toBe(first.text);
        expect(second.removed).toEqual([]);
      }),
      RUNS,
    );
  }, TIMEOUT);
});
