import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { cleanCode, codeFromElement, codePayload, inspectCode, normalizeCode, pasteToCode } from '../../src/code';

// Property tests run hundreds of cases, often next to other suites on shared CI runners.
vi.setConfig({ testTimeout: 60_000 });

// PROPERTY_RUNS raises the count for a local stress run; CI uses the default.
const RUNS = { numRuns: Number(process.env['PROPERTY_RUNS'] ?? 300) };

/** Code-like text rich in everything the scanner looks for. */
const SUSPICIOUS = [
  '\u202E', '\u2066', '\u2069', '\u200E', '\u200B', '\u200C', '\u200D', '\u2060', '\uFEFF', '\u00AD', '\u3164', '\u{E0041}',
  '\uFE0F', '\u{E0100}', '\u0000', '\u001B', '\u007F', '\u0085', '\u2028', '\u00A0', '\u2003', '\u3000', '\u201C', '\u201D',
  '\u2019', '\u2013', '\u2014', '\u2026', '\u037E', '\uFF08', '\u0430', '\u0440', '\u03BF', '\u043B', '\u4E2D', '\u0645',
  '\u{1F468}',
];
const unit = fc.oneof(
  { weight: 5, arbitrary: fc.constantFrom(...Array.from('abcxyz_$019 (){};=\'"\t\n\r$>#+-@:/')) },
  { weight: 3, arbitrary: fc.constantFrom(...SUSPICIOUS) },
  { weight: 1, arbitrary: fc.string({ unit: 'grapheme', minLength: 1, maxLength: 1 }) },
);
const code = fc.string({ unit, maxLength: 40 });

describe('inspectCode and cleanCode (properties)', () => {
  it('every finding points at the character it names, in order and within its line', () => {
    fc.assert(
      fc.property(code, (text) => {
        const { findings } = inspectCode(text, { maxFindings: Infinity });
        let last = -1;
        for (const finding of findings) {
          expect(finding.index).toBeGreaterThan(last);
          last = finding.index;
          expect(text.codePointAt(finding.index)).toBe(finding.codePoint);
          expect(String.fromCodePoint(finding.codePoint)).toHaveLength(finding.length);
          const lineStart = finding.index - finding.column + 1;
          expect(lineStart === 0 || /[\n\r]/.test(text.charAt(lineStart - 1))).toBe(true);
          expect(text.slice(lineStart, finding.index)).not.toMatch(/[\n\r]/);
        }
      }),
      RUNS,
    );
  });

  it('cleaning leaves nothing it could fix, and cleaning again changes nothing', () => {
    fc.assert(
      fc.property(code, (text) => {
        const { code: cleaned, fixed, remaining } = cleanCode(text);
        expect(inspectCode(cleaned, { maxFindings: Infinity }).findings).toEqual(remaining);
        expect(remaining.every((finding) => finding.replacement === null && finding.kind === 'mixed-script')).toBe(true);
        expect(cleanCode(cleaned)).toEqual({ code: cleaned, fixed: [], remaining });
        // Every fix is reported at a character of the original text that is suspicious.
        for (const finding of fixed) expect(text.codePointAt(finding.index)).toBe(finding.codePoint);
      }),
      RUNS,
    );
  });

  it('plain ASCII code is never flagged', () => {
    fc.assert(
      fc.property(fc.string({ unit: fc.constantFrom(...Array.from(' \t\n\r\fabcXYZ09_$(){}[];:\'"`~!@#%^&*-+=|\\/<>,.?')) }), (text) => {
        expect(inspectCode(text).findings).toEqual([]);
      }),
      RUNS,
    );
  });
});

describe('normalizeCode, codePayload and pasteToCode (properties)', () => {
  it('normalising is idempotent and never leaves trailing whitespace or CR', () => {
    fc.assert(
      fc.property(code, fc.boolean(), (text, clean) => {
        const once = normalizeCode(text, { prompt: false, clean });
        expect(normalizeCode(once, { prompt: false, clean })).toBe(once);
        expect(once).not.toMatch(/[ \t]$|[ \t]\n|\r/m);
      }),
      RUNS,
    );
  });

  it('the HTML of a copied block holds exactly the copied text', () => {
    const token = fc.record({ text: code, color: fc.option(fc.constantFrom('red', 'rgb(1, 2, 3)', 'var(--x)'), { nil: undefined }), gutter: fc.boolean() });
    fc.assert(
      fc.property(fc.array(token, { maxLength: 8 }), (tokens) => {
        const pre = document.createElement('pre');
        for (const { text, color, gutter } of tokens) {
          const span = document.createElement('span');
          span.textContent = text;
          if (color !== undefined) span.style.color = color;
          if (gutter) span.className = 'line-number';
          pre.append(span);
        }
        const payload = codePayload(pre, { prompt: false });
        const text = codeFromElement(pre, { prompt: false });
        if (payload.kind === 'text') {
          expect(payload.value).toBe('');
          expect(text).toBe('');
          return;
        }
        expect(payload.text).toBe(text);
        const parsed = new DOMParser().parseFromString(payload.html, 'text/html');
        expect(parsed.querySelector('code')?.textContent).toBe(text.replace(/\0/g, '\uFFFD'));
        expect(parsed.querySelectorAll('script, [onerror]')).toHaveLength(0);
      }),
      RUNS,
    );
  });

  it('pasted code is indented after its first line and holds nothing fixable', () => {
    fc.assert(
      fc.property(code, fc.constantFrom('', '  ', '\t'), (text, indent) => {
        const pasted = pasteToCode({ text }, { indent });
        if (pasted === null) {
          expect(text.trim()).toBe('');
          return;
        }
        pasted.code
          .split('\n')
          .slice(1)
          .forEach((line) => {
            if (line !== '') expect(line.startsWith(indent)).toBe(true);
          });
        expect(pasted.remaining.every((finding) => finding.replacement === null)).toBe(true);
      }),
      RUNS,
    );
  });
});
