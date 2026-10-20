// Copies the built library into the docs site, which runs on the real package: the entry points
// it imports (site/<entry>.js) and the shared chunks they import (site/chunks/). Runs in
// `npm run site:build`, after the build. Fails if any import in the copied files has no file.

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';

const ENTRIES = ['core', 'capture', 'table', 'structured', 'markdown', 'code', 'image', 'link', 'share', 'color', 'rich'];

rmSync('site/chunks', { recursive: true, force: true });
mkdirSync('site/chunks');
for (const entry of ENTRIES) copyFileSync(`dist/${entry}.js`, `site/${entry}.js`);
const chunks = readdirSync('dist/chunks').filter((name) => name.endsWith('.js'));
for (const chunk of chunks) copyFileSync(`dist/chunks/${chunk}`, `site/chunks/${chunk}`);

const missing = [];
for (const file of [...ENTRIES.map((entry) => `site/${entry}.js`), ...chunks.map((chunk) => `site/chunks/${chunk}`)]) {
  for (const [, specifier] of readFileSync(file, 'utf8').matchAll(/(?:from|import)\s*["'](\.[^"']+)["']/g)) {
    const target = join(dirname(file), specifier);
    if (!existsSync(target)) missing.push(`${file} imports ${specifier}, which was not copied`);
  }
}
if (missing.length > 0) {
  console.error(`copy-site-lib:\n${missing.join('\n')}`);
  process.exit(1);
}
console.log(`copy-site-lib: ${String(ENTRIES.length)} entry points and ${String(chunks.length)} shared chunks copied into site/.`);
