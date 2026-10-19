// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync('site/index.html', 'utf8');
const policy = /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1] ?? '';
const directive = (name: string): string[] =>
  policy
    .split(';')
    .map((part) => part.trim().split(/\s+/))
    .find(([key]) => key === name)
    ?.slice(1) ?? [];

describe('the documentation site Content Security Policy', () => {
  it('allows each inline script by its hash, and nothing else inline', () => {
    const inline = [...html.matchAll(/<script(?![^>]*(?:\bsrc=|type="application\/ld\+json"))[^>]*>([\s\S]*?)<\/script>/g)].map(
      (match) => `'sha256-${createHash('sha256').update(match[1] as string).digest('base64')}'`,
    );
    expect(inline.length).toBeGreaterThan(0);
    expect(directive('script-src').filter((source) => source.startsWith("'sha256-")).sort()).toEqual(inline.sort());
    expect(directive('script-src')).not.toContain("'unsafe-inline'");
    expect(policy).not.toContain('unsafe-eval');
  });

  it('blocks plugins, base and form hijacking, and only reaches the APIs it uses', () => {
    expect(directive('default-src')).toEqual(["'self'"]);
    expect(directive('object-src')).toEqual(["'none'"]);
    expect(directive('base-uri')).toEqual(["'none'"]);
    expect(directive('form-action')).toEqual(["'none'"]);
    expect(directive('connect-src')).toEqual(["'self'", 'https://api.github.com', 'https://registry.npmjs.org']);
  });

  it('never parses dropped or pasted HTML into the page', () => {
    for (const file of ['site/demos.js', 'site/site.js', 'site/lib.js']) {
      const sinks = readFileSync(file, 'utf8')
        .split('\n')
        .filter((line) => /\.innerHTML\s*=|insertAdjacentHTML|document\.write/.test(line));
      // The remaining sinks render HTML escaped by this site: changelog.json (built from CHANGELOG.md) and highlight().
      expect(sinks.every((line) => /release\.html|highlight\(/.test(line)), `${file}: ${sinks.join(' | ')}`).toBe(true);
    }
  });
});
