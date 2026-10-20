import { describe, expect, it, vi } from 'vitest';
import { parseInertHtml } from '../src/core/inert-html';

describe('parseInertHtml', () => {
  it('removes every event handler attribute at once, on HTML and SVG elements, in any case', () => {
    const doc = parseInertHtml('<img src="x" onerror="x()" ONCLICK="y()" alt="a"><svg><image href="i.png" onload="z()"/></svg><p onmouseover="1" data-on="keep" title="t">p</p>');
    const handlers = Array.from(doc.querySelectorAll('*')).flatMap((element) => Array.from(element.attributes, (attribute) => attribute.name)).filter((name) => /^on/i.test(name));
    expect(handlers).toEqual([]);
    expect(doc.querySelector('img')?.getAttribute('alt')).toBe('a');
    expect(doc.querySelector('img')?.getAttribute('src')).toBe('x');
    expect(doc.querySelector('p')?.getAttribute('data-on')).toBe('keep');
    expect(doc.querySelector('p')?.getAttribute('title')).toBe('t');
  });

  it('never runs scripts or handlers', async () => {
    const spy = vi.fn();
    (globalThis as Record<string, unknown>)['__inert'] = spy;
    const doc = parseInertHtml('<script>__inert()</script><img src="x" onerror="__inert()"><body onload="__inert()">');
    doc.querySelector('img')?.dispatchEvent(new Event('error'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(spy).not.toHaveBeenCalled();
    delete (globalThis as Record<string, unknown>)['__inert'];
  });
});
