import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cleanLinkUrl, linkPayload, readLink, resolveLinkUrl, textFragmentUrl } from '../../src/link';

// PROPERTY_RUNS raises the count for a local stress run; CI uses the default.
const RUNS = { numRuns: Number(process.env['PROPERTY_RUNS'] ?? 300) };

const SCHEMES = ['https:', 'http:', 'mailto:', 'tel:', 'javascript:', 'JavaScript:', 'data:', 'vbscript:', 'file:', 'blob:', 'ftp:', ' java\tscript:', ''];
const tricky = fc.string({ unit: fc.constantFrom(...Array.from('aZ09-_.~:/?#[]@!$&\'()*+,;=% <>"`\\\t\n\u00A0\u200B\u202E\u0430')), maxLength: 30 });
const anyLink = fc.tuple(fc.constantFrom(...SCHEMES), tricky).map(([scheme, rest]) => scheme + rest);

/** Resolves, or returns null for a rejected link. */
function attempt(link: string, clean = false): string | null {
  try {
    return resolveLinkUrl(link, { base: 'https://base.example/dir/', clean });
  } catch {
    return null;
  }
}

describe('links (properties)', () => {
  it('every accepted link is absolute, uses an allowed scheme and carries no credentials', () => {
    fc.assert(
      fc.property(anyLink, fc.boolean(), (link, clean) => {
        const url = attempt(link, clean);
        if (url === null) return;
        const parsed = new URL(url);
        expect(['https:', 'http:', 'mailto:', 'tel:']).toContain(parsed.protocol);
        expect(parsed.username + parsed.password).toBe('');
        expect(attempt(url, clean)).toBe(url); // Idempotent.
      }),
      RUNS,
    );
  });

  it('the copied anchor parses back to the same link and title', () => {
    const title = fc.string({ unit: fc.constantFrom(...Array.from('ab <>&"\'`=/\\[]()\u00A0')), minLength: 1, maxLength: 20 });
    fc.assert(
      fc.property(anyLink, title, (link, text) => {
        const url = attempt(link);
        if (url === null) return;
        const payload = linkPayload({ url, title: text });
        const anchors = new DOMParser().parseFromString(payload.html, 'text/html').body.querySelectorAll('a');
        expect(anchors).toHaveLength(1);
        expect((anchors[0] as HTMLAnchorElement).getAttribute('href')).toBe(url);
        const read = readLink({ html: payload.html });
        if (read !== null) expect(read.url).toBe(url);
      }),
      RUNS,
    );
  });

  it('a text directive decodes back to its terms, which never contain the syntax characters raw', () => {
    const words = fc.array(fc.string({ unit: fc.constantFrom(...Array.from('ab-,&#%:~ \u00E9\u4E2D')), minLength: 1, maxLength: 6 }), { minLength: 1, maxLength: 14 });
    fc.assert(
      fc.property(words, (list) => {
        const passage = list.join(' ');
        if (passage.trim() === '') return;
        const href = textFragmentUrl('https://e.example/#top', passage);
        const directive = href.slice(href.indexOf(':~:text=') + ':~:text='.length);
        expect(directive).not.toMatch(/[-&#\s]/);
        const terms = directive.split(',').map(decodeURIComponent);
        const collapsed = passage.replace(/\s+/g, ' ').trim();
        if (terms.length === 1) expect(terms[0]).toBe(collapsed);
        else {
          expect(collapsed.startsWith(terms[0] as string)).toBe(true);
          expect(collapsed.endsWith(terms[1] as string)).toBe(true);
        }
      }),
      RUNS,
    );
  });

  it('cleaning removes only tracking parameters and never changes anything else', () => {
    const name = fc.constantFrom('utm_source', 'UTM_x', 'fbclid', 'gclid', 'q', 'id', 'page', 'utm', 'ref');
    const value = fc.string({ unit: fc.constantFrom('a', '1', ' ', '&', '='), maxLength: 4 });
    fc.assert(
      fc.property(fc.array(fc.tuple(name, value), { maxLength: 6 }), (params) => {
        const url = new URL('https://shop.example/p#reviews');
        for (const [key, val] of params) url.searchParams.append(key, val);
        const cleaned = new URL(cleanLinkUrl(url));
        const kept = params.filter(([key]) => !/^(utm_|fbclid$|gclid$)/i.test(key));
        expect([...cleaned.searchParams]).toEqual(kept);
        expect(cleaned.hash).toBe('#reviews');
        expect(cleaned.pathname).toBe('/p');
      }),
      RUNS,
    );
  });
});
