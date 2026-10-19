import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_LINK_PROTOCOLS,
  TRACKING_PARAMETERS,
  cleanLinkUrl,
  linkPayload,
  markdownLink,
  resolveLink,
  resolveLinkUrl,
  supportsTextFragments,
  textFragmentUrl,
} from '../../src/link';

const typed = (type = 'invalid-payload'): unknown => expect.objectContaining({ copyError: expect.objectContaining({ type }) });

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('resolveLinkUrl', () => {
  it('resolves relative links against the page, or a base', () => {
    expect(resolveLinkUrl('/docs?a=1#x')).toBe(`${location.origin}/docs?a=1#x`);
    expect(resolveLinkUrl('guide', { base: 'https://example.com/docs/' })).toBe('https://example.com/docs/guide');
    expect(resolveLinkUrl(new URL('https://example.com'))).toBe('https://example.com/');
    expect(resolveLinkUrl('  https://example.com/a b  ')).toBe('https://example.com/a%20b');
  });

  it('allows only safe schemes, case-insensitively', () => {
    expect(DEFAULT_LINK_PROTOCOLS).toEqual(['https:', 'http:', 'mailto:', 'tel:']);
    expect(resolveLinkUrl('mailto:a@example.com')).toBe('mailto:a@example.com');
    expect(resolveLinkUrl('tel:+911234')).toBe('tel:+911234');
    for (const unsafe of ['javascript:alert(1)', ' JaVaScRiPt:alert(1)', 'java\tscript:alert(1)', 'data:text/html,<script>', 'vbscript:x', 'file:///etc/passwd', 'blob:https://x/1']) {
      expect(() => resolveLinkUrl(unsafe)).toThrow(typed());
    }
    expect(resolveLinkUrl('ftp://files.example/x', { protocols: ['ftp:'] })).toBe('ftp://files.example/x');
    expect(() => resolveLinkUrl('https://x', { protocols: ['ftp:'] })).toThrow(typed());
  });

  it('removes user names and passwords, always', () => {
    expect(resolveLinkUrl('https://user:secret@example.com/path')).toBe('https://example.com/path');
    expect(resolveLinkUrl('https://token@example.com/')).toBe('https://example.com/');
  });

  it('turns international domains into punycode, so lookalike hosts are visible', () => {
    expect(resolveLinkUrl('https://\u0430pple.com/')).toBe('https://xn--pple-43d.com/');
  });

  it('rejects empty, unparsable and non-string links, and invalid options', () => {
    expect(() => resolveLinkUrl('   ')).toThrow(typed());
    expect(() => resolveLinkUrl('http://[bad')).toThrow(typed());
    expect(() => resolveLinkUrl(42 as never)).toThrow(typed());
    expect(() => resolveLinkUrl('x', { base: 1 as never })).toThrow(typed());
    expect(() => resolveLinkUrl('https://x', { protocols: [] })).toThrow(typed());
    expect(() => resolveLinkUrl('https://x', { protocols: ['https'] })).toThrow(typed());
    expect(() => resolveLinkUrl('https://x', { protocols: 'https:' as never })).toThrow(typed());
    expect(() => resolveLinkUrl('https://x', { clean: 'yes' as never })).toThrow(typed());
  });

  it('needs a base for relative links outside a browser', () => {
    vi.stubGlobal('location', undefined);
    expect(() => resolveLinkUrl('/docs')).toThrow(typed());
    expect(resolveLinkUrl('https://example.com/docs')).toBe('https://example.com/docs');
  });
});

describe('cleanLinkUrl', () => {
  it('removes tracking parameters and keeps the rest, the fragment included', () => {
    expect(cleanLinkUrl('https://shop.example/p/42?utm_source=news&UTM_Medium=mail&color=red&fbclid=x&gclid=y#reviews')).toBe('https://shop.example/p/42?color=red#reviews');
    expect(cleanLinkUrl('https://shop.example/?utm_source=a')).toBe('https://shop.example/');
    expect(cleanLinkUrl('https://shop.example/?a=1&a=2')).toBe('https://shop.example/?a=1&a=2');
    expect(TRACKING_PARAMETERS).toContain('utm_');
  });

  it('takes its own parameters, prefixes, patterns and exceptions', () => {
    expect(cleanLinkUrl('https://x.example/?ref=a&src_x=1&session=9&keep=1', { params: ['ref', 'src_', /^sess/g] })).toBe('https://x.example/?keep=1');
    expect(cleanLinkUrl('https://x.example/?utm_source=a&utm_campaign=b', { keep: ['UTM_CAMPAIGN'] })).toBe('https://x.example/?utm_campaign=b');
    expect(resolveLinkUrl('https://x.example/?utm_source=a', { clean: true })).toBe('https://x.example/');
    expect(resolveLinkUrl('https://x.example/?utm_source=a')).toBe('https://x.example/?utm_source=a');
    expect(() => cleanLinkUrl('https://x', { params: [1] as never })).toThrow(typed());
    expect(() => cleanLinkUrl('https://x', { params: 'utm_' as never })).toThrow(typed());
    expect(() => cleanLinkUrl('https://x', { keep: 'utm_id' as never })).toThrow(typed());
    expect(() => cleanLinkUrl('https://x', { keep: [1] as never })).toThrow(typed());
  });
});

describe('resolveLink', () => {
  it('cleans titles of hidden characters and whitespace, and caps their length', () => {
    expect(resolveLink({ url: 'https://example.com', title: '  Release\u202E notes\u200B\n v2\u0000 ' })).toEqual({ url: 'https://example.com/', title: 'Release notes v2', titled: true });
    const long = resolveLink({ url: 'https://example.com', title: 'a'.repeat(400) }, { maxTitleLength: 10 });
    expect(long.title).toBe(`${'a'.repeat(9)}\u2026`);
    expect(resolveLink({ url: 'https://example.com', title: '\u{1F600}\u{1F600}\u{1F600}' }, { maxTitleLength: 2 }).title).toBe('\u{1F600}\u2026');
  });

  it('falls back to the URL when there is no title', () => {
    expect(resolveLink('https://example.com/a')).toEqual({ url: 'https://example.com/a', title: 'https://example.com/a', titled: false });
    expect(resolveLink({ url: 'https://example.com/a', title: ' \u200B ' })).toMatchObject({ titled: false, title: 'https://example.com/a' });
  });

  it('reads an <a> element: its resolved href and its text, or its title attribute', () => {
    document.body.innerHTML = '<a href="/pricing"> See <b>pricing</b> </a><a href="/x" title="Fallback"><img alt=""></a><a>no href</a><a href="/y"> </a>';
    const [text, icon, empty, bare] = Array.from(document.querySelectorAll('a'));
    expect(resolveLink(bare as HTMLAnchorElement)).toMatchObject({ url: `${location.origin}/y`, titled: false });
    expect(resolveLink(text as HTMLAnchorElement)).toEqual({ url: `${location.origin}/pricing`, title: 'See pricing', titled: true });
    expect(resolveLink(icon as HTMLAnchorElement)).toMatchObject({ title: 'Fallback' });
    expect(resolveLink(text as HTMLAnchorElement, { base: 'https://other.example/' })).toMatchObject({ url: 'https://other.example/pricing' });
    expect(() => resolveLink(empty as HTMLAnchorElement)).toThrow(typed());
  });

  it('rejects other values with a typed error', () => {
    expect(() => resolveLink(null as never)).toThrow(typed());
    expect(() => resolveLink({ title: 'x' } as never)).toThrow(typed());
    expect(() => resolveLink({ url: 'https://x', title: 1 } as never)).toThrow(typed());
    expect(() => resolveLink({ url: 'https://x', title: 'x' }, { maxTitleLength: 0 })).toThrow(typed());
  });
});

describe('linkPayload', () => {
  it('copies an escaped HTML anchor and the URL', () => {
    expect(linkPayload({ url: 'https://example.com/?a=1&b="2"', title: 'Tom & Jerry <script>' })).toEqual({
      kind: 'html',
      html: '<a href="https://example.com/?a=1&amp;b=%222%22">Tom &amp; Jerry &lt;script&gt;</a>',
      text: 'https://example.com/?a=1&b=%222%22',
    });
    expect(linkPayload("https://example.com/it's").html).toBe('<a href="https://example.com/it&#39;s">https://example.com/it&#39;s</a>');
  });

  it('writes the plain text as the URL, the title, both, or Markdown', () => {
    const link = { url: 'https://example.com/a (b)', title: 'Docs [v2] \\ guide' };
    expect(linkPayload(link, { text: 'title' }).text).toBe('Docs [v2] \\ guide');
    expect(linkPayload(link, { text: 'title-and-url' }).text).toBe('Docs [v2] \\ guide\nhttps://example.com/a%20%28b%29'.replace('%28b%29', '(b)'));
    expect(linkPayload('https://example.com/', { text: 'title-and-url' }).text).toBe('https://example.com/');
    expect(linkPayload(link, { text: 'markdown' }).text).toBe('[Docs \\[v2\\] \\\\ guide](https://example.com/a%20%28b%29)');
    expect(markdownLink({ url: 'https://x.example/<a>', title: 'x', titled: true })).toBe('[x](https://x.example/%3Ca%3E)');
    expect(() => linkPayload(link, { text: 'html' as never })).toThrow(typed());
  });

  it('for drag and native copy, adds text/uri-list and Firefox\u2019s text/x-moz-url as optional items', () => {
    expect(linkPayload({ url: 'https://example.com', title: 'Example' }, { target: 'drag' })).toEqual({
      kind: 'multi',
      items: [
        { mimeType: 'text/plain', data: 'https://example.com/' },
        { mimeType: 'text/html', data: '<a href="https://example.com/">Example</a>' },
        { mimeType: 'text/uri-list', data: 'https://example.com/', optional: true },
        { mimeType: 'text/x-moz-url', data: 'https://example.com/\nExample', optional: true },
      ],
    });
    expect(() => linkPayload('https://x', { target: 'tab' } as never)).toThrow(typed());
  });

  it('cleans and validates the URL it copies', () => {
    expect(linkPayload('https://x.example/?utm_source=a&id=1', { clean: true }).text).toBe('https://x.example/?id=1');
    expect(() => linkPayload('javascript:alert(1)')).toThrow(typed());
  });
});

describe('textFragmentUrl', () => {
  it('builds a text directive, encoding the characters the syntax uses', () => {
    expect(textFragmentUrl('https://example.com/docs', 'npm install react-smart-copy')).toBe('https://example.com/docs#:~:text=npm%20install%20react%2Dsmart%2Dcopy');
    expect(textFragmentUrl('https://example.com/', 'a, b & c')).toBe('https://example.com/#:~:text=a%2C%20b%20%26%20c');
  });

  it('keeps an existing #section and replaces an earlier directive', () => {
    expect(textFragmentUrl('https://example.com/#install', 'yarn')).toBe('https://example.com/#install:~:text=yarn');
    expect(textFragmentUrl('https://example.com/#install:~:text=old', 'new')).toBe('https://example.com/#install:~:text=new');
  });

  it('links long passages by their first and last words', () => {
    const passage = 'one two three four five six seven eight nine ten eleven twelve';
    expect(textFragmentUrl('https://e.x/', passage)).toBe('https://e.x/#:~:text=one%20two%20three%20four,nine%20ten%20eleven%20twelve');
    expect(textFragmentUrl('https://e.x/', passage, { maxWords: 20 })).toContain('text=one%20two');
    expect(textFragmentUrl('https://e.x/', passage, { contextWords: 2 })).toBe('https://e.x/#:~:text=one%20two,eleven%20twelve');
  });

  it('takes an explicit fragment with context', () => {
    expect(textFragmentUrl('https://e.x/', { prefix: 'the', start: 'quick-brown', end: ' lazy ', suffix: 'dog' })).toBe('https://e.x/#:~:text=the-,quick%2Dbrown,lazy,-dog');
    expect(textFragmentUrl('https://e.x/', { start: 'only', prefix: ' ', suffix: '' })).toBe('https://e.x/#:~:text=only');
  });

  it('rejects empty passages and invalid options', () => {
    expect(() => textFragmentUrl('https://e.x/', '  ')).toThrow(typed());
    expect(() => textFragmentUrl('https://e.x/', { start: ' ' })).toThrow(typed());
    expect(() => textFragmentUrl('https://e.x/', 42 as never)).toThrow(typed());
    expect(() => textFragmentUrl('https://e.x/', 'x', { maxWords: 0 })).toThrow(typed());
    expect(() => textFragmentUrl('javascript:x', 'x')).toThrow(typed());
  });

  it('reports whether the browser supports text fragments', () => {
    expect(supportsTextFragments()).toBe('fragmentDirective' in document);
    Object.defineProperty(document, 'fragmentDirective', { value: {}, configurable: true });
    expect(supportsTextFragments()).toBe(true);
    Reflect.deleteProperty(document, 'fragmentDirective');
    vi.stubGlobal('document', undefined);
    expect(supportsTextFragments()).toBe(false);
  });
});

describe('textFragmentUrl with a Range', () => {
  function select(html: string, from: [string, number], to: [string, number]): Range {
    document.body.innerHTML = html;
    const node = (selector: string) => (document.querySelector(selector) as Element).firstChild as Node;
    const range = document.createRange();
    range.setStart(node(from[0]), from[1]);
    range.setEnd(node(to[0]), to[1]);
    return range;
  }

  it('links a unique passage by its text alone', () => {
    const range = select('<p id="a">Install it with npm today.</p>', ['#a', 16], ['#a', 19]);
    expect(textFragmentUrl('https://e.x/', range)).toBe('https://e.x/#:~:text=npm');
  });

  it('adds the words around a passage that appears more than once', () => {
    const range = select('<p id="a">Run npm install first.</p><p id="b">Then npm test it.</p>', ['#b', 5], ['#b', 8]);
    expect(textFragmentUrl('https://e.x/', range)).toBe('https://e.x/#:~:text=Then-,npm,-test%20it.');
  });

  it('keeps every term within one block across a multi-block selection', () => {
    const range = select('<p id="a">Alpha beta gamma.</p><ul><li id="b">One two three four five six seven eight nine ten.</li></ul>', ['#a', 6], ['#b', 13]);
    expect(textFragmentUrl('https://e.x/', range, { root: document.body })).toBe('https://e.x/#:~:text=beta%20gamma.,One%20two%20three');
  });

  it('falls back to the passage text when a block side is empty, and rejects empty ranges', () => {
    document.body.innerHTML = '<p id="a">Hello</p><p id="b">World</p>';
    const range = document.createRange();
    range.setStart((document.querySelector('#a') as Element).firstChild as Node, 5);
    range.setEnd((document.querySelector('#b') as Element).firstChild as Node, 5);
    expect(textFragmentUrl('https://e.x/', range)).toBe('https://e.x/#:~:text=World');
    const empty = document.createRange();
    empty.setStart(document.body, 0);
    expect(() => textFragmentUrl('https://e.x/', empty)).toThrow(typed());
  });

  it('adds only the context that exists, and reads a whole document as the root', () => {
    const range = select('<p id="a">Say yes</p><p id="b">Then yes</p>', ['#b', 5], ['#b', 8]);
    expect(textFragmentUrl('https://e.x/', range, { root: document })).toBe('https://e.x/#:~:text=Then-,yes');
  });

  it('treats a document without a body as one block', () => {
    const xml = document.implementation.createDocument(null, 'root');
    const text = xml.createTextNode('alpha beta');
    (xml.documentElement as Element).append(text);
    const range = xml.createRange();
    range.setStart(text, 6);
    range.setEnd(text, 10);
    expect(textFragmentUrl('https://e.x/', range, { root: xml })).toBe('https://e.x/#:~:text=beta');
    document.title = 'Head title';
    const head = document.createRange();
    head.selectNodeContents(document.querySelector('title') as Element);
    expect(textFragmentUrl('https://e.x/', head)).toBe('https://e.x/#:~:text=Head%20title');
  });

  it('adds context when the page cannot be read, and for a detached range', () => {
    const fragment = document.createDocumentFragment();
    const text = document.createTextNode('lonely words here');
    fragment.append(text);
    const range = document.createRange();
    range.setStart(text, 7);
    range.setEnd(text, 12);
    vi.stubGlobal('document', undefined);
    expect(textFragmentUrl('https://e.x/', range)).toBe('https://e.x/#:~:text=lonely-,words,-here');
  });
});
