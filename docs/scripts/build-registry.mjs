/**
 * Builds the shadcn registry (registry/ at the repository root) into docs/public/r, where the
 * docs site serves it: `npx shadcn add https://suprabhat02.github.io/react-smart-copy/r/copy-button.json`.
 *
 * Items that depend on each other name the registry's address, so a test can build a registry
 * served from elsewhere: REGISTRY_URL=http://localhost:4400/r node scripts/build-registry.mjs out/
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const docs = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(docs, '..');
const url = (process.env.REGISTRY_URL ?? 'https://suprabhat02.github.io/react-smart-copy/r').replace(/\/+$/, '');
if (!/^https?:\/\/[^\s]+$/.test(url)) throw new Error(`REGISTRY_URL is not an http(s) address: ${url}`);
const output = resolve(process.argv[2] ?? join(docs, 'public', 'r'));

const template = readFileSync(join(root, 'registry', 'registry.json'), 'utf8');
const work = join(root, 'registry', '.build');
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
const manifest = join(work, 'registry.json');
writeFileSync(manifest, template.replaceAll('{{REGISTRY_URL}}', url));

rmSync(output, { recursive: true, force: true });
execFileSync(join(docs, 'node_modules', '.bin', 'shadcn'), ['build', manifest, '--output', output, '--cwd', root], { stdio: 'inherit' });
rmSync(work, { recursive: true, force: true });

// Every item, and no placeholder left behind.
const built = JSON.parse(readFileSync(join(output, 'registry.json'), 'utf8'));
for (const { name } of built.items) {
  const item = readFileSync(join(output, `${name}.json`), 'utf8');
  if (item.includes('{{')) throw new Error(`${name}.json still holds a placeholder`);
  if (!JSON.parse(item).files?.every((file) => typeof file.content === 'string' && file.content.length > 0)) throw new Error(`${name}.json has a file without content`);
}
console.log(`Registry: ${built.items.length} items in ${output}, linked to ${url}`);
