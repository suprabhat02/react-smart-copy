/**
 * registry/registry.json against what it describes: every component file is listed and named
 * after its item, every item depends on a version of this package that has what it uses, and an
 * item named as a dependency exists.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

interface Item {
  readonly name: string;
  readonly type: string;
  readonly dependencies: readonly string[];
  readonly registryDependencies: readonly string[];
  readonly files: readonly { readonly path: string; readonly type: string }[];
}

// Tests run from the repository root (jsdom gives import.meta.url no file: scheme).
const root = process.cwd();
const manifest = JSON.parse(readFileSync(join(root, 'registry', 'registry.json'), 'utf8')) as { name: string; homepage: string; items: Item[] };
const version = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }).version;
const [major, minor] = version.split('.').map(Number) as [number, number];

describe('the shadcn registry manifest', () => {
  it('lists every component file once, each in an item of its own name', () => {
    const files = readdirSync(join(root, 'registry', 'items')).sort();
    expect(manifest.items.flatMap((item) => item.files.map((file) => file.path.replace('registry/items/', ''))).sort()).toEqual(files);
    for (const item of manifest.items) {
      expect(item.files.map((file) => file.path), item.name).toEqual([`registry/items/${item.name}.tsx`]);
      expect([item.type, ...item.files.map((file) => file.type)]).toEqual(['registry:component', 'registry:component']);
    }
  });

  it('depends on a released version of this package, no newer than this one', () => {
    for (const item of manifest.items) {
      const range = item.dependencies.find((dependency) => dependency.startsWith('react-smart-copy@'));
      const match = /^react-smart-copy@\^(\d+)\.(\d+)\.\d+$/.exec(range ?? '');
      expect(match, item.name).not.toBeNull();
      const [, wantMajor, wantMinor] = (match as RegExpExecArray).map(Number) as [number, number, number];
      expect(wantMajor === major && wantMinor <= minor, `${item.name} wants ${String(range)}, this is ${version}`).toBe(true);
    }
  });

  it('names only shadcn items and items of its own that exist, through the address placeholder', () => {
    const names = new Set(manifest.items.map((item) => item.name));
    for (const item of manifest.items) {
      for (const dependency of item.registryDependencies) {
        if (dependency.startsWith('{{REGISTRY_URL}}/')) expect(names.has(dependency.slice('{{REGISTRY_URL}}/'.length).replace(/\.json$/, '')), dependency).toBe(true);
        else expect(['button', 'input'], dependency).toContain(dependency);
      }
    }
    expect(manifest.homepage).toBe('https://suprabhat02.github.io/react-smart-copy/guides/shadcn/');
  });
});
