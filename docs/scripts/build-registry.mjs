/**
 * Builds the shadcn registry (registry/ at the repository root) into docs/public/r, where the
 * docs site serves it: `npx shadcn add https://suprabhat02.github.io/react-smart-copy/r/copy-button.json`.
 *
 * It writes what `shadcn build` writes (each item with its files' content inlined, and the
 * index), without making the shadcn CLI and its dependencies part of the docs build. The shadcn
 * CLI itself reads the output in CI (the Registry job), which is what proves it.
 *
 * Items that depend on each other name the registry's address, so a test can build a registry
 * served from elsewhere: REGISTRY_URL=http://localhost:4400/r node docs/scripts/build-registry.mjs out/
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ITEM_SCHEMA = 'https://ui.shadcn.com/schema/registry-item.json';
const docs = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(docs, '..');
const url = (process.env.REGISTRY_URL ?? 'https://suprabhat02.github.io/react-smart-copy/r').replace(/\/+$/, '');
if (!/^https?:\/\/\S+$/.test(url)) throw new Error(`REGISTRY_URL is not an http(s) address: ${url}`);
const output = resolve(process.argv[2] ?? join(docs, 'public', 'r'));

const text = readFileSync(join(root, 'registry', 'registry.json'), 'utf8').replaceAll('{{REGISTRY_URL}}', url);
if (text.includes('{{')) throw new Error('A placeholder in registry/registry.json is not filled in.');
const manifest = JSON.parse(text);
/** The order `shadcn build` writes an item's fields in; any other field follows, before `type`. */
const ORDER = ['$schema', 'name', 'title', 'author', 'description', 'dependencies', 'devDependencies', 'registryDependencies', 'files', 'cssVars', 'css', 'envVars', 'meta', 'docs', 'categories'];

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
const names = new Set();
for (const item of manifest.items) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.name) || names.has(item.name)) throw new Error(`Item name "${item.name}" is not a unique kebab-case name.`);
  names.add(item.name);
  const files = item.files.map((file) => {
    const source = resolve(root, file.path);
    if (!source.startsWith(join(root, 'registry', 'items') + sep)) throw new Error(`${item.name}: ${file.path} is outside registry/items.`);
    const content = readFileSync(source, 'utf8');
    if (content.trim() === '') throw new Error(`${item.name}: ${file.path} is empty.`);
    return { path: file.path, content, type: file.type };
  });
  const fields = { $schema: ITEM_SCHEMA, ...item, files };
  const keys = [...ORDER.filter((key) => key in fields), ...Object.keys(fields).filter((key) => !ORDER.includes(key) && key !== 'type'), 'type'];
  writeFileSync(join(output, `${item.name}.json`), JSON.stringify(Object.fromEntries(keys.map((key) => [key, fields[key]])), null, 2));
}
// The index is the manifest itself, addresses filled in.
writeFileSync(join(output, 'registry.json'), text);
console.log(`Registry: ${manifest.items.length} items in ${output}, linked to ${url}`);
