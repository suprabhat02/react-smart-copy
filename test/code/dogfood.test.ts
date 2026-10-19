// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inspectCode } from '../../src/code';

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path);
    return /\.(?:ts|tsx|js|mjs|css|html|json|md)$/.test(entry.name) ? [path] : [];
  });
}

describe('this repository, inspected by inspectCode', () => {
  // Typographic punctuation is fine in prose and comments; anything that hides or reorders text is not.
  const kinds = ['bidi-control', 'invisible', 'control', 'mixed-script'] as const;

  it.each(['src', 'test', 'e2e', 'scripts', 'site'])('%s holds no hidden, reordering or lookalike characters', (dir) => {
    const found = files(dir)
      .filter((path) => !/site\/(?:core|capture|table|structured|markdown|code|image|link|share|color|rich)\.js$|site\/changelog\.json$/.test(path))
      .flatMap((path) => inspectCode(readFileSync(path, 'utf8'), { kinds }).findings.map((finding) => `${path}:${String(finding.line)}:${String(finding.column)} ${finding.label}`));
    expect(found).toEqual([]);
  });
});
