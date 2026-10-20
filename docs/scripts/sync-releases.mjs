// Writes the Releases page from CHANGELOG.md, so the docs always match the changelog that ships in
// the package. Runs before `dev` and `build`. The page is generated: edit CHANGELOG.md (through a
// changeset), never the page. Publish dates come from the npm registry when it can be reached.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PAGE = fileURLToPath(new URL('../src/content/docs/project/releases.md', import.meta.url));
const PACKAGE = 'react-smart-copy';

/** @returns {Promise<Record<string, string>>} */
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
    console.warn(`releases: npm publish dates unavailable (${String(error)}); building without dates.`);
    return {};
  }
}

const changelog = readFileSync(`${ROOT}CHANGELOG.md`, 'utf8').replace(/\r\n/g, '\n');
const dates = await publishDates();
const formatDate = new Intl.DateTimeFormat('en', { dateStyle: 'long', timeZone: 'UTC' });

const body = changelog
  .split('\n')
  // The package name heading: the page has its own title.
  .filter((line, index) => !(index === 0 && line.startsWith('# ')))
  .map((line) => {
    const version = /^## (\d+\.\d+\.\d+\S*)\s*$/.exec(line);
    if (version) {
      const published = dates[version[1]];
      const when = published ? `\n\nReleased ${formatDate.format(new Date(published))}. ` : '\n\n';
      return `${line}${when}On [npm](https://www.npmjs.com/package/${PACKAGE}/v/${version[1]}) and [GitHub](https://github.com/suprabhat02/${PACKAGE}/releases/tag/v${version[1]})`;
    }
    // "### Minor Changes" -> "### Minor changes": sentence case, like every other heading.
    const kind = /^### (Major|Minor|Patch) Changes$/.exec(line);
    if (kind) return `### ${kind[1]} changes`;
    // Changesets prefix each entry with the commit that added it.
    return line.replace(/^- [0-9a-f]{7,40}: /, '- ');
  })
  .join('\n')
  .trim();

const page = `---
title: Releases
description: Every release of react-smart-copy, newest first. Generated from CHANGELOG.md.
editUrl: false
tableOfContents:
  maxHeadingLevel: 2
---

Every release is published to npm with provenance, and each GitHub release holds the exact tarball
with its Sigstore attestation. Versions follow [semantic versioning](https://semver.org/).

${body}
`;

mkdirSync(fileURLToPath(new URL('../src/content/docs/project/', import.meta.url)), { recursive: true });
writeFileSync(PAGE, page);
console.log(`releases: wrote ${String((body.match(/^## /gm) ?? []).length)} releases.`);
