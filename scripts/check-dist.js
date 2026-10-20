// Checks the build in `npm run verify`, after `npm run build`:
//
// 1. Every published file, shared chunks included, is inspected with the package's own
//    inspectCode: no bidi controls, invisible or control characters, or lookalike letters may ship.
// 2. Only the React entry is a client module: "use client" heads dist/index.js and dist/index.cjs
//    and nothing else, and no other entry point reaches React through the chunks it imports, so
//    server code can import them.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { inspectCode } from '../dist/code.js';

const DIST = 'dist';
const files = readdirSync(DIST, { recursive: true, encoding: 'utf8' }).filter((name) => /\.(?:js|cjs|d\.ts|d\.cts)$/.test(name));
const read = (name) => readFileSync(join(DIST, name), 'utf8');
const problems = [];

const kinds = ['bidi-control', 'invisible', 'control', 'mixed-script'];
for (const name of files) {
  for (const finding of inspectCode(read(name), { kinds }).findings) {
    problems.push(`dist/${name}:${String(finding.line)}:${String(finding.column)} ${finding.label}`);
  }
}

const code = files.filter((name) => /\.c?js$/.test(name));
const CLIENT_ENTRIES = new Set(['index.js', 'index.cjs']);
const DIRECTIVE = /^\s*(?:\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*["']use client["']/;
for (const name of code) {
  const client = DIRECTIVE.test(read(name));
  if (client !== CLIENT_ENTRIES.has(name)) problems.push(`dist/${name}: ${client ? 'has' : 'lacks'} "use client"`);
}

/** Modules a built file imports or requires: package names, or paths relative to dist/. */
function importsOf(name) {
  const text = read(name);
  const found = [
    ...text.matchAll(/(?:^|[;\n])\s*(?:import|export)\s[^'"]*?from\s*["']([^"']+)["']/g),
    ...text.matchAll(/(?:^|[;\n])\s*import\s*["']([^"']+)["']/g),
    ...text.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g),
  ].map((match) => match[1]);
  return found.map((specifier) => (specifier.startsWith('.') ? join(name, '..', specifier) : specifier));
}

for (const entry of code.filter((name) => !name.includes('/') && !CLIENT_ENTRIES.has(name))) {
  const seen = new Set();
  const queue = [entry];
  while (queue.length > 0) {
    const current = queue.shift();
    if (seen.has(current)) continue;
    seen.add(current);
    for (const target of importsOf(current)) {
      if (target === 'react' || target.startsWith('react/')) problems.push(`dist/${entry} reaches ${target} through dist/${current}`);
      else if (!files.includes(target) && /^[a-z@]/.test(target)) problems.push(`dist/${current} imports ${target}, which is not part of the package`);
      else if (files.includes(target)) queue.push(target);
    }
  }
}

if (problems.length > 0) {
  console.error(`check-dist: ${String(problems.length)} problem(s) in the build:\n${problems.join('\n')}`);
  process.exit(1);
}
console.log(
  `check-dist: ${String(files.length)} files hold no hidden, reordering, control or lookalike characters; only the React entry is a client module, and no other entry reaches React.`,
);
