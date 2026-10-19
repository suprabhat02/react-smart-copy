import { describe, expect, it } from 'vitest';
import { CopyFailure } from '../../src/core/errors';
import { prepareRich, richPayload } from '../../src/rich';

const typed = (type = 'invalid-payload'): unknown => expect.objectContaining({ copyError: expect.objectContaining({ type }) });
const html = (source: string, options = {}) => prepareRich(source, { base: 'https://app.example/docs/', ...options }).html;

describe('prepareRich: elements and attributes', () => {
  it('keeps safe elements and only their allowed attributes', () => {
    expect(html('<p id="x" class="lead" data-x="1" onclick="steal()" dir="rtl" lang="ar">\u0645\u0631\u062D\u0628\u0627</p>')).toBe('<p dir="rtl" lang="ar">\u0645\u0631\u062D\u0628\u0627</p>');
    expect(html('<table border="1"><tr><th scope="col" colspan="2" rowspan="0">A</th><td colspan="9999" align="right">B</td></tr></table>')).toBe(
      '<table><tbody><tr><th scope="col" colspan="2">A</th><td>B</td></tr></tbody></table>',
    );
    expect(html('<ol start="3" reversed type="i"><li value="7">x</li></ol>')).toBe('<ol start="3" reversed="" type="i"><li value="7">x</li></ol>');
    expect(html('<abbr title="Cascading Style Sheets">CSS</abbr> <time datetime="2026-10-19T10:00Z">today</time> <q cite="https://x">q</q>')).toBe(
      '<abbr title="Cascading Style Sheets">CSS</abbr> <time datetime="2026-10-19T10:00Z">today</time> <q>q</q>',
    );
    expect(html('<p dir="sideways" lang="not a tag" title="no">x</p>')).toBe('<p>x</p>');
    expect(html('<colgroup span="2"><col span="x"></colgroup>')).toBe('');
    expect(html('<table><colgroup span="2"><col span="1"></colgroup><tr><td>a</td></tr></table>')).toBe('<table><colgroup span="2"><col span="1"></colgroup><tbody><tr><td>a</td></tr></tbody></table>');
  });

  it('leaves out what runs, loads, embeds or is a control, and reports it', () => {
    const result = prepareRich('<p>a<script>alert(1)</script><style>p{}</style><iframe src="x"></iframe><svg><text>t</text></svg><video></video><input value="v"><button>Go</button><select><option>o</option></select><textarea>t</textarea>b</p>');
    expect(result.html).toBe('<p>ab</p>');
    expect(result.removed.map((r) => r.name).sort()).toEqual(['button', 'iframe', 'input', 'script', 'select', 'style', 'svg', 'textarea', 'video']);
    expect(result.removed.every((r) => r.reason === 'unsafe-element' && r.count === 1)).toBe(true);
  });

  it('turns page structure and unknown elements into divs and spans', () => {
    expect(html('<article><header>H</header><section><nav>N</nav></section></article>')).toBe('<div><div>H</div><div><div>N</div></div></div>');
    expect(html('<p><label>L</label> <my-chip>chip</my-chip> <font color="red">f</font></p>')).toBe('<p><span>L</span> <span>chip</span> <span>f</span></p>');
    expect(html('<form action="https://evil"><p>kept</p></form>')).toBe('<div><p>kept</p></div>');
  });

  it('leaves out hidden and ignored content', () => {
    const result = prepareRich('<p>a<span hidden>h</span><span aria-hidden="true">i</span><span data-copy-ignore>c</span><span style="display:none">d</span><span class="x">e</span>b</p>', { ignore: '.x' });
    expect(result.html).toBe('<p>ab</p>');
    expect(result.removed).toEqual([
      { reason: 'ignored', name: 'span', count: 4 },
      { reason: 'hidden', name: 'span', count: 1 },
    ]);
  });

  it('never copies comments, processing instructions or foreign elements', () => {
    expect(html('<p>a<!-- secret -->b</p>')).toBe('<p>ab</p>');
    const doc = document.implementation.createHTMLDocument('');
    const p = doc.createElement('p');
    p.append('x', doc.createElementNS('http://www.w3.org/2000/svg', 'g'), 'y');
    expect(prepareRich(p).html).toBe('<p>xy</p>');
  });
});

describe('prepareRich: structure that HTML parsers would rearrange', () => {
  it('keeps table parts in place: rows get a body, stray content is left out', () => {
    // Built with DOM calls, as scripts can: HTML text could never produce this tree.
    const table = document.createElement('table');
    const row = (cell: string) => {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.textContent = cell;
      tr.append(td);
      return tr;
    };
    const stray = document.createElement('div');
    stray.textContent = 'stray';
    table.append(row('1'), row('2'), stray, 'loose text', ' ');
    const result = prepareRich(table, { styles: 'none' });
    expect(result.html).toBe('<table><tbody><tr><td>1</td></tr><tr><td>2</td></tr></tbody> </table>');
    expect(result.removed).toEqual([
      { reason: 'misplaced', name: 'div', count: 1 },
      { reason: 'misplaced', name: '#text', count: 1 },
    ]);
  });

  it('writes a link inside a link as text', () => {
    const outer = document.createElement('a');
    outer.href = 'https://a.example/';
    const inner = document.createElement('a');
    inner.href = 'https://b.example/';
    inner.textContent = 'inner';
    outer.append('outer ', inner);
    expect(prepareRich(outer, { styles: 'none' }).html).toBe('<a href="https://a.example/">outer <span>inner</span></a>');
  });

  it('adds the table parts HTML parsers would add, and keeps table tags inside a table', () => {
    const el = (tag: string, ...children: (Node | string)[]) => {
      const element = document.createElement(tag);
      element.append(...children);
      return element;
    };
    const table = el('table', el('td', 'a'), el('th', 'b'), el('col'), el('tbody', el('tr'), el('td', 'c')));
    expect(prepareRich(table, { styles: 'none' }).html).toBe(
      '<table><tbody><tr><td>a</td><th>b</th></tr></tbody><colgroup><col></colgroup><tbody><tr></tr><tr><td>c</td></tr></tbody></table>',
    );
    // Outside a table, cells and rows are blocks; a lone column has nothing to show.
    const stray = el('div', el('tr', el('td', 'x')), el('caption', 'y'), el('col'));
    const result = prepareRich(stray, { styles: 'none' });
    expect(result.html).toBe('<div><div><div>x</div></div><div>y</div></div>');
    expect(result.removed).toEqual([{ reason: 'misplaced', name: 'col', count: 1 }]);
  });

  it('gives a selection inside a table its table', () => {
    const cells = ['a', 'b'].map((text) => Object.assign(document.createElement('td'), { textContent: text }));
    const row = document.createElement('tr');
    row.append(...cells);
    const table = document.createElement('table');
    table.append(row);
    document.body.append(table);
    const range = document.createRange();
    range.setStart(cells[0] as Node, 0);
    range.setEnd(cells[1] as Node, 1);
    const result = prepareRich(range, { styles: 'none' });
    expect(result.html).toBe('<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>');
    expect(result.text).toBe('a\tb');
    table.remove();
  });

  it('keeps apart what HTML parsers would split: blocks in a paragraph, headings in headings, items in items', () => {
    const html = (markup: string) => {
      const template = document.createElement('div');
      // Built with DOM calls: HTML text could never produce these trees.
      const build = (spec: [string, ...unknown[]]): Node => {
        const [tag, ...children] = spec;
        const element = document.createElement(tag);
        for (const child of children) element.append(typeof child === 'string' ? child : build(child as [string, ...unknown[]]));
        return element;
      };
      template.append(build(JSON.parse(markup) as [string, ...unknown[]]));
      return prepareRich(template.firstChild as Element, { styles: 'none' }).html;
    };
    expect(html('["p", "a", ["ul", ["li", "b"]]]')).toBe('<div>a<ul><li>b</li></ul></div>');
    expect(html('["p", ["b", ["p", "x"]]]')).toBe('<div><b><p>x</p></b></div>');
    expect(html('["h2", ["h3", "x"]]')).toBe('<h2><span>x</span></h2>');
    expect(html('["ul", ["li", ["span", ["li", "x"]]]]')).toBe('<ul><li><span><span>x</span></span></li></ul>');
    expect(html('["ul", ["li", ["ul", ["li", "x"]]]]')).toBe('<ul><li><ul><li>x</li></ul></li></ul>');
    expect(html('["dl", ["dt", ["dd", "x"]]]')).toBe('<dl><dt><div>x</div></dt></dl>');
    expect(html('["dl", ["dd", ["div", ["dt", "x"]]]]')).toBe('<dl><dd><div><div>x</div></div></dd></dl>');
  });

  it('collapses whitespace across text nodes in the plain text, as a browser does', () => {
    // Found by the fixpoint property: the comment splits the space into two text nodes.
    const first = prepareRich('<p>hello<a> <!-- c --> </a>world</p>');
    expect(first.text).toBe('hello world');
    expect(prepareRich(first.html).text).toBe(first.text);
  });

  it('gives the same output however left-out content splits the text', () => {
    // Found by the fixpoint property: dropped elements leave whitespace in several text nodes.
    const edges = prepareRich('<embed>hello<embed> <!-- c --></embed> </embed>');
    expect(edges.html).toBe('hello');
    const leading = prepareRich('<p>one</p><p> <code hidden></code>two</p>');
    expect(leading.text).toBe('one\ntwo');
    expect(prepareRich(leading.html).text).toBe(leading.text);
    expect(prepareRich('<table><tr><td>a</td><td> b</td></tr></table>').text).toBe('a\tb');
  });
});

describe('prepareRich: documents without a window', () => {
  it('uses the style attributes of content in a document with no window', () => {
    const doc = document.implementation.createHTMLDocument('');
    const p = doc.createElement('p');
    p.setAttribute('style', 'color: red');
    p.textContent = 'x';
    doc.body.append(p);
    expect(prepareRich(p).html).toBe('<p style="color:#ff0000">x</p>');
    // Asked for computed styles, it has none to read: the content is kept without them.
    expect(prepareRich(p, { styles: 'computed' }).html).toBe('<p>x</p>');
  });
});

describe('prepareRich: links and images', () => {
  it('makes links absolute and drops unsafe ones, keeping their text', () => {
    expect(html('<a href="guide#install" title="Guide">Install</a>')).toBe('<a href="https://app.example/docs/guide#install" title="Guide">Install</a>');
    expect(html('<a href="mailto:a@example.com">Mail</a> <a href="https://u:p@x.example/">x</a>')).toBe('<a href="mailto:a@example.com">Mail</a> <a href="https://x.example/">x</a>');
    const result = prepareRich('<a href="javascript:alert(1)">a</a><a href=" JAVASCRIPT:x">b</a><a href="data:text/html,x">c</a><a>d</a><a href="">e</a>', { base: 'https://x.example/' });
    expect(result.html).toBe('<span>a</span><span>b</span><span>c</span><span>d</span><span>e</span>');
    expect(result.removed).toEqual([
      { reason: 'unsafe-link', name: 'javascript', count: 2 },
      { reason: 'unsafe-link', name: 'data', count: 1 },
    ]);
    expect(html('<a href="ftp://files.example/x">f</a>', { protocols: ['ftp:'] })).toBe('<a href="ftp://files.example/x">f</a>');
  });

  it('keeps http(s) images with their size, and writes the alt text for the rest', () => {
    expect(html('<img src="/logo.png" alt="Logo" width="120" height="40px" title="T" onerror="x" class="c">')).toBe('<img src="https://app.example/logo.png" alt="Logo" width="120" title="T">');
    const result = prepareRich('<p><img src="javascript:x" alt="J"><img src="blob:https://x/1"><img alt="none"></p>', { base: 'https://x.example/' });
    expect(result.html).toBe('<p>Jnone</p>');
    expect(result.removed).toEqual([
      { reason: 'unsafe-image', name: 'javascript', count: 1 },
      { reason: 'unsafe-image', name: 'blob', count: 1 },
      { reason: 'unsafe-image', name: 'relative', count: 1 },
    ]);
  });

  it('keeps data: images only when asked, and only real ones', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    expect(html(`<img src="${png}" alt="p">`)).toBe('p');
    expect(html(`<img src="${png}" alt="p">`, { dataImages: true })).toBe(`<img src="${png}" alt="p">`);
    expect(html('<img src="data:image/svg+xml;base64,PHN2Zz4=" alt="s">', { dataImages: true })).toBe('s');
    expect(html('<img src="data:text/html;base64,PHA+" alt="h">', { dataImages: true })).toBe('h');
    expect(html(`<img src="data:image/png;base64,${'A'.repeat(2_000_001)}" alt="big">`, { dataImages: true })).toBe('big');
  });

  it('writes images as alt text or leaves them out on request', () => {
    expect(prepareRich('<p><img src="https://x/a.png" alt="A">!</p>', { images: 'alt' })).toMatchObject({ html: '<p>A!</p>', removed: [{ reason: 'image', name: 'img', count: 1 }] });
    expect(prepareRich('<p><img src="https://x/a.png" alt="A">!</p>', { images: 'drop' })).toMatchObject({ html: '<p>!</p>', removed: [{ reason: 'image', name: 'img', count: 1 }] });
  });
});

describe('prepareRich: inline styles from HTML text', () => {
  it('keeps allowlisted declarations, made email-safe', () => {
    expect(html('<p style="color: oklch(60% 0.2 20); font-weight: bold; position: fixed; background: url(https://track.example/p.gif)">x</p>')).toBe(
      '<p style="font-weight:700;color:#de394b">x</p>',
    );
    expect(html('<p style="background-color: rgb(0 0 0 / 50%); color: white">x</p>')).toBe('<p style="background-color:#808080;color:#ffffff">x</p>');
    expect(html('<p style="font-family: Inter, sans-serif; font-size: 1.5em; text-align: center">x</p>')).toBe(
      '<p style="font-family:inter, sans-serif;font-size:1.5em;text-align:center">x</p>',
    );
    // A declaration can't break out of the attribute: no rule, no display, no calc().
    expect(html('<p style="font-family: x;} body{display:none; font-size: calc(1px + 1em)">x</p>')).toBe('<p style="font-family:x">x</p>');
  });

  it('writes inherited declarations only where they change', () => {
    expect(html('<div style="color:#333"><p style="color:#333">same</p><p style="color:#c00">red</p></div>')).toBe(
      '<div style="color:#333333"><p>same</p><p style="color:#cc0000">red</p></div>',
    );
  });

  it('leaves out every style with styles: "none"', () => {
    expect(html('<p style="color:red;font-weight:bold">x</p>', { styles: 'none' })).toBe('<p>x</p>');
  });
});

describe('prepareRich: limits and validation', () => {
  it('stops at maxElements or maxLength and says so', () => {
    const many = `<ul>${'<li>x</li>'.repeat(50)}</ul>`;
    const limited = prepareRich(many, { maxElements: 10 });
    expect(limited.truncated).toBe(true);
    expect(limited.html.match(/<li>/g)).toHaveLength(9);
    expect(prepareRich('<p>abcdefghij</p>', { maxLength: 12 })).toMatchObject({ truncated: true });
    expect(prepareRich(many).truncated).toBe(false);
    expect(prepareRich('<p>ab<b>c</b></p>', { maxLength: 9 })).toMatchObject({ html: '<p>ab</p>', truncated: true });
    expect(prepareRich('<p>ab<img src="https://x.example/a.png" alt="A"></p>', { maxLength: 30 })).toMatchObject({ html: '<p>ab</p>', truncated: true });
  });

  it('rejects invalid input and options with typed errors', () => {
    expect(() => prepareRich(42 as never)).toThrow(typed());
    expect(() => prepareRich({ nodeType: 3 } as never)).toThrow(typed());
    expect(() => prepareRich(null as never)).toThrow(typed());
    expect(() => prepareRich('<p>x</p>', { styles: 'all' as never })).toThrow(typed());
    expect(() => prepareRich('<p>x</p>', { colors: 'some' as never })).toThrow(typed());
    expect(() => prepareRich('<p>x</p>', { images: 'lazy' as never })).toThrow(typed());
    expect(() => prepareRich('<p>x</p>', { maxElements: 0 })).toThrow(typed());
    expect(() => prepareRich('<p>x</p>', { maxLength: 1.5 })).toThrow(typed());
    expect(() => prepareRich('<p>x</p>', { ignore: '[[' })).toThrow(typed());
    expect(() => prepareRich('<p>x</p>', { background: 'rgb(0 0 0 / 50%)' })).toThrow(typed());
    expect(() => prepareRich('<p>x</p>', { background: 'nope' })).toThrow(typed());
    expect(() => prepareRich('<p>x</p>', { background: 1 as never })).toThrow(typed());
    expect(() => prepareRich('<p>x</p>', { text: () => 1 as never })).toThrow(typed());
  });
});

describe('richPayload', () => {
  it('returns the HTML and its plain text', () => {
    expect(richPayload('<h2>Plan</h2><ul><li>Ship</li><li>Test</li></ul>')).toEqual({
      kind: 'html',
      html: '<h2>Plan</h2><ul><li>Ship</li><li>Test</li></ul>',
      text: 'Plan\n\u2022 Ship\n\u2022 Test',
    });
    expect(richPayload('<p>x</p>', { text: () => 'custom' })).toMatchObject({ text: 'custom' });
  });

  it('is a typed error when nothing is left to copy', () => {
    expect(() => richPayload('<script>x</script>')).toThrow(CopyFailure);
    expect(() => richPayload('<img src="https://x/a.png">')).toThrow(typed());
  });
});
