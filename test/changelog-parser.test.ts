import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseChangelog } from '../scripts/changelog-parser.js';

describe('changelog parser (docs site release history)', () => {
  it('parses every release in the real CHANGELOG.md, newest first', () => {
    const releases = parseChangelog(readFileSync(resolve('CHANGELOG.md'), 'utf8'));
    const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { version: string };
    expect(releases[0]?.version).toBe(pkg.version);
    expect(releases.at(-1)?.version).toBe('0.1.0');
    for (const release of releases) expect(release.html.length).toBeGreaterThan(0);
  });

  it('reads the release type from the Changesets heading', () => {
    const [major, minor, patch, initial] = parseChangelog(
      '# x\n\n## 4.0.0\n\n### Major Changes\n\n- a\n\n## 3.1.0\n\n### Minor Changes\n\n- b\n\n## 3.0.1\n\n### Patch Changes\n\n- c\n\n## 0.1.0\n\n### Initial release\n\n- d\n',
    );
    expect([major?.type, minor?.type, patch?.type, initial?.type]).toEqual(['major', 'minor', 'patch', 'initial']);
    expect(major?.html).toBe('<ul><li><p>a</p></li></ul>');
  });

  it('renders nested lists, sub-headings, bold and code, and drops commit prefixes', () => {
    const [release] = parseChangelog(
      '## 1.0.0\n\n### Patch Changes\n\n- 783e87e: **Title** with `code`\n  \n  ### Security\n  - nested one\n  - nested two\n',
    );
    expect(release?.html).toBe(
      '<ul><li><p><strong>Title</strong> with <code>code</code></p><h4>Security</h4><ul><li><p>nested one</p></li><li><p>nested two</p></li></ul></li></ul>',
    );
  });

  it('renders *italic* without touching code, bold, or lone asterisks', () => {
    const [release] = parseChangelog('## 1.0.0\n\n- fails *after* you **cancel**, `a*b*c`, `*/*`, 2 * 3 * 4\n');
    expect(release?.html).toBe(
      '<ul><li><p>fails <em>after</em> you <strong>cancel</strong>, <code>a*b*c</code>, <code>*/*</code>, 2 * 3 * 4</p></li></ul>',
    );
  });

  it('escapes HTML so changelog text cannot inject markup', () => {
    const [release] = parseChangelog('## 1.0.0\n\n- <img src=x onerror=alert(1)> & "q" `<b>`\n');
    expect(release?.html).not.toContain('<img');
    expect(release?.html).toContain('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;q&quot; <code>&lt;b&gt;</code>');
  });

  it('rejects malformed input instead of publishing a broken page', () => {
    expect(() => parseChangelog('# nothing here')).toThrow('No releases');
    expect(() => parseChangelog('## not-a-version\n- x')).toThrow('Bad version heading');
  });
});
