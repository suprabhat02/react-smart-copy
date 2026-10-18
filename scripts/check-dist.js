// Inspects every published file with the package's own inspectCode: no bidi
// controls, invisible or control characters, or lookalike letters may ship.
// Runs after the build in `npm run verify`.

import { readdirSync, readFileSync } from 'node:fs';
import process from 'node:process';
import { inspectCode } from '../dist/code.js';

const kinds = ['bidi-control', 'invisible', 'control', 'mixed-script'];
const found = readdirSync('dist')
  .filter((name) => /\.(?:js|cjs|d\.ts|d\.cts)$/.test(name))
  .flatMap((name) =>
    inspectCode(readFileSync(`dist/${name}`, 'utf8'), { kinds }).findings.map(
      (finding) => `dist/${name}:${String(finding.line)}:${String(finding.column)} ${finding.label}`,
    ),
  );
if (found.length > 0) {
  console.error(`check-dist: ${String(found.length)} suspicious character(s) in the build:\n${found.join('\n')}`);
  process.exit(1);
}
console.log('check-dist: the build holds no hidden, reordering, control or lookalike characters.');
