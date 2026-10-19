import { afterEach, describe, expect, it } from 'vitest';
import type { CopySelection } from '../../src/core/copy-interceptor';
import { plainText, prepareRich, richTransform, type StyleSource } from '../../src/rich';

/** What a browser computes for an element that sets nothing: the defaults the walker compares with. */
const BASE: Record<string, string> = {
  display: 'block',
  visibility: 'visible',
  color: 'rgb(17, 24, 39)',
  'font-family': 'Inter, sans-serif',
  'font-size': '16px',
  'font-style': 'normal',
  'font-weight': '400',
  'text-align': 'start',
  'white-space': 'normal',
  'text-transform': 'none',
  'list-style-type': 'disc',
  'border-collapse': 'separate',
  'background-color': 'rgba(0, 0, 0, 0)',
  'text-decoration-line': 'none',
  'vertical-align': 'baseline',
};

/** A computed-style reader: inherited values flow down, each element can override. */
function computed(overrides: Map<Element, Record<string, string>>): (element: Element) => StyleSource {
  const INHERITED = ['color', 'font-family', 'font-size', 'font-style', 'font-weight', 'text-align', 'white-space', 'text-transform', 'list-style-type', 'border-collapse', 'visibility'];
  const resolve = (element: Element | null): Record<string, string> => {
    if (element === null || element === document.documentElement) return BASE;
    const parent = resolve(element.parentElement);
    const own: Record<string, string> = { ...BASE };
    for (const name of INHERITED) own[name] = parent[name] as string;
    return { ...own, ...overrides.get(element) };
  };
  return (element) => {
    const values = resolve(element);
    return { getPropertyValue: (name) => values[name] ?? '' };
  };
}

function mount(markup: string): HTMLElement {
  document.body.innerHTML = `<div id="root">${markup}</div>`;
  return document.getElementById('root') as HTMLElement;
}
const $ = (selector: string) => document.querySelector(selector) as Element;

afterEach(() => {
  document.body.innerHTML = '';
  getSelection()?.removeAllRanges();
});

describe('prepareRich: computed styles', () => {
  it('writes the root text style in full, and children only where they change', () => {
    const root = mount('<p>Plain <strong>bold</strong> <span id="red">red</span> <em id="big">big</em></p>');
    const styles = new Map<Element, Record<string, string>>([
      [$('strong'), { 'font-weight': '700' }],
      [$('#red'), { color: 'oklch(62.8% 0.2577 29.23)' }],
      [$('#big'), { 'font-style': 'italic', 'font-size': '20.004px', 'text-transform': 'uppercase', 'letter-spacing': '2px' }],
    ]);
    const { html } = prepareRich(root, { computedStyle: computed(styles) });
    expect(html).toBe(
      '<div style="font-family:inter, sans-serif;font-size:16px;color:#111827"><p>Plain <strong>bold</strong> <span style="color:#ff0000">red</span> <em style="font-size:20px;text-transform:uppercase">big</em></p></div>',
    );
  });

  it('turns colours into opaque hex, drawn over their background', () => {
    const root = mount('<p id="p"><mark id="m">hi</mark></p>');
    const { html } = prepareRich(root, {
      computedStyle: computed(new Map([[$('#p'), { 'background-color': 'color(srgb 0 0 1 / 0.5)' }], [$('#m'), { 'background-color': 'rgb(255 255 0)', color: 'rgb(0 0 0 / 0.5)' }]])),
    });
    expect(html).toContain('<p style="background-color:#8080ff">');
    expect(html).toContain('<mark style="background-color:#ffff00;color:#808000">');
  });

  it('keeps text readable: light text from a dark theme takes the destination colour', () => {
    const root = mount('<p>dark mode text <span id="s">on a dark badge</span></p>');
    const styles = new Map<Element, Record<string, string>>([
      [root, { color: 'rgb(229, 231, 235)' }],
      [$('#s'), { 'background-color': '#1f2937', color: '#f9fafb' }],
    ]);
    const readable = prepareRich(root, { computedStyle: computed(styles) });
    expect(readable.html).toBe('<div style="font-family:inter, sans-serif;font-size:16px"><p>dark mode text <span style="background-color:#1f2937;color:#f9fafb">on a dark badge</span></p></div>');
    expect(readable.removed).toEqual([{ reason: 'unreadable-color', name: 'div', count: 1 }]);
    expect(prepareRich(root, { computedStyle: computed(styles), colors: 'keep' }).html).toContain('<div style="font-family:inter, sans-serif;font-size:16px;color:#e5e7eb">');
    expect(prepareRich(root, { computedStyle: computed(styles), colors: 'none' }).html).toBe('<div style="font-family:inter, sans-serif;font-size:16px"><p>dark mode text <span>on a dark badge</span></p></div>');
    // Pasted on a dark page instead, the light text is readable.
    expect(prepareRich(root, { computedStyle: computed(styles), background: '#111111' }).html).toContain('color:#e5e7eb');
  });

  it('writes tables with borders, padding and alignment', () => {
    const root = mount('<table id="t"><tr><th id="h">Name</th><td id="c">Ada</td></tr></table>');
    const border = { 'border-top-width': '1px', 'border-top-style': 'solid', 'border-top-color': 'rgb(229, 231, 235)', 'border-right-width': '1px', 'border-right-style': 'solid', 'border-right-color': 'rgb(229, 231, 235)', 'border-bottom-width': '1px', 'border-bottom-style': 'solid', 'border-bottom-color': 'rgb(229, 231, 235)', 'border-left-width': '1px', 'border-left-style': 'solid', 'border-left-color': 'rgb(229, 231, 235)' };
    const styles = new Map<Element, Record<string, string>>([
      [$('#t'), { 'border-collapse': 'collapse', display: 'table' }],
      [$('#h'), { ...border, 'padding-top': '4px', 'padding-right': '8px', 'padding-bottom': '4px', 'padding-left': '8px', 'font-weight': '700', 'text-align': '-internal-center', 'vertical-align': 'top' }],
      [$('#c'), { 'border-bottom-width': '2px', 'border-bottom-style': 'dashed', 'border-bottom-color': '#000', 'padding-left': '0.5em', 'text-align': 'end', 'vertical-align': 'middle' }],
    ]);
    const { html } = prepareRich(root, { computedStyle: computed(styles) });
    expect(html).toContain('<table style="border-collapse:collapse">');
    expect(html).toContain('<th style="vertical-align:top;border:1px solid #e5e7eb;padding:4px 8px 4px 8px">Name</th>');
    expect(html).toContain('<td style="text-align:right;border-bottom:2px dashed #000000;padding:0 0 0 0.5em">Ada</td>');
  });

  it('writes link and list styles that differ from mail defaults', () => {
    const root = mount('<p><a id="a" href="https://x.example/">plain link</a> <u id="u">u</u></p><ul id="ul"><li>a</li></ul><ol id="ol"><li>b</li></ol>');
    const styles = new Map<Element, Record<string, string>>([
      [$('#a'), { color: 'rgb(37, 99, 235)', 'text-decoration-line': 'none' }],
      [$('#u'), { 'text-decoration-line': 'underline' }],
      [$('#ul'), { 'list-style-type': 'square' }],
      [$('#ol'), { 'list-style-type': 'lower-roman' }],
    ]);
    const { html } = prepareRich(root, { computedStyle: computed(styles) });
    expect(html).toContain('<a href="https://x.example/" style="color:#2563eb;text-decoration:none">plain link</a>');
    expect(html).toContain('<u>u</u>');
    expect(html).toContain('<ul><li>a</li></ul>');
    expect(html).toContain('<ol style="list-style-type:lower-roman"><li>b</li></ol>');
  });

  it('drops values that are not safe or not portable', () => {
    const root = mount('<p id="p">x</p>');
    const styles = new Map<Element, Record<string, string>>([[$('#p'), { 'font-family': 'x; background:url(evil)', 'font-size': 'calc(1px + 2px)', 'font-weight': 'bolder', 'text-align': 'match-parent', 'white-space': 'pre', 'border-top-width': '2px', 'border-top-style': 'groove', color: 'currentcolor', 'text-decoration-line': 'spelling-error' }]]);
    expect(prepareRich(root, { computedStyle: computed(styles) }).html).toBe('<div style="font-family:inter, sans-serif;font-size:16px;color:#111827"><p style="white-space:pre">x</p></div>');
  });

  it('leaves out what is not displayed, and keeps block elements as blocks', () => {
    const root = mount('<p>a<span id="n">none</span><span id="v">hidden</span><my-card id="c">card</my-card>b</p>');
    const styles = new Map<Element, Record<string, string>>([[$('#n'), { display: 'none' }], [$('#v'), { visibility: 'hidden' }], [$('#c'), { display: 'flex' }]]);
    const result = prepareRich(root, { computedStyle: computed(styles) });
    // A block inside a paragraph is written inline: HTML parsers would split the paragraph around a <div>.
    expect(result.html).toContain('<p>a<span>card</span>b</p>');
    expect(result.removed).toEqual([{ reason: 'hidden', name: 'span', count: 2 }]);
  });

  it('reads keyword font weights, and borders without colours or with colours off', () => {
    const root = mount('<p id="b">bold</p><p id="n">normal</p><p id="x">box</p>');
    const styles = new Map<Element, Record<string, string>>([
      [root, { 'font-weight': 'bold' }],
      [$('#n'), { 'font-weight': 'normal' }],
      [$('#x'), { 'border-left-width': '1px', 'border-left-style': 'solid', 'border-left-color': 'transparent', 'padding-top': '0px', 'padding-left': '4px' }],
    ]);
    const { html } = prepareRich(root, { computedStyle: computed(styles) });
    expect(html).toContain('font-weight:700;color');
    expect(html).toContain('<p>bold</p><p style="font-weight:400">normal</p>');
    expect(html).toContain('<p style="border-left:1px solid;padding:0 0 0 4px">box</p>');
    const plain = prepareRich(root, { computedStyle: computed(new Map([[$('#x'), { 'border-left-width': '1px', 'border-left-style': 'solid', 'border-left-color': 'red' }]])), colors: 'none' });
    expect(plain.html).toContain('<p style="border-left:1px solid">box</p>');
  });

  it('uses what an element shows when its style cannot be read', () => {
    const root = mount('<p>a<b>b</b></p>');
    expect(prepareRich(root, { computedStyle: () => null }).html).toBe('<div><p>a<b>b</b></p></div>');
  });

  it('reads the browser\u2019s computed styles by default', () => {
    const root = mount('<p style="color: rgb(200, 0, 0)">x</p>');
    expect(prepareRich(root).html).toContain('color:#c80000');
    // Detached content has no computed style: its style attributes are used.
    const detached = document.createElement('p');
    detached.setAttribute('style', 'color: blue');
    detached.textContent = 'x';
    expect(prepareRich(detached).html).toBe('<p style="color:#0000ff">x</p>');
  });

  it('writes the displayed size of images', () => {
    const root = mount('<img id="i" src="https://x.example/a.png" alt="a" width="999">');
    Object.defineProperty($('#i'), 'width', { value: 120.4 });
    Object.defineProperty($('#i'), 'height', { value: 0 });
    Object.defineProperty($('#i'), 'currentSrc', { value: 'https://cdn.example/a@2x.png' });
    expect(prepareRich(root, { computedStyle: computed(new Map()) }).html).toContain('<img src="https://cdn.example/a@2x.png" alt="a" width="120">');
  });
});

describe('prepareRich: fragments', () => {
  it('converts a fragment by its children', () => {
    const fragment = document.createDocumentFragment();
    const p = document.createElement('p');
    p.textContent = 'from a fragment';
    fragment.append(p, document.createComment('note'));
    expect(prepareRich(fragment).html).toBe('<p>from a fragment</p>');
  });
});

describe('prepareRich: selections', () => {
  function select(from: [Node, number], to: [Node, number]): Range {
    const range = document.createRange();
    range.setStart(...from);
    range.setEnd(...to);
    const selection = getSelection() as Selection;
    selection.removeAllRanges();
    selection.addRange(range);
    return range;
  }

  it('copies only the selected text, inside its formatting, without the container box', () => {
    mount('<p id="p">Hello <strong id="s">bold world</strong> and more</p>');
    const styles = new Map<Element, Record<string, string>>([[$('#p'), { 'background-color': '#eee', 'padding-top': '8px' }]]);
    const text = $('#s').firstChild as Text;
    const range = select([text, 5], [($('#p').lastChild as Text), 4]);
    expect(prepareRich(range, { computedStyle: computed(styles) }).html).toBe('<p style="font-family:inter, sans-serif;font-size:16px;color:#111827"><strong>world</strong> and</p>');
  });

  it('copies a selection inside one text node with its element', () => {
    mount('<p><em id="e">emphasis here</em></p>');
    const text = $('#e').firstChild as Text;
    expect(prepareRich(select([text, 0], [text, 8]), { styles: 'none' }).html).toBe('<em>emphasis</em>');
  });

  it('rejects a range outside a document', () => {
    const range = document.createRange();
    Object.defineProperty(range, 'commonAncestorContainer', { value: { nodeType: 1, parentNode: null, ownerDocument: null, isConnected: false } });
    expect(() => prepareRich(range)).toThrow(expect.objectContaining({ copyError: expect.objectContaining({ type: 'invalid-payload' }) }));
  });

  it('richTransform makes native copy of a selection portable', () => {
    mount('<p id="p">Copy <a href="/docs">the docs</a><script>x</script></p>');
    const p = $('#p');
    select([p, 0], [p, p.childNodes.length]);
    const selection: CopySelection = { kind: 'copy', text: 'Copy the docs', html: null, fragment: null, field: null, editable: false };
    const decision = richTransform({ styles: 'none', base: 'https://app.example/' })(selection);
    expect(decision).toEqual({ kind: 'html', html: '<p>Copy <a href="https://app.example/docs">the docs</a></p>', text: 'Copy the docs' });
  });

  it('richTransform leaves fields, empty selections and empty results to the browser', () => {
    const transform = richTransform({ styles: 'none' });
    const field = document.createElement('input');
    expect(transform({ kind: 'copy', text: 'x', html: null, fragment: null, field, editable: true })).toBeUndefined();
    getSelection()?.removeAllRanges();
    expect(transform({ kind: 'copy', text: 'x', html: null, fragment: null, field: null, editable: false })).toBeUndefined();
    mount('<p id="p"><script>only a script</script></p>');
    const p = $('#p');
    select([p, 0], [p, 1]);
    expect(transform({ kind: 'copy', text: '', html: null, fragment: null, field: null, editable: false })).toBeUndefined();
  });
});

describe('plainText', () => {
  it('writes blocks, lists, tables, line breaks and preformatted text readably', () => {
    const root = document.createElement('div');
    root.innerHTML = [
      '<h2>Release   notes</h2>',
      '<p>Line one<br>line two</p>',
      '<ul><li>Alpha<ul><li>Nested</li></ul></li><li>Beta</li></ul>',
      '<ol start="4"><li>Four</li><li value="9">Nine</li></ol>',
      '<table><tr><th>Name</th><th>Role</th></tr><tr><td>Ada</td><td>Lead</td></tr></table>',
      '<hr><pre>  keep\n    indent</pre>',
      '<p style="white-space: pre-wrap">a  b</p>',
      '<p><img alt="[logo]"> after</p>',
      '<p>   </p>',
      '<!-- a comment -->',
    ].join('');
    expect(plainText(root)).toBe(
      ['Release notes', 'Line one', 'line two', '\u2022 Alpha', '  \u2022 Nested', '\u2022 Beta', '4. Four', '9. Nine', 'Name\tRole', 'Ada\tLead', '\u2014\u2014\u2014', '  keep', '    indent', 'a  b', '[logo] after'].join('\n'),
    );
  });
});
