import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkCorpus } from './check';

/**
 * The corpus: real clipboard captures from real apps (`captures/`), and what the library
 * made of each when a reviewer last accepted it (`expected/`). Add a capture with the
 * Clipboard Inspector in the docs, then `npm run corpus:accept` and review the new
 * expected file. See `captures/README.md`.
 */
describe('the corpus of real clipboard captures', () => {
  it('holds only well-formed, public captures that convert as accepted', () => {
    expect(checkCorpus(join(import.meta.dirname, 'captures'), join(import.meta.dirname, 'expected'), process.env['CORPUS_ACCEPT'] === '1')).toEqual([]);
  });
});
