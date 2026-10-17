import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { escapeMarkdown, htmlToMarkdown } from '../../src/markdown';
import { render, styledChars, tagsOf } from './oracle';

// PROPERTY_RUNS raises the count for a local stress run; CI uses the default.
const RUNS = { numRuns: Number(process.env['PROPERTY_RUNS'] ?? 400) };

/** Text rich in every character Markdown or HTML could read as syntax. */
const tricky = fc.string({
  unit: fc.oneof(
    { weight: 4, arbitrary: fc.string({ unit: 'grapheme', minLength: 1, maxLength: 1 }) },
    { weight: 6, arbitrary: fc.constantFrom(...'\\`*_[]()<>!#~|&;=-+.:"\'1 '.split(''), '&amp;', '&#42;', '<b>', '</p>', '<!--', '-->', '1. ', '# ', '> ', '- ', '```', '~~~', '    ', 'http://x.y', '[a](b)', '![i](s)', '\t') },
  ),
  maxLength: 24,
});

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** What HTML shows for text: whitespace collapsed, trimmed. */
/** What HTML shows for text: whitespace collapsed; line edges trimmed of any whitespace (renderers differ there). */
const visible = (text: string) => text.replace(/[ \t\n\r\f]+/g, ' ').trim();

/** Styles match for every non-space character, aligning the collapsed rendered text to the source text. */
function sameStyles(actual: { text: string; styles: number[] }, expected: { text: string; styles: number[] }): boolean {
  let j = 0;
  for (let i = 0; i < actual.text.length; i += 1) {
    while (j < expected.text.length && /\s/.test(expected.text[j] as string) && expected.text[j] !== actual.text[i]) j += 1;
    if (!/\s/.test(actual.text[i] as string) && actual.styles[i] !== expected.styles[j]) return false;
    j += 1;
  }
  return true;
}

const ALLOWED = new Set(['p', 'br', 'strong', 'em', 'del', 's', 'code', 'a', 'img', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'blockquote', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'input']);

describe('escapeMarkdown (CommonMark oracle)', () => {
  it('any text renders literally: same characters, no formatting, no raw HTML', () => {
    fc.assert(
      fc.property(fc.array(tricky, { minLength: 1, maxLength: 4 }), (lines) => {
        const clean = lines.map((line) => line.replace(/[\r\n]/g, ' ').trim()).filter((line) => line !== '');
        if (clean.length === 0) return;
        const host = render(escapeMarkdown(clean.join('\n')));
        expect([...tagsOf(host)].filter((tag) => tag !== 'p')).toEqual([]);
        expect(host.children).toHaveLength(1);
        // Soft line breaks render as "\n"; trailing spaces before them are dropped by CommonMark.
        expect((host.children[0]?.textContent ?? '').replace(/ +\n/g, '\n')).toBe(clean.map((line) => line.replace(/[ \t]+$/, '')).join('\n'));
      }),
      RUNS,
    );
  });
});

describe('htmlToMarkdown (CommonMark oracle)', () => {
  it('text inside any HTML paragraph survives exactly and never becomes markup', () => {
    fc.assert(
      fc.property(tricky, (text) => {
        const { markdown } = htmlToMarkdown(`<p>${escapeHtml(text)}</p>`);
        const host = render(markdown);
        expect([...tagsOf(host)].filter((tag) => tag !== 'p')).toEqual([]);
        expect(host.querySelector('p')?.textContent ?? '').toBe(visible(text));
      }),
      RUNS,
    );
  });

  const STYLES = [
    ['b', 1],
    ['i', 2],
    ['s', 4],
  ] as const;
  const styledRun = fc.record({ text: tricky, bits: fc.integer({ min: 0, max: 7 }) });

  it('styled runs: text is always exact; styles are exact wherever CommonMark can express them', () => {
    let exact = 0;
    let total = 0;
    fc.assert(
      fc.property(fc.array(styledRun, { minLength: 1, maxLength: 6 }), (runs) => {
        const html = runs
          .map(({ text, bits }) => STYLES.reduce((inner, [tag, bit]) => ((bits & bit) !== 0 ? `<${tag}>${inner}</${tag}>` : inner), escapeHtml(text)))
          .join('');
        const { markdown } = htmlToMarkdown(`<p>${html}</p>`);
        const host = render(markdown);
        expect([...tagsOf(host)].every((tag) => ALLOWED.has(tag))).toBe(true);
        const source = document.createElement('p');
        source.innerHTML = html;
        const paragraph = host.querySelector('p');
        expect(paragraph?.textContent ?? '').toBe(visible(source.textContent));
        total += 1;
        if (paragraph !== null && sameStyles(styledChars(paragraph), styledChars(source))) exact += 1;
      }),
      RUNS,
    );
    // Formatting may only be dropped where CommonMark's flanking rules make it impossible.
    expect(exact / total).toBeGreaterThan(0.5);
  });

  it('styles are exact for word-shaped text', () => {
    const word = fc.stringMatching(/^[A-Za-z0-9]{1,6}( [A-Za-z0-9]{1,6}){0,2}$/);
    fc.assert(
      fc.property(fc.array(fc.record({ text: word, bits: fc.integer({ min: 0, max: 7 }) }), { minLength: 1, maxLength: 6 }), fc.boolean(), (runs, spaced) => {
        const html = runs
          .map(({ text, bits }) => STYLES.reduce((inner, [tag, bit]) => ((bits & bit) !== 0 ? `<${tag}>${inner}</${tag}>` : inner), text))
          .join(spaced ? ' ' : '');
        const source = document.createElement('p');
        source.innerHTML = html;
        const host = render(htmlToMarkdown(source.outerHTML).markdown);
        const expected = styledChars(source);
        const actual = styledChars(host.querySelector('p') ?? host);
        expect(actual.text).toBe(expected.text);
        // Spaces may sit inside or outside a span; letters and digits must keep their exact styles.
        const letters = (chars: { text: string; styles: number[] }) => chars.styles.filter((_, index) => chars.text[index] !== ' ');
        if (spaced) {
          expect(letters(actual)).toEqual(letters(expected));
        } else {
          // Inside a word, CommonMark can't always stack different delimiters: styles may be dropped, never invented.
          letters(actual).forEach((bits, index) => {
            expect(bits & ~(letters(expected)[index] ?? 0)).toBe(0);
          });
        }
      }),
      RUNS,
    );
  });

  it('is stable: converting the rendered output again yields the same Markdown', () => {
    const block = fc.oneof(
      tricky.map((text) => `<p>${escapeHtml(text)}</p>`),
      fc.tuple(fc.integer({ min: 1, max: 6 }), tricky).map(([level, text]) => `<h${String(level)}>${escapeHtml(text)}</h${String(level)}>`),
      fc.array(tricky, { minLength: 1, maxLength: 3 }).map((items) => `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`),
      fc.array(tricky, { minLength: 1, maxLength: 3 }).map((items) => `<ol start="3">${items.map((item) => `<li><b>${escapeHtml(item)}</b></li>`).join('')}</ol>`),
      tricky.map((text) => `<pre><code>${escapeHtml(text)}</code></pre>`),
      tricky.map((text) => `<blockquote><p><i>${escapeHtml(text)}</i></p></blockquote>`),
      fc.array(fc.array(tricky, { minLength: 2, maxLength: 2 }), { minLength: 1, maxLength: 3 }).map(
        (rows) => `<table>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</table>`,
      ),
      fc.constant('<hr>'),
    );
    fc.assert(
      fc.property(fc.array(block, { minLength: 1, maxLength: 5 }), (blocks) => {
        const first = htmlToMarkdown(blocks.join('')).markdown;
        const rendered = render(first);
        expect([...tagsOf(rendered)].every((tag) => ALLOWED.has(tag))).toBe(true);
        expect(htmlToMarkdown(rendered.innerHTML).markdown).toBe(first);
      }),
      RUNS,
    );
  });
});
