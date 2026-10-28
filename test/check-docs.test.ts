// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DOCS_URL, docsLinks, importsModule, isDocsPage, packageImports, README_MAX_BYTES } from '../scripts/check-docs.mjs';

describe('check-docs', () => {
  it('keeps the README well under what npm shows', () => {
    expect(README_MAX_BYTES).toBeLessThan(65_536);
  });

  it('finds the docs pages a README links to, once each', () => {
    const markdown = `See [email](${DOCS_URL}modules/email/), [home](${DOCS_URL}) and [email again](${DOCS_URL}modules/email/). Not [this](https://example.com/react-smart-copy/x/).`;
    expect(docsLinks(markdown)).toEqual(['modules/email/', '']);
  });

  it('knows which paths are pages of the docs site', () => {
    const docs = 'docs/src/content/docs';
    expect(isDocsPage('', docs)).toBe(true);
    expect(isDocsPage('modules/email/', docs)).toBe(true);
    expect(isDocsPage('guides/security', docs)).toBe(true);
    expect(isDocsPage('modules/nothing/', docs)).toBe(false);
    expect(isDocsPage('modules/', docs)).toBe(false);
  });

  it('reads the names imported from the package, in code and in Markdown', () => {
    const source = [
      '```tsx',
      'import { useCopy, type CopyStatus } from "react-smart-copy";',
      "import {\n  parseNumber as read,\n  formatNumber,\n} from 'react-smart-copy/number';",
      'import type { ParsedNumber } from "react-smart-copy/number";',
      'import { useCopy } from "react-smart-copy";',
      'import * as everything from "react-smart-copy/email";',
      'import { z } from "zod";',
      'import { something } from "react-smart-copy-plugin";',
      '```',
    ].join('\n');
    expect(packageImports(source)).toEqual({
      'react-smart-copy': ['useCopy', 'CopyStatus'],
      'react-smart-copy/number': ['parseNumber', 'formatNumber', 'ParsedNumber'],
    });
  });

  it('writes a module that type-checks every imported name', () => {
    expect(importsModule({ 'react-smart-copy/number': ['parseNumber', 'ParsedNumber'], 'react-smart-copy': ['useCopy'] })).toBe(
      [
        "import { useCopy as _1 } from 'react-smart-copy';",
        'export { _1 };',
        "import { parseNumber as _2, ParsedNumber as _3 } from 'react-smart-copy/number';",
        'export { _2, _3 };',
        '',
      ].join('\n'),
    );
  });
});
