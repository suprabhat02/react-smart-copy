/**
 * URLs and GitHub. GitHub links a bare URL with any backslash escapes inside it kept, so an
 * escaped `https://example.com/my\_page` is a broken link there. URLs are written as autolinks
 * instead, and every other URL-like text is kept from being linked at all.
 */
import { describe, expect, it } from 'vitest';
import { escapeMarkdown, htmlToMarkdown } from '../../src/markdown';
import { escapeInline } from '../../src/markdown/escape';
import { render, renderGfm } from './oracle';

const md = (html: string): string => htmlToMarkdown(html).markdown;
const links = (markdown: string) =>
  [render(markdown), renderGfm(markdown)].map((host) => [...host.querySelectorAll('a')].map((a) => [a.textContent, decodeURI(a.getAttribute('href') ?? '')]));

describe('a URL in text', () => {
  it('becomes an autolink that GitHub and CommonMark both follow exactly', () => {
    const markdown = escapeMarkdown('See https://example.com/my_page*v2~x now');
    expect(markdown).toBe('See <https://example.com/my_page*v2~x> now');
    expect(links(markdown)).toEqual([
      [['https://example.com/my_page*v2~x', 'https://example.com/my_page*v2~x']],
      [['https://example.com/my_page*v2~x', 'https://example.com/my_page*v2~x']],
    ]);
  });

  it("leaves out what GitHub leaves out of a URL's end", () => {
    expect(escapeInline('Go to https://example.com/a.')).toBe('Go to <https://example.com/a>.');
    expect(escapeInline('(https://example.com/a)')).toBe('(<https://example.com/a>)');
    expect(escapeInline('https://en.wikipedia.org/wiki/Foo_(bar)')).toBe('<https://en.wikipedia.org/wiki/Foo_(bar)>');
    expect(escapeInline('"https://example.com/q?a=1";')).toBe('"<https://example.com/q?a=1>";');
  });

  it('stays text, never a link, when it is not a plain address every renderer links alike', () => {
    // `http://x.y=:1` was found by the property test: markdown-it linked it to `http://x.y:1=`.
    for (const text of ['https://', 'http://x]', 'https://bücher.example/', 'xhttps://example.com', 'https://[::1', 'http://x.y=:1', 'http://[::1]/', 'http://a_b.example/']) {
      const markdown = escapeMarkdown(text);
      expect(links(markdown), text).toEqual([[], []]);
      expect(renderGfm(markdown).textContent, text).toBe(text);
    }
  });

  it('is not linked inside a link or an image description, where a second link is not allowed', () => {
    expect(escapeInline('https://example.com', false, false)).toBe('https\\://example.com');
    expect(md('<a href="https://example.com/docs">see https://example.com</a>')).toBe('[see https\\://example.com](https://example.com/docs)');
  });

  it('keeps a www address with escapes inside from becoming a broken GitHub link', () => {
    expect(escapeInline('www.example.com/a*b')).toBe('www\\.example.com/a\\*b');
    expect(escapeInline('www.example.com/a_b')).toBe('www.example.com/a_b');
    expect(links(escapeMarkdown('www.example.com/a*b'))).toEqual([[], []]);
  });

  it('is written once, as an autolink, in a table cell', () => {
    expect(md('<table><tr><th>Link</th></tr><tr><td>https://example.com/a_b</td></tr></table>')).toBe('| Link |\n| --- |\n| <https://example.com/a_b> |');
  });
});

describe('a link whose text is its own address', () => {
  it('is written as the autolink, styled or not, and converts back to itself', () => {
    for (const [html, expected] of [
      ['<a href="https://example.com/">https://example.com</a>', '<https://example.com>'],
      ['<em><a href="https://example.com/a_b">https://example.com/a_b</a></em>', '*<https://example.com/a_b>*'],
      ['<a href="https://example.com/x%5Bi%5D">https://example.com/x[i]</a>', '<https://example.com/x[i]>'],
    ] as const) {
      expect(md(html)).toBe(expected);
      expect(md(render(expected).innerHTML)).toBe(expected);
    }
  });

  it('stays a link when its text is only part of the address, split, in code, or another address', () => {
    expect(md('<a href="https://example.com/a">https://example.com</a>')).toBe('[https\\://example.com](https://example.com/a)');
    expect(md('<a href="https://example.com/"><b>https://</b>example.com</a>')).toMatch(/^\[.*\]\(https:\/\/example\.com\/\)$/);
    expect(md('<a href="https://example.com/"><code>https://example.com</code></a>')).toBe('[`https://example.com`](https://example.com/)');
    expect(md('<a href="mailto:a@example.com">https://example.com</a>')).toBe('[https\\://example.com](mailto:a@example.com)');
    // Text a browser cannot read as a URL at all.
    expect(md('<a href="https://example.com/">http://[x</a>')).toBe('[http\\://\\[x](https://example.com/)');
  });
});

describe('only what CommonMark reads as syntax is escaped', () => {
  it('leaves underscores inside words alone, in any script', () => {
    expect(escapeInline('my_var snake_case_name café_crème 2_000')).toBe('my_var snake_case_name café_crème 2_000');
    expect(escapeInline('_lead trail_ a__b')).toBe('\\_lead trail\\_ a\\_\\_b');
  });

  it('keeps a line that GitHub reads as a table delimiter row from becoming a table', () => {
    for (const line of [':-', '-:', ':-:', '|---|', ' :--- | ---: ']) {
      const markdown = escapeMarkdown(`Header\n${line}`);
      expect(renderGfm(markdown).querySelector('table'), line).toBeNull();
    }
  });
});
