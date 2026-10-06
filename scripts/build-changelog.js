// Builds site/changelog.json from CHANGELOG.md for the docs site's release
// history. Runs in `npm run site:build`, so the docs always match the
// changelog that ships in the package. Publish dates come from the npm
// registry; a version that isn't published yet gets `date: null`.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseChangelog } from './changelog-parser.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PACKAGE = 'react-smart-copy';

async function publishDates() {
  try {
    const response = await fetch(`https://registry.npmjs.org/${PACKAGE}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
    const { time } = await response.json();
    return time ?? {};
  } catch (error) {
    console.warn(`changelog: npm publish dates unavailable (${String(error)}); building without dates.`);
    return {};
  }
}

const releases = parseChangelog(readFileSync(`${ROOT}CHANGELOG.md`, 'utf8'));
const dates = await publishDates();
const output = releases.map((release) => ({ ...release, date: dates[release.version] ?? null }));
writeFileSync(`${ROOT}site/changelog.json`, `${JSON.stringify({ generatedAt: new Date().toISOString(), releases: output }, null, 2)}\n`);
console.log(`changelog: wrote ${String(output.length)} releases (latest ${output[0].version}).`);
