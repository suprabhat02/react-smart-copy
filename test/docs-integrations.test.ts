// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fixSearchShortcut, focusableCodeBlocks } from '../docs/integrations/a11y.mjs';
import { policy } from '../docs/integrations/csp.mjs';

const sha = (text: string): string => `'sha256-${createHash('sha256').update(text).digest('base64')}'`;
const directive = (csp: string, name: string): string[] =>
  csp
    .split(';')
    .map((part) => part.trim().split(/\s+/))
    .find(([key]) => key === name)
    ?.slice(1) ?? [];

describe('the docs Content Security Policy', () => {
  const page = [
    '<head><script>theme()</script><script type="module" src="/a.js"></script>',
    '<script type="application/ld+json">{"@type":"WebSite"}</script><style>a{color:red}</style></head>',
    '<body><script>theme()</script><script type="module">search()</script></body>',
  ].join('');
  const csp = policy(page);

  it('allows each inline script and style by its hash, once, and nothing else inline', () => {
    expect(directive(csp, 'script-src')).toEqual(["'self'", "'wasm-unsafe-eval'", ...[sha('theme()'), sha('search()')].sort()]);
    expect(directive(csp, 'style-src')).toEqual(["'self'", sha('a{color:red}')]);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it('blocks plugins, base and form hijacking, and never connects to another origin', () => {
    expect(directive(csp, 'default-src')).toEqual(["'self'"]);
    expect(directive(csp, 'object-src')).toEqual(["'none'"]);
    expect(directive(csp, 'base-uri')).toEqual(["'none'"]);
    expect(directive(csp, 'form-action')).toEqual(["'none'"]);
    expect(directive(csp, 'connect-src')).toEqual(["'self'"]);
  });
});

describe('the docs accessibility fixes', () => {
  const button =
    '<button data-open-modal disabled aria-label="Search" aria-keyshortcuts="Control+K" class="x"><svg aria-hidden="true"></svg>' +
    '<span class="sl-hidden" aria-hidden="true">Search</span><kbd class="sl-hidden md:sl-flex x"><kbd>Ctrl</kbd><kbd>K</kbd></kbd></button>';

  it('names the search button by its content, and hides its shortcut keys', () => {
    expect(fixSearchShortcut(button)).toBe(
      '<button data-open-modal disabled aria-keyshortcuts="Control+K" class="x"><span class="sr-only">Search</span><svg aria-hidden="true"></svg>' +
        '<span class="sl-hidden" aria-hidden="true">Search</span><kbd aria-hidden="true" class="sl-hidden md:sl-flex x"><kbd>Ctrl</kbd><kbd>K</kbd></kbd></button>',
    );
  });

  it('leaves pages without search alone, and fails loudly when the markup changes', () => {
    expect(fixSearchShortcut('<p>No search</p>')).toBe('<p>No search</p>');
    expect(() => fixSearchShortcut('<button data-open-modal>Search</button>', 'x.html')).toThrow(/x\.html: the search button's markup changed/);
  });

  it('makes every code block focusable', () => {
    expect(focusableCodeBlocks('<pre data-language="ts"><code>a</code></pre><pre data-language="sh"></pre>')).toBe(
      '<pre data-language="ts" tabindex="0"><code>a</code></pre><pre data-language="sh" tabindex="0"></pre>',
    );
  });
});

describe('the live demos', () => {
  it('never parse dropped or pasted HTML into the page', () => {
    for (const file of ['docs/src/components/demos/demos.js', 'docs/src/components/demos/lib.js']) {
      const sinks = readFileSync(file, 'utf8')
        .split('\n')
        .filter((line) => /\.innerHTML\s*=|insertAdjacentHTML|document\.write/.test(line));
      // The one remaining sink renders code samples escaped by highlight().
      expect(sinks.every((line) => line.includes('highlight(')), `${file}: ${sinks.join(' | ')}`).toBe(true);
    }
  });
});
