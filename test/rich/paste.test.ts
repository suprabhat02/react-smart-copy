import { afterEach, describe, expect, it, vi } from 'vitest';
import { pasteAsRich, pasteToRich, RICH_PASTE_FORMATS, type RichPasteEvent, type RichPasteFormat } from '../../src/rich';
import { GITHUB, GOOGLE_DOCS, HOSTILE, MAIL, VS_CODE, WORD } from '../markdown/fixtures';

const typed = (type = 'invalid-payload'): unknown => expect.objectContaining({ copyError: expect.objectContaining({ type }) });
const clean = (html: string, formats?: readonly RichPasteFormat[]): string => pasteToRich({ html }, formats === undefined ? {} : { formats })?.html ?? '';
const except = (...left: RichPasteFormat[]): RichPasteFormat[] => RICH_PASTE_FORMATS.filter((format) => !left.includes(format));

describe('pasteToRich: what real clipboards hold', () => {
  it('Google Docs: headings, formats set by CSS, unwrapped redirect links, nested lists, tables, checklists', () => {
    const result = pasteToRich({ html: GOOGLE_DOCS });
    expect(result?.html).toBe(
      '<h1>Release plan</h1><p>We ship <strong>on Friday</strong> with <em>care</em>. See <a href="https://example.com/docs"><u>the docs</u></a>.</p>' +
        '<ul><li>First<ul><li>Nested</li></ul></li><li>Second <code>npm i</code></li></ul>' +
        '<table><tbody><tr><td><strong>Name</strong></td><td>Seats</td></tr><tr><td>Ada | Co</td><td>42</td></tr></tbody></table>' +
        '<ul><li><s>Draft</s></li><li>Review</li></ul>',
    );
    expect(result?.text).toBe('Release plan\nWe ship on Friday with care. See the docs.\n\u2022 First\n  \u2022 Nested\n\u2022 Second npm i\nName\tSeats\nAda | Co\t42\n\u2022 Draft\n\u2022 Review');
    expect(result).toMatchObject({ removed: [], truncated: false, source: 'html' });
  });

  it('Word: list paragraphs become nested lists; spacers, markers and Office markup go', () => {
    expect(clean(WORD)).toBe('<p><strong>Agenda</strong></p><ol><li>Budget<ul><li>Q4 <em>numbers</em></li></ul></li><li>Hiring</li></ol><p>Thanks!</p>');
  });

  it('mail: lines become paragraphs, layout tables become their content', () => {
    expect(clean(MAIL)).toBe('<p>Hi Ada,</p><p>Line one</p><p>Line <strong>two</strong></p><p>Cell para</p><p>inner</p>');
  });

  it('GitHub and code editors: code blocks keep their text and indentation, not their colours', () => {
    expect(clean(GITHUB)).toBe(
      '<h2>Install</h2><pre><code>npm install react-smart-copy</code></pre><ul><li>Done <code>a`b</code></li><li>Todo</li></ul><blockquote><p>Note: <em>be careful</em></p></blockquote>',
    );
    expect(clean(VS_CODE)).toBe('<pre><code>const a = 1;\n  return a;</code></pre>');
  });

  it('hostile content: no scripts, handlers or unsafe URLs, and a report of what was left out', () => {
    const result = pasteToRich({ html: HOSTILE });
    expect(result?.html).toBe('<p>1. Not a list &lt;img src=x onerror=alert(1)&gt; *stars* # hash</p><p>click tab data vb <img src="https://tracker.example/p.gif" alt="logo"></p>');
    expect(result?.removed).toEqual([
      { reason: 'unsafe-element', name: 'script', count: 1 },
      { reason: 'unsafe-link', name: 'javascript', count: 2 },
      { reason: 'unsafe-link', name: 'data', count: 1 },
      { reason: 'unsafe-link', name: 'vbscript', count: 1 },
      { reason: 'unsafe-image', name: 'data', count: 1 },
      { reason: 'unsafe-element', name: 'iframe', count: 1 },
    ]);
    // What every clipboard document carries (its head and Office markup) is left out without a report.
    expect(pasteToRich({ html: WORD })?.removed).toEqual([]);
    expect(pasteToRich({ html: '<pre>a<script>x</script><style>p{}</style>b</pre>' })?.removed).toEqual([{ reason: 'unsafe-element', name: 'script', count: 1 }]);
  });
});

describe('pasteToRich: markup', () => {
  it('writes formats canonically: links outermost, then a fixed order, each over the longest stretch', () => {
    expect(clean('<p><i><b>a</b></i><b><i>b</i> c</b></p>')).toBe('<p><strong><em>ab</em> c</strong></p>');
    expect(clean('<p><a href="https://e.test/"><b>x</b></a><a href="https://e.test/"> y</a></p>')).toBe('<p><a href="https://e.test/"><strong>x</strong> y</a></p>');
    expect(clean('<p>a<sup>2</sup> H<sub>2</sub>O <span style="vertical-align:super">n<span style="vertical-align:baseline">0</span></span></p>')).toBe(
      '<p>a<sup>2</sup> H<sub>2</sub>O <sup>n</sup>0</p>',
    );
    expect(clean('<p><u>u</u><ins>i</ins><s>s</s><strike>k</strike><del>d</del><kbd>k</kbd><samp>s</samp><tt>t</tt><cite>c</cite><dfn>d</dfn><var>v</var></p>')).toBe(
      '<p><u>ui</u><s>skd</s><code>kst</code><em>cdv</em></p>',
    );
  });

  it('reads formats from CSS, which wins over tags', () => {
    expect(
      clean(
        '<p><span style="font-weight:bolder">a</span><b style="font-weight:lighter">b</b><span style="font-weight:300">c</span><span style="font-style:oblique">d</span>' +
          '<i style="font-style:normal">e</i><span style="text-decoration-line:underline line-through">f</span><u style="text-decoration:none">g</u></p>',
      ),
    ).toBe('<p><strong>a</strong>bc<em>d</em>e<u><s>f</s></u>g</p>');
  });

  it('collapses whitespace as the browser shows it; a space keeps the formats on both sides', () => {
    expect(clean('<p>  a \n\t b  <b> c </b> <b>d</b><br>  e  </p>')).toBe('<p>a b <strong>c d</strong><br>e</p>');
    expect(clean('<p><br><br>a<br><br></p><p> </p><div><br></div>')).toBe('<p>a</p>');
    expect(clean('<p>a <img src="https://e.test/i.png" alt="i"> b</p>')).toBe('<p>a <img src="https://e.test/i.png" alt="i"> b</p>');
  });

  it('keeps paragraphs in a list item or a cell as its lines', () => {
    expect(clean('<ul><li><p>a</p><p>b</p><div>c</div></li></ul>')).toBe('<ul><li>a<br>b<br>c</li></ul>');
    expect(clean('<table><tr><td><p>a</p><p></p><p>b</p></td><td>x</td></tr></table>')).toBe('<table><tbody><tr><td>a<br>b</td><td>x</td></tr></tbody></table>');
  });

  it('turns blocks inside inline content into lines, and inline wrappers around blocks into their blocks', () => {
    // (In a paragraph, the HTML parser itself would close it before the <div>.)
    expect(clean('<ul><li>a<span><div>b</div></span>c</li></ul>')).toBe('<ul><li>a<br>b<br>c</li></ul>');
    expect(clean('<h3>t<span><div>d</div></span></h3>')).toBe('<h3>t<br>d</h3>');
    expect(clean('<a href="https://e.test/"><div>card</div><p>more</p></a>')).toBe('<p><a href="https://e.test/">card</a></p><p><a href="https://e.test/">more</a></p>');
    expect(clean('<i><h2>t</h2><p>p</p></i>')).toBe('<h2><em>t</em></h2><p><em>p</em></p>');
    expect(clean('<h3><b>bold</b> <i>title</i><p>sub</p></h3>')).toBe('<h3>bold <em>title</em><br>sub</h3>');
  });

  it('lists: ordered with their start, items outside a list, stray content, nested lists, and empty ones', () => {
    expect(clean('<ol start="3"><li>a</li><li><ul><li>b</li></ul></li></ol>')).toBe('<ol start="3"><li>a</li><li><ul><li>b</li></ul></li></ol>');
    expect(clean('<ol start="x"><li>a</li></ol><menu><li>m</li></menu>')).toBe('<ol><li>a</li></ol><ul><li>m</li></ul>');
    expect(clean('<li>lonely</li>')).toBe('<ul><li>lonely</li></ul>');
    expect(clean('<ul>text<li>a</li><ul><li>b</li></ul></ul>')).toBe('<ul><li>text</li><li>a<ul><li>b</li></ul></li></ul>');
    expect(clean('<ul><li> </li><li><img src="javascript:x" alt=""></li></ul><p>x</p>')).toBe('<p>x</p>');
  });

  it('Word lists: types, starts, levels, changes of type, and empty items', () => {
    const item = (level: number, marker: string, content: string) =>
      `<p style="mso-list:l0 level${String(level)} lfo1"><span style="mso-list:Ignore">${marker}<span>&nbsp; </span></span>${content}</p>`;
    expect(clean(item(1, '3.', 'c') + item(1, '4.', 'd') + item(1, '\u00B7', 'e') + item(2, 'a)', 'f') + item(3, 'i.', 'g') + item(1, '5.', 'h'))).toBe(
      '<ol start="3"><li>c</li><li>d</li></ol><ul><li>e<ol><li>f<ol><li>g</li></ol></li></ol></li></ul><ol start="5"><li>h</li></ol>',
    );
    // An empty item keeps the list it holds; an item with nothing at all is left out.
    expect(clean(item(1, '1.', '') + item(2, '\u00B7', 'n') + item(1, '2.', '<br>') + `<!-- c -->\n${item(1, '3.', 'z')}<p>after</p>`)).toBe(
      '<ol><li><ul><li>n</li></ul></li><li>z</li></ol><p>after</p>',
    );
  });

  it('tables: sections, merged cells, header scope, captions; header cells are not bold', () => {
    expect(
      clean(
        '<table><caption><b>Q4</b></caption><thead><tr><th scope="col"><b>N</b></th><th>V</th></tr></thead><tbody><tr><td colspan="2" rowspan="1">x</td></tr></tbody>' +
          '<tfoot><tr><td>f</td><td>g</td></tr></tfoot></table>',
      ),
    ).toBe(
      '<table><caption><strong>Q4</strong></caption><thead><tr><th scope="col">N</th><th>V</th></tr></thead><tbody><tr><td colspan="2" rowspan="1">x</td></tr></tbody>' +
        '<tfoot><tr><td>f</td><td>g</td></tr></tfoot></table>',
    );
    // A table inside a table is layout (mail): its content, in reading order.
    expect(clean('<table><tr><td>a</td><td><table><tr><td>in</td></tr></table></td></tr></table>')).toBe('<p>a</p><p>in</p>');
    // Rows straight in the table go in a body; a table with no rows writes nothing.
    expect(clean('<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table><table></table>')).toBe(
      '<table><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table>',
    );
  });

  it('keeps quotes, rules and description lists; leaves empty quotes out', () => {
    expect(clean('<blockquote><p>q</p><blockquote>n</blockquote></blockquote><hr><blockquote> </blockquote><dl><dt>T</dt><dd>D</dd></dl>')).toBe(
      '<blockquote><p>q</p><blockquote><p>n</p></blockquote></blockquote><hr><p>T</p><p>D</p>',
    );
  });

  it('code blocks: line breaks, one line per block, no-break spaces as spaces, and empty ones left out', () => {
    expect(clean('<pre>a<br>b<div>c</div><span>d</span><script>x</script><span hidden>h</span></pre><pre>  </pre><listing>l</listing><xmp>x</xmp>')).toBe(
      '<pre><code>a\nb\nc\nd</code></pre><pre><code>l</code></pre><pre><code>x</code></pre>',
    );
    expect(clean('<pre>a\u00A0b\r\nc\n</pre>')).toBe('<pre><code>a b\nc</code></pre>');
  });

  it('links: unwrapped redirects (Google, Outlook Safe Links), relative links only with base, links in links once', () => {
    const outlook = 'https://nam02.safelinks.protection.outlook.com/?url=https%3A%2F%2Fexample.com%2Fs&data=1';
    expect(clean(`<p><a href="${outlook}">s</a> <a href="/docs">rel</a> <a href=" ">blank</a> <a>none</a></p>`)).toBe('<p><a href="https://example.com/s">s</a> rel blank none</p>');
    expect(pasteToRich({ html: '<a href="/docs">rel</a> <img src="/i.png" alt="">' }, { base: 'https://site.test/a/' })?.html).toBe(
      '<p><a href="https://site.test/docs">rel</a> <img src="https://site.test/i.png"></p>',
    );
    // A link in a link: the HTML parser closes the first one.
    expect(clean('<a href="https://a.test/"><a href="https://b.test/">x</a></a>')).toBe('<p><a href="https://b.test/">x</a></p>');
    expect(clean('<p><a href="https://a.test/"><span>a <a href="https://b.test/">b</a></span></a></p>')).toBe('<p><a href="https://a.test/">a</a> <a href="https://b.test/">b</a></p>');
    expect(pasteToRich({ html: '<a href="ftp://x.test/f">f</a>' }, { protocols: ['ftp:'] })?.html).toBe('<p><a href="ftp://x.test/f">f</a></p>');
  });

  it('images: kept with what describes them, data: images only when allowed', () => {
    expect(clean('<img src="https://e.test/i.png" alt="A" title="T" width="10" height="5" style="x" onload="y" class="z">')).toBe(
      '<p><img src="https://e.test/i.png" alt="A" width="10" height="5" title="T"></p>',
    );
    const data = '<img src="data:image/png;base64,AAAA" alt="d">';
    expect(clean(data)).toBe('<p>d</p>');
    expect(pasteToRich({ html: data }, { dataImages: true })?.html).toBe('<p><img src="data:image/png;base64,AAAA" alt="d"></p>');
  });

  it('leaves out hidden content, Office markup, foreign elements, comments and controls', () => {
    expect(
      clean(
        '<p>a<span style="display:none">h1</span><span style="visibility:hidden">h2</span><span aria-hidden="true">h3</span><span hidden>h4</span><o:p>&nbsp;</o:p>' +
          '<svg><text>s</text></svg><math><mi>m</mi></math><!-- c --><button>b</button><select><option>o</option></select><xml>x</xml>b</p>' +
          '<div hidden><p>gone</p></div><table hidden><tr><td>t</td></tr></table>',
      ),
    ).toBe('<p>ab</p>');
  });
});

describe('pasteToRich: edges', () => {
  it('formats from CSS: subscript, and weights that change nothing', () => {
    expect(clean('<p><span style="vertical-align:sub">2</span><b style="font-weight:inherit">b</b></p>')).toBe('<p><sub>2</sub><strong>b</strong></p>');
  });

  it('item lines after blocks need no break; empty headings, captions and Word lists write nothing', () => {
    expect(clean('<ul><li>a<ul><li>b</li></ul>c</li></ul>')).toBe('<ul><li>a<ul><li>b</li></ul>c</li></ul>');
    expect(clean('<h2> </h2><p>x</p>')).toBe('<p>x</p>');
    expect(clean('<h2> </h2><p>x</p>', except('heading'))).toBe('<p>x</p>');
    expect(clean('<table><caption> </caption><tr><td>a</td><td>b</td></tr></table>')).toBe('<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>');
    expect(clean('<p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">1.</span><br></p><p>x</p>')).toBe('<p>x</p>');
  });

  it('a Word list paragraph without its hidden marker is a bulleted item', () => {
    expect(clean('<p style="mso-list:l0 level1 lfo1">plain</p>')).toBe('<ul><li>plain</li></ul>');
  });

  it('an ordered list without a start, in a list or as paragraphs', () => {
    expect(clean('<ol><li>x</li></ol>')).toBe('<ol><li>x</li></ol>');
    expect(clean('<ol><li>x</li></ol>', except('list'))).toBe('<p>1. x</p>');
  });

  it('script elements inside table rows are left out', () => {
    expect(clean('<table><tr><td>a</td><script>x</script><td>b</td></tr></table>')).toBe('<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>');
    expect(clean('<table role="presentation"><tr><td>a</td><script>x</script></tr></table>')).toBe('<p>a</p>');
  });

  it('blocks inside a heading: hidden ones go, the first needs no break before it', () => {
    expect(clean('<h2><div>a</div>b<div hidden>h</div></h2>')).toBe('<h2>a<br>b</h2>');
  });

  it('hidden or foreign inline wrappers around blocks are left out with them', () => {
    expect(clean('<span style="display:none"><p>gone</p></span><span><p>kept</p></span><o:p><p>office</p></o:p>')).toBe('<p>kept</p>');
  });

  it('images without a source or alt text', () => {
    expect(pasteToRich({ html: '<img alt="x"> <img src="javascript:x">' })).toMatchObject({ html: '<p>x</p>', removed: [{ reason: 'unsafe-image', name: 'relative', count: 1 }, { reason: 'unsafe-image', name: 'javascript', count: 1 }] });
    expect(clean('<p>a<img src="https://e.test/i.png">b</p>', [])).toBe('<p>ab</p>');
  });

  it('reports what the sanitizer leaves out too: data images it does not allow', () => {
    expect(pasteToRich({ html: '<p>a<img src="data:image/svg+xml;base64,PHN2Zz4=" alt="s"></p>' }, { dataImages: true })).toMatchObject({
      html: '<p>as</p>',
      removed: [{ reason: 'unsafe-image', name: 'data', count: 1 }],
    });
  });

  it('code blocks skip comments', () => {
    expect(clean('<pre>a<!-- c -->b</pre>')).toBe('<pre><code>ab</code></pre>');
  });
});

describe('pasteToRich: formats', () => {
  it('without inline formats, links or images: their text', () => {
    const html = '<p><b>b</b><i>i</i><u>u</u><s>s</s><code>c</code><sup>p</sup><sub>d</sub> <a href="https://e.test/">l</a> <img src="https://e.test/i.png" alt="img"></p>';
    expect(clean(html, [])).toBe('<p>biuscpd l img</p>');
    expect(clean(html, ['bold', 'link'])).toBe('<p><strong>b</strong>iuscpd <a href="https://e.test/">l</a> img</p>');
  });

  it('without headings: a bold paragraph, or a plain one without bold', () => {
    expect(clean('<h2>T <i>x</i></h2>', except('heading'))).toBe('<p><strong>T <em>x</em></strong></p>');
    expect(clean('<h2>T</h2>', ['italic'])).toBe('<p>T</p>');
  });

  it('without lists: a paragraph per item after its marker, nested items after theirs', () => {
    expect(clean('<ul><li>a<ul><li>b</li></ul></li><li><p>c</p><p>d</p></li></ul><ol start="4"><li>x</li><li>y</li></ol>', except('list'))).toBe(
      '<p>\u2022 a</p><p>\u2022 b</p><p>\u2022 c<br>d</p><p>4. x</p><p>5. y</p>',
    );
    expect(clean('<ul>stray<li>a</li></ul><li>solo</li>', except('list'))).toBe('<p>stray</p><p>\u2022 a</p><p>\u2022 solo</p>');
    expect(clean('<p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">1.</span>w</p><p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">\u00B7</span>v</p>', except('list'))).toBe(
      '<p>1. w</p><p>\u2022 v</p>',
    );
  });

  it('without quotes, tables, code blocks or rules: their content', () => {
    expect(clean('<blockquote><p>q</p></blockquote>', except('quote'))).toBe('<p>q</p>');
    expect(clean('<table><caption>c</caption><tr><th>h</th><td><p>a</p><p>b</p></td></tr></table>', except('table'))).toBe('<p>c</p><p>h</p><p>a</p><p>b</p>');
    expect(clean('<pre>  a\nb</pre>', except('codeBlock'))).toBe('<p><code>&nbsp;&nbsp;a</code></p><p><code>b</code></p>');
    expect(clean('<pre>a</pre>', except('codeBlock', 'code'))).toBe('<p>a</p>');
    expect(clean('<p>a</p><hr><p>b</p>', except('rule'))).toBe('<p>a</p><p>b</p>');
  });

  it('rejects anything but known formats, with a typed error', () => {
    expect(() => pasteToRich({ html: '<p>a</p>' }, { formats: ['bold', 'blink'] as unknown as RichPasteFormat[] })).toThrow(typed());
    expect(() => pasteToRich({ html: '<p>a</p>' }, { formats: 'bold' as unknown as RichPasteFormat[] })).toThrow(typed());
  });
});

describe('pasteToRich: plain text and limits', () => {
  it('builds paragraphs and line breaks from plain text, escaped', () => {
    expect(pasteToRich({ text: 'Hi <b>,\r\nline two\n\n\n  para & more  \n' })).toEqual({
      html: '<p>Hi &lt;b&gt;,<br>line two</p><p>para &amp; more</p>',
      text: 'Hi <b>,\nline two\n\n\n  para & more',
      removed: [],
      truncated: false,
      source: 'text',
    });
    // HTML with nothing in it falls back to the text.
    expect(pasteToRich({ html: '<p> </p><script>x</script>', text: 'plain' })?.source).toBe('text');
  });

  it('returns null when there is nothing to paste', () => {
    expect(pasteToRich({})).toBeNull();
    expect(pasteToRich({ html: null, text: '  \n ' })).toBeNull();
    expect(pasteToRich({ html: '   ', text: null })).toBeNull();
  });

  it('cuts plain text at maxLength, and checks it', () => {
    expect(pasteToRich({ text: 'aaaa\n\nbbbb' }, { maxLength: 12 })).toMatchObject({ html: '<p>aaaa</p>', truncated: true });
    expect(() => pasteToRich({ text: 'a' }, { maxLength: 0 })).toThrow(typed());
  });

  it('bounds the work: elements, depth and source nodes', () => {
    expect(pasteToRich({ html: '<p>a</p>'.repeat(50) }, { maxElements: 10 })?.truncated).toBe(true);
    const deep = `${'<div>'.repeat(250)}deep${'</div>'.repeat(250)}${'<span>'.repeat(250)}inline${'</span>'.repeat(250)}`;
    expect(pasteToRich({ html: deep })?.text).toBe('deep\ninline');
    const list = `${'<ul><li>'.repeat(220)}x${'</li></ul>'.repeat(220)}`;
    expect(pasteToRich({ html: list })?.text).toContain('x');
    // maxNodes bounds every part: blocks, inline content, tables, lists, Word lists.
    for (const html of ['<p>a</p><p>b</p><p>c</p>', '<p>a <b>b</b> <i>c</i> d e f</p>', '<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>', '<p style="mso-list:l0 level1 lfo1">w</p>'.repeat(5)]) {
      const result = pasteToRich({ html }, { maxNodes: 3 });
      expect(result?.truncated, html).toBe(true);
      expect(result?.html.length, html).toBeGreaterThan(0);
    }
    expect(pasteToRich({ html: '<p>a</p><p>b</p>' }, { maxNodes: 2 })).toMatchObject({ html: '<p>a</p>', truncated: true });
    expect(() => pasteToRich({ html: '<p>a</p>' }, { maxNodes: 0 })).toThrow(typed());
    expect(() => pasteToRich({ html: '<p>a</p>' }, { maxNodes: 1.5 })).toThrow(typed());
  }, 60_000);

  it('reads at most 16 MiB of HTML', () => {
    const long = `<p>a</p>${' '.repeat(16 * 1024 * 1024)}`;
    expect(pasteToRich({ html: long })).toMatchObject({ html: '<p>a</p>', truncated: true });
  }, 60_000);

  it('passes the plain-text option through', () => {
    expect(pasteToRich({ html: '<p>a</p>' }, { text: () => 'custom' })?.text).toBe('custom');
  });
});

describe('pasteAsRich', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  function editable(): HTMLDivElement {
    const host = document.createElement('div');
    host.contentEditable = 'true';
    host.tabIndex = 0;
    // jsdom has no layout: isContentEditable is read from the attribute.
    Object.defineProperty(host, 'isContentEditable', { value: true });
    host.innerHTML = '<p>before</p>';
    document.body.append(host);
    return host;
  }

  function paste(target: EventTarget | null, data: Record<string, string> | null): RichPasteEvent & { prevented: boolean } {
    const event = {
      clipboardData: data === null ? null : { getData: (format: string) => data[format] ?? '' },
      currentTarget: target,
      target,
      defaultPrevented: false,
      prevented: false,
      preventDefault() {
        event.prevented = true;
      },
    };
    return event;
  }

  function select(node: Node, offset: number): void {
    const range = document.createRange();
    range.setStart(node, offset);
    range.collapse(true);
    const selection = document.getSelection() as Selection;
    selection.removeAllRanges();
    selection.addRange(range);
  }

  it('inserts cleaned HTML at the selection with insertHTML, keeping undo', () => {
    const host = editable();
    host.focus();
    select(host, 1);
    const execCommand = vi.fn(() => true);
    Object.assign(document, { execCommand });
    const event = paste(host, { 'text/html': '<b style="font-weight:normal" id="docs-internal-guid-1"><p><span style="font-weight:700">Hi</span></p></b>', 'text/plain': 'Hi' });
    expect(pasteAsRich(event)).toBe(true);
    expect(event.prevented).toBe(true);
    expect(execCommand).toHaveBeenCalledWith('insertHTML', false, '<p><strong>Hi</strong></p>');
    Reflect.deleteProperty(document, 'execCommand');
  });

  it('inserts at the selection by hand when insertHTML is unavailable, then puts the cursor after it', () => {
    const host = editable();
    host.focus();
    select(host, 1);
    const inputs: string[] = [];
    host.addEventListener('input', (event) => inputs.push(event.inputType));
    expect(pasteAsRich(paste(host, { 'text/html': '<p>new</p><p>two</p>' }))).toBe(true);
    expect(host.innerHTML).toBe('<p>before</p><p>new</p><p>two</p>');
    expect(inputs).toEqual(['insertFromPaste']);
    const range = (document.getSelection() as Selection).getRangeAt(0);
    expect([range.startContainer, range.startOffset]).toEqual([host, 3]);
  });

  it('inserts at the end when the selection is elsewhere, and fires a plain input event without InputEvent', () => {
    const host = editable();
    const outside = document.createElement('p');
    outside.textContent = 'outside';
    document.body.append(outside);
    select(outside, 0);
    const original = window.InputEvent;
    Reflect.deleteProperty(window, 'InputEvent');
    const inputs: string[] = [];
    host.addEventListener('input', (event) => inputs.push(event.constructor.name));
    try {
      expect(pasteAsRich(paste(host, { 'text/html': '<i>end</i>' }))).toBe(true);
    } finally {
      Object.assign(window, { InputEvent: original });
    }
    expect(host.innerHTML).toBe('<p>before</p><p><em>end</em></p>');
    expect(inputs).toEqual(['Event']);
  });

  it('inserts at the end when there is no selection at all', () => {
    const host = editable();
    (document.getSelection() as Selection).removeAllRanges();
    expect(pasteAsRich(paste(host, { 'text/html': '<p>z</p>' }))).toBe(true);
    expect(host.innerHTML).toBe('<p>before</p><p>z</p>');
  });

  it('falls back to inserting by hand when insertHTML throws', () => {
    const host = editable();
    host.focus();
    select(host, 1);
    Object.assign(document, { execCommand: () => { throw new Error('no'); } });
    expect(pasteAsRich(paste(host, { 'text/html': '<p>x</p>' }))).toBe(true);
    Reflect.deleteProperty(document, 'execCommand');
    expect(host.innerHTML).toBe('<p>before</p><p>x</p>');
  });

  it('lets onPaste insert it instead, with the paste still prevented', () => {
    const host = editable();
    const onPaste = vi.fn(() => false);
    const event = paste(host, { 'text/html': '<p>x</p>' });
    expect(pasteAsRich(event, { onPaste })).toBe(true);
    expect(event.prevented).toBe(true);
    expect(onPaste).toHaveBeenCalledWith(expect.objectContaining({ html: '<p>x</p>', source: 'html' }));
    expect(host.innerHTML).toBe('<p>before</p>');
    // Returning nothing inserts as usual.
    expect(pasteAsRich(paste(host, { 'text/html': '<p>y</p>' }), { onPaste: () => undefined })).toBe(true);
    expect(host.innerHTML).toBe('<p>before</p><p>y</p>');
  });

  it('leaves plain text, empty HTML, non-editable targets and handled events to the browser', () => {
    const host = editable();
    const plain = document.createElement('div');
    expect(pasteAsRich(paste(host, { 'text/plain': 'just text' }))).toBe(false);
    expect(pasteAsRich(paste(host, { 'text/html': '<script>x</script>', 'text/plain': 'x' }))).toBe(false);
    expect(pasteAsRich(paste(host, { 'text/html': '<p> </p>' }))).toBe(false);
    expect(pasteAsRich(paste(plain, { 'text/html': '<p>x</p>' }))).toBe(false);
    expect(pasteAsRich(paste(null, { 'text/html': '<p>x</p>' }))).toBe(false);
    expect(pasteAsRich(paste(document.createTextNode('t'), { 'text/html': '<p>x</p>' }))).toBe(false);
    expect(pasteAsRich(paste(host, null))).toBe(false);
    expect(pasteAsRich({ ...paste(host, { 'text/html': '<p>x</p>' }), defaultPrevented: true })).toBe(false);
    // Invalid options never break pasting: the browser pastes as usual.
    expect(pasteAsRich(paste(host, { 'text/html': '<p>x</p>' }), { formats: ['nope'] as unknown as RichPasteFormat[] })).toBe(false);
    expect(host.innerHTML).toBe('<p>before</p>');
  });

  it('uses the event target when there is no current target', () => {
    const host = editable();
    const event = { ...paste(host, { 'text/html': '<p>t</p>' }), currentTarget: null };
    expect(pasteAsRich(event)).toBe(true);
    expect(host.innerHTML).toBe('<p>before</p><p>t</p>');
  });
});
