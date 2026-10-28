// Keeps the README and the docs true to the package. Run after `npm run build`:
// - the README fits on npm's package page (the registry cuts READMEs at 64 KiB);
// - every docs link in the README leads to a page of the docs site;
// - every name the README, the docs and the demos import from the package is exported, with
//   the types checked by TypeScript against the built declarations.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

/** Bytes the README may take: npm keeps 65,536, and the page needs room to grow. */
export const README_MAX_BYTES = 60_000;
export const DOCS_URL = 'https://suprabhat02.github.io/react-smart-copy/';

/** The docs pages a README link points to, as paths below the docs URL (`modules/email/`). */
export function docsLinks(markdown) {
  const links = new Set();
  const escaped = DOCS_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const match of markdown.matchAll(new RegExp(`${escaped}([\\w/-]*)`, 'g'))) links.add(match[1]);
  return [...links];
}

/** Whether `path` (`modules/email/`) is a page of the docs site, whose sources are in `docsDir`. */
export function isDocsPage(path, docsDir) {
  const base = path.replace(/\/$/, '');
  const candidates = base === '' ? ['index.md', 'index.mdx'] : [`${base}.md`, `${base}.mdx`, `${base}/index.md`, `${base}/index.mdx`];
  return candidates.some((candidate) => {
    try {
      return statSync(join(docsDir, candidate)).isFile();
    } catch {
      return false;
    }
  });
}

/**
 * The names `source` imports from the package, by entry point: `{ 'react-smart-copy/email':
 * ['parseAddresses'] }`. Reads `import { a, type B, c as d } from "react-smart-copy/…"` in
 * code and in fenced code blocks alike. Namespace and default imports are not read.
 */
export function packageImports(source) {
  const imports = {};
  for (const match of source.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["'](react-smart-copy(?:\/[\w-]+)?)["']/g)) {
    const names = match[1]
      .split(',')
      .map((part) => part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim())
      .filter((name) => /^[A-Za-z_$][\w$]*$/.test(name));
    imports[match[2]] = [...new Set([...(imports[match[2]] ?? []), ...names])];
  }
  return imports;
}

/** A TypeScript module that imports and re-exports every name in `imports`, to type-check. */
export function importsModule(imports) {
  const lines = [];
  let index = 0;
  for (const [entry, names] of Object.entries(imports).sort(([a], [b]) => a.localeCompare(b))) {
    const aliases = names.map((name) => `${name} as _${String((index += 1))}`);
    lines.push(`import { ${aliases.join(', ')} } from '${entry}';`, `export { ${aliases.map((alias) => alias.split(' as ')[1]).join(', ')} };`);
  }
  return `${lines.join('\n')}\n`;
}

function filesIn(dir, pattern) {
  return readdirSync(dir, { recursive: true })
    .map((name) => join(dir, String(name)))
    .filter((path) => pattern.test(path) && statSync(path).isFile());
}

function main() {
  const root = process.cwd();
  const problems = [];
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  const bytes = Buffer.byteLength(readme);
  if (bytes > README_MAX_BYTES) problems.push(`README.md is ${String(bytes)} bytes: npm shows at most 64 KiB of it, keep it under ${String(README_MAX_BYTES)}.`);
  const docsDir = join(root, 'docs/src/content/docs');
  for (const link of docsLinks(readme)) {
    if (!isDocsPage(link, docsDir)) problems.push(`README.md links to ${DOCS_URL}${link}, which is not a docs page.`);
  }

  const sources = [join(root, 'README.md'), ...filesIn(docsDir, /\.mdx?$/), ...filesIn(join(root, 'docs/src/components'), /\.(?:js|astro)$/)];
  const imports = {};
  for (const path of sources) {
    for (const [entry, names] of Object.entries(packageImports(readFileSync(path, 'utf8')))) {
      imports[entry] = [...new Set([...(imports[entry] ?? []), ...names])];
    }
  }
  const dir = mkdtempSync(join(root, 'consumer/.docs-'));
  try {
    writeFileSync(join(dir, 'imports.ts'), importsModule(imports));
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ extends: '../tsconfig.bundler.json', compilerOptions: { skipLibCheck: true }, files: ['imports.ts'] }));
    execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', join(dir, 'tsconfig.json')], { stdio: 'pipe' });
  } catch (error) {
    const output = String(error.stdout ?? error.message);
    const missing = [...output.matchAll(/'"([^"]+)"' has no exported member(?: named)? '(\w+)'/g)].map(([, entry, name]) => `${name} is not exported by ${entry}, but the docs import it.`);
    problems.push(...(missing.length > 0 ? missing : [output.trim()]));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  if (problems.length > 0) {
    console.error(`check-docs: ${String(problems.length)} problem(s):\n${problems.join('\n')}`);
    process.exit(1);
  }
  const count = Object.values(imports).reduce((total, names) => total + names.length, 0);
  console.log(
    `check-docs: README.md is ${String(bytes)} bytes with ${String(docsLinks(readme).length)} docs links, all to pages; ${String(count)} names imported in ${String(sources.length)} files (${relative(root, docsDir)} and the README) are all exported.`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
