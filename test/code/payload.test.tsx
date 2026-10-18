import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { codeFromElement, codePayload } from '../../src/code';
import { useCopy } from '../../src/react';
import { createMockClipboardAdapter } from '../../src/testing';

const typed = (type: string): unknown => expect.objectContaining({ copyError: expect.objectContaining({ type }) });

function mount(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.append(host);
  return host.firstElementChild as HTMLElement;
}

afterEach(() => {
  document.body.innerHTML = '';
});

/** Prism with its line-numbers and copy-to-clipboard plugins. */
const PRISM = `<pre class="language-bash line-numbers"><code class="language-bash"><span class="token function">npm</span> <span class="token function">install</span> react-smart-copy
<span class="token comment"># done</span><span aria-hidden="true" class="line-numbers-rows"><span></span><span></span></span></code><div class="toolbar"><button>Copy</button></div></pre>`;

/** highlight.js with a line-numbers plugin: one table row per line. */
const HLJS = `<pre><code class="hljs"><table class="hljs-ln"><tbody>
<tr><td class="hljs-ln-line hljs-ln-numbers" data-line-number="1"><div class="hljs-ln-n">1</div></td><td class="hljs-ln-code"><div class="hljs-ln-line">const a = 1;</div></td></tr>
<tr><td class="hljs-ln-line hljs-ln-numbers" data-line-number="2"><div class="hljs-ln-n">2</div></td><td class="hljs-ln-code"><div class="hljs-ln-line">  return a;</div></td></tr>
</tbody></table></code></pre>`;

/** Rouge (Jekyll) with a gutter table. */
const ROUGE = `<div class="highlight"><table class="rouge-table"><tbody><tr><td class="rouge-gutter gl"><pre class="lineno">1
2</pre></td><td class="rouge-code"><pre>def hi
  puts 1</pre></td></tr></tbody></table></div>`;

describe('codeFromElement', () => {
  it('reads Prism blocks without line numbers or the Copy button', () => {
    expect(codeFromElement(mount(PRISM))).toBe('npm install react-smart-copy\n# done');
  });

  it('reads highlight.js and Rouge blocks without their gutters', () => {
    expect(codeFromElement(mount(HLJS))).toBe('const a = 1;\n  return a;');
    expect(codeFromElement(mount(ROUGE))).toBe('def hi\n  puts 1');
  });

  it('leaves out hidden, unselectable and marked parts, and the ignore selector', () => {
    const block = mount(
      `<pre><span style="user-select: none">$ </span>ls<span hidden>x</span><span style="display:none">y</span><span data-copy-ignore>z</span><span class="diff-marker">+</span><span style="-webkit-user-select:none">w</span><script>s()</script></pre>`,
    );
    expect(codeFromElement(block, { ignore: '.diff-marker' })).toBe('ls');
    expect(codeFromElement(block, { ignore: '.diff-marker', prompt: false })).toBe('ls');
  });

  it('reads a CRLF split across two tokens as one line break', () => {
    // Set as text: the HTML parser would already have turned the \r into \n.
    const block = mount('<pre><span style="color: red"></span></pre>');
    (block.firstElementChild as HTMLElement).textContent = 'a\r';
    block.append('\nb');
    expect(codeFromElement(block)).toBe('a\nb');
    expect(codePayload(block)).toMatchObject({ text: 'a\nb' });
  });

  it('skips comments and empty text nodes', () => {
    const block = mount('<pre>a<!-- note -->b</pre>');
    block.append(document.createTextNode(''), 'c');
    expect(codeFromElement(block)).toBe('abc');
  });

  it('starts a line for each block and each <br>, never two', () => {
    expect(codeFromElement(mount('<div><div>a</div><div><div>b</div></div>c<br>d</div>'))).toBe('a\nb\nc\nd');
    expect(codeFromElement(mount('<div><p>x</p>\n<p>y</p></div>'))).toBe('x\n\ny');
  });

  it('applies the text options: a session copies as its commands', () => {
    expect(codeFromElement(mount('<pre>$ ls\nfile.txt\n$ pwd</pre>'))).toBe('ls\npwd');
    expect(codeFromElement(mount('<pre>  a\n  b</pre>'), { dedent: false })).toBe('  a\n  b');
  });

  it('works on a parsed document with no window', () => {
    const doc = new DOMParser().parseFromString('<pre>x<span aria-hidden="true">1</span></pre>', 'text/html');
    expect(doc.defaultView).toBeNull();
    expect(codeFromElement(doc.querySelector('pre') as Element)).toBe('x');
  });

  it('rejects anything that is not an element, and invalid selectors', () => {
    expect(() => codeFromElement('x' as never)).toThrow(typed('invalid-payload'));
    expect(() => codeFromElement(null as never)).toThrow(typed('invalid-payload'));
    expect(() => codeFromElement(document.createTextNode('x') as never)).toThrow(typed('invalid-payload'));
    expect(() => codeFromElement(mount('<pre>x</pre>'), { ignore: '[[' })).toThrow(typed('invalid-payload'));
  });
});

describe('codePayload', () => {
  it('copies a string as text plus monospaced, escaped HTML', () => {
    expect(codePayload('if (a < b && c) {\n  go("x");\n}', { language: 'ts' })).toEqual({
      kind: 'html',
      text: 'if (a < b && c) {\n  go("x");\n}',
      html: `<pre style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace;white-space:pre;"><code class="language-ts">if (a &lt; b &amp;&amp; c) {\n  go(&quot;x&quot;);\n}</code></pre>`,
    });
  });

  it('copies text only when asked, and gives an empty text payload for empty code', () => {
    expect(codePayload('$ ls\nout', { html: false })).toEqual({ kind: 'text', value: 'ls' });
    expect(codePayload('   \n  ')).toEqual({ kind: 'text', value: '' });
  });

  it('keeps the HTML lines in step with the text: CRLF text, LF HTML', () => {
    const payload = codePayload('a\nb', { lineEnding: 'crlf', finalNewline: true });
    expect(payload).toMatchObject({ kind: 'html', text: 'a\r\nb\r\n' });
    expect(payload.kind === 'html' && payload.html.includes('<code>a\nb</code>')).toBe(true);
  });

  it('copies a highlighted element with its token colours and styles', () => {
    const block = mount(
      `<pre style="color: rgb(20, 20, 20); background-color: rgb(250, 250, 250)"><code><span style="color: rgb(200, 0, 0)">const</span> <b>a</b> = <i>1</i>; <span style="text-decoration: underline">u</span><span style="text-decoration: line-through">s</span><span style="color: var(--x)">v</span>\n<span class="line-number" style="color: blue">2</span>next</code></pre>`,
    );
    const payload = codePayload(block, { language: 'js' });
    expect(payload.kind).toBe('html');
    if (payload.kind !== 'html') return;
    expect(payload.text).toBe('const a = 1; usv\nnext');
    expect(payload.html).toContain('color:rgb(20, 20, 20);background-color:rgb(250, 250, 250);');
    expect(payload.html).toContain('<span style="color:rgb(200, 0, 0);">const</span>');
    expect(payload.html).toContain('<span style="font-weight:bold;">a</span>');
    expect(payload.html).toContain('<span style="font-style:italic;">1</span>');
    // A colour that is not a plain value never reaches the HTML.
    expect(payload.html).not.toContain('var(');
    const parsed = new DOMParser().parseFromString(payload.html, 'text/html');
    expect(parsed.querySelector('code')?.textContent).toBe('const a = 1; usv\nnext');
  });

  it('reads computed styles the way browsers report them', () => {
    const block = mount('<pre><span class="a">bold</span><span class="b">oblique</span><span class="c">plain</span></pre>');
    const real = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
      const style = real(element);
      const cls = element.getAttribute('class');
      const override: Record<string, string> = cls === 'a' ? { fontWeight: '700', textDecorationLine: 'line-through' } : cls === 'b' ? { fontStyle: 'oblique 10deg', textDecorationLine: '', textDecoration: 'underline solid' } : {};
      return new Proxy(style, {
        get: (target, key) => {
          if (typeof key === 'string' && key in override) return override[key];
          const value = Reflect.get(target, key) as unknown;
          return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
        },
      });
    });
    const payload = codePayload(block);
    expect(payload.kind === 'html' && payload.html).toContain('<span style="font-weight:bold;text-decoration:line-through;">bold</span><span style="font-style:italic;text-decoration:underline;">oblique</span>plain');
  });

  it('leaves out a block colour that is not a plain value; tokens then carry their own', () => {
    const block = mount('<pre><span style="color: rgb(1, 2, 3)">x</span></pre>');
    const real = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
      const style = real(element);
      return new Proxy(style, {
        get: (target, key) => {
          if (key === 'color' && element.localName === 'pre') return 'var(--fg)';
          const value = Reflect.get(target, key) as unknown;
          return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
        },
      });
    });
    const payload = codePayload(block);
    expect(payload.kind === 'html' && payload.html).toContain(`white-space:pre;"><code><span style="color:rgb(1, 2, 3);">x</span>`);
  });

  it('leaves out a transparent background and keeps the block bold when it is', () => {
    const block = mount('<pre style="font-weight: bold; background-color: transparent"><b>x</b></pre>');
    const payload = codePayload(block);
    expect(payload.kind === 'html' && payload.html).toContain('<code>x</code>');
    expect(payload.kind === 'html' && payload.html).not.toContain('background');
  });

  it('copies an element as text only, without reading styles', () => {
    const spy = vi.spyOn(window, 'getComputedStyle');
    expect(codePayload(mount('<pre><span style="color: red">x</span></pre>'), { html: false })).toEqual({ kind: 'text', value: 'x' });
    const block = mount('<pre>y</pre>');
    spy.mockClear();
    codePayload(block, { html: false });
    // Only the visibility checks of the walk: never once per token for colours.
    expect(spy.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('copies an element from a document with no window as plain HTML', () => {
    const doc = new DOMParser().parseFromString('<pre><b>x</b></pre>', 'text/html');
    expect(codePayload(doc.querySelector('pre') as Element)).toMatchObject({ kind: 'html', html: expect.stringContaining('<code>x</code>') as string });
  });

  it('rejects invalid options and sources', () => {
    expect(() => codePayload('x', { language: 'a b' })).toThrow(typed('invalid-payload'));
    expect(() => codePayload('x', { language: 'x'.repeat(65) })).toThrow(typed('invalid-payload'));
    expect(() => codePayload('x', { language: 3 as never })).toThrow(typed('invalid-payload'));
    expect(() => codePayload('x', { html: 'yes' as never })).toThrow(typed('invalid-payload'));
    expect(() => codePayload(42 as never)).toThrow(typed('invalid-payload'));
  });
});

describe('with useCopy', () => {
  it('writes the code with its HTML; empty code is an invalid-payload error', async () => {
    const mock = createMockClipboardAdapter();
    mock.queueSuccess();
    const block = mount('<pre>$ npm test\nok</pre>');
    let api: ReturnType<typeof useCopy> | undefined;
    function Probe() {
      api = useCopy({ adapter: mock.adapter });
      return null;
    }
    render(<Probe />);
    await act(async () => {
      await api?.copy(() => codePayload(block));
    });
    expect(mock.lastPayload()).toMatchObject({ kind: 'html', text: 'npm test' });
    await act(async () => {
      await api?.copy(() => codePayload('  '));
    });
    expect(api?.error?.type).toBe('invalid-payload');
    expect(mock.writeCount()).toBe(1);
  });
});
