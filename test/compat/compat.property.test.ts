import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { compatPayload } from '../../src/compat';
import { runs } from '../property';

describe('compatPayload, for any text', () => {
  it('copies plain text exactly, whatever it holds', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 300 }), fc.constantFrom(undefined, 'text/plain', 'application/json'), (text, format) => {
        expect(compatPayload(text, { format })).toEqual({ kind: 'text', value: text });
      }),
      runs(500),
    );
  });

  it('as HTML, writes the HTML exactly, with plain text that is never empty and holds no markup it did not have', () => {
    const html = fc
      .array(
        fc.oneof(
          fc.string({ maxLength: 20 }).filter((part) => !/[<&]/.test(part)),
          fc.constantFrom('<p>', '</p>', '<b>', '</b>', '<br>', '<ul><li>', '</li></ul>', '<img src="x.png">', '<script>alert(1)</script>', '&amp;', '<td>', '</td>'),
        ),
        { minLength: 1, maxLength: 12 },
      )
      .map((parts) => parts.join(''))
      .filter((value) => value !== '');
    fc.assert(
      fc.property(html, (value) => {
        const payload = compatPayload(value, { format: 'text/html' });
        expect(payload.kind).toBe('html');
        if (payload.kind !== 'html') return;
        expect(payload.html).toBe(value);
        expect(payload.text.length).toBeGreaterThan(0);
        // A script's source never reaches the plain text; the HTML source is used only when nothing shows.
        if (payload.text !== value) expect(payload.text).not.toContain('alert(1)');
      }),
      runs(300),
    );
  });
});
