import { describe, expect, it } from 'vitest';
import { CODE_FINDING_KINDS, cleanCode, inspectCode, normalizeCode, type CodeFinding } from '../../src/code';

const kinds = (findings: readonly CodeFinding[]) => findings.map((finding) => finding.kind);
const labels = (findings: readonly CodeFinding[]) => findings.map((finding) => finding.label);

/** The Trojan Source example (CVE-2021-42574): the comment hides the end of the string. */
const TROJAN = 'if (access_level != "user\u202E \u2066// Check if admin\u2069 \u2066") {';

describe('inspectCode', () => {
  it('flags the bidi overrides and isolates Trojan Source uses as danger', () => {
    const result = inspectCode(TROJAN);
    expect(result.danger).toBe(true);
    expect(result.truncated).toBe(false);
    expect(labels(result.findings)).toEqual([
      'U+202E RIGHT-TO-LEFT OVERRIDE',
      'U+2066 LEFT-TO-RIGHT ISOLATE',
      'U+2069 POP DIRECTIONAL ISOLATE',
      'U+2066 LEFT-TO-RIGHT ISOLATE',
    ]);
    expect(result.findings[0]).toEqual({
      kind: 'bidi-control',
      severity: 'danger',
      index: 25,
      length: 1,
      line: 1,
      column: 26,
      codePoint: 0x202e,
      label: 'U+202E RIGHT-TO-LEFT OVERRIDE',
      replacement: '',
    });
  });

  it('treats implicit direction marks as warnings', () => {
    const { findings, danger } = inspectCode('a\u200Eb\u200Fc\u061Cd');
    expect(danger).toBe(false);
    expect(findings.map((finding) => [finding.kind, finding.severity])).toEqual([
      ['bidi-control', 'warning'],
      ['bidi-control', 'warning'],
      ['bidi-control', 'warning'],
    ]);
  });

  it('reports lines and columns for LF, CRLF and CR line ends', () => {
    const { findings } = inspectCode('one\ntwo\r\n  \u200B\rx\u00A0');
    expect(findings.map(({ line, column }) => [line, column])).toEqual([
      [3, 3],
      [4, 2],
    ]);
  });

  it('flags invisible identifiers and tag characters as danger, with their UTF-16 length', () => {
    const hangul = inspectCode('const \u3164 = 1; if (\u3164) run();');
    expect(hangul.danger).toBe(true);
    expect(hangul.findings).toHaveLength(2);
    for (const filler of ['\u115F', '\u1160', '\uFFA0']) expect(inspectCode(`x${filler}`).danger).toBe(true);

    const tag = inspectCode('ok\u{E0041}\u{E0042}');
    expect(tag.danger).toBe(true);
    expect(tag.findings.map(({ index, length, column, codePoint }) => ({ index, length, column, codePoint }))).toEqual([
      { index: 2, length: 2, column: 3, codePoint: 0xe0041 },
      { index: 4, length: 2, column: 5, codePoint: 0xe0042 },
    ]);
    expect(tag.findings[0]?.label).toBe('U+E0041 TAG CHARACTER');
  });

  it('flags zero-width and other invisible characters as warnings', () => {
    const all = '\u200B\u2060\u2061\u2062\u2063\u2064\uFEFF\u00AD\u034F\u180E\u17B4\u17B5';
    const { findings, danger } = inspectCode(`a${Array.from(all).join('a')}a`);
    expect(danger).toBe(false);
    expect(findings).toHaveLength(all.length);
    expect(new Set(kinds(findings))).toEqual(new Set(['invisible']));
    expect(findings.every((finding) => finding.replacement === '')).toBe(true);
  });

  it('keeps joiners that are spelling: emoji sequences and Persian or Indic words', () => {
    expect(inspectCode('family: \u{1F468}\u200D\u{1F469}\u200D\u{1F467}').findings).toEqual([]);
    expect(inspectCode('\u0645\u06CC\u200C\u062E\u0648\u0627\u0647\u0645').findings).toEqual([]);
    expect(inspectCode('\u0915\u094D\u200D\u0937').findings).toEqual([]);
    // Next to ASCII, or at an edge, a joiner hides in code.
    expect(labels(inspectCode('a\u200Db').findings)).toEqual(['U+200D ZERO WIDTH JOINER']);
    expect(labels(inspectCode('\u200Cx').findings)).toEqual(['U+200C ZERO WIDTH NON-JOINER']);
    expect(labels(inspectCode('\u0645\u200C').findings)).toEqual(['U+200C ZERO WIDTH NON-JOINER']);
  });

  it('keeps a single variation selector after a character; flags runs of them (data smuggling)', () => {
    expect(inspectCode('\u2764\uFE0F and \u845B\u{E0100}').findings).toEqual([]);
    const smuggled = inspectCode('\u{1F600}\uFE00\uFE01\u{E0101}');
    expect(smuggled.findings).toHaveLength(3);
    expect(new Set(labels(smuggled.findings))).toEqual(new Set(['U+FE00 VARIATION SELECTOR', 'U+FE01 VARIATION SELECTOR', 'U+E0101 VARIATION SELECTOR']));
    expect(inspectCode('\uFE0F').findings).toHaveLength(1);
    expect(inspectCode(' \u{E0100}').findings).toHaveLength(1);
    expect(inspectCode('\t\uFE0F').findings).toHaveLength(1);
  });

  it('flags control characters but not tab, line feed, carriage return or form feed', () => {
    expect(inspectCode('a\tb\nc\rd\fe').findings).toEqual([]);
    const { findings } = inspectCode('\0\x07\x1B\x7F\x9B');
    expect(kinds(findings)).toEqual(['control', 'control', 'control', 'control', 'control']);
    expect(findings[0]?.label).toBe('U+0000 CONTROL CHARACTER');
  });

  it('turns Unicode line separators into line feeds', () => {
    const { findings } = inspectCode('a\u2028b\u2029c\u0085d');
    expect(findings.map(({ kind, replacement }) => [kind, replacement])).toEqual([
      ['control', '\n'],
      ['control', '\n'],
      ['control', '\n'],
    ]);
  });

  it('flags unusual spaces', () => {
    const spaces = '\u00A0\u1680\u2000\u2005\u200A\u202F\u205F\u3000';
    const { findings } = inspectCode(Array.from(spaces).join('x'));
    expect(findings).toHaveLength(spaces.length);
    expect(findings.every(({ kind, replacement }) => kind === 'unusual-space' && replacement === ' ')).toBe(true);
  });

  it('flags typographic punctuation with the ASCII it stands for', () => {
    const cases: [string, string][] = [
      ['\u2018', "'"], ['\u2019', "'"], ['\u201A', "'"], ['\u201B', "'"], ['\u2032', "'"], ['\u02BC', "'"],
      ['\u201C', '"'], ['\u201D', '"'], ['\u201E', '"'], ['\u201F', '"'], ['\u2033', '"'],
      ['\u2010', '-'], ['\u2011', '-'], ['\u2012', '-'], ['\u2013', '-'], ['\u2212', '-'],
      ['\u2014', '--'], ['\u2015', '--'], ['\u2026', '...'], ['\u2044', '/'], ['\u2215', '/'], ['\u037E', ';'],
      ['\uFF1B', ';'], ['\uFF08', '('], ['\uFF41', 'a'],
    ];
    for (const [char, ascii] of cases) {
      const [finding] = inspectCode(`x ${char} y`).findings;
      expect(finding?.kind).toBe('confusable-punctuation');
      expect(finding?.replacement).toBe(ascii);
    }
  });

  it('leaves full-width punctuation next to CJK text alone', () => {
    expect(inspectCode('// \u4E2D\u6587\uFF0C\u6CE8\u91CA f\uFF08x').findings).toHaveLength(1);
    expect(inspectCode('\uFF08\u3042').findings).toEqual([]);
    expect(inspectCode('\uFF01').findings).toHaveLength(1);
  });

  it('flags Cyrillic and Greek letters inside Latin words; lookalikes are danger', () => {
    const { findings, danger } = inspectCode('if (\u0430dmin) p\u0440int(\u03BFk);');
    expect(danger).toBe(true);
    expect(findings.map(({ kind, severity, replacement, label, column }) => ({ kind, severity, replacement, label, column }))).toEqual([
      { kind: 'mixed-script', severity: 'danger', replacement: 'a', label: 'U+0430 LOOKALIKE OF "a"', column: 5 },
      { kind: 'mixed-script', severity: 'danger', replacement: 'p', label: 'U+0440 LOOKALIKE OF "p"', column: 13 },
      { kind: 'mixed-script', severity: 'danger', replacement: 'o', label: 'U+03BF LOOKALIKE OF "o"', column: 18 },
    ]);
  });

  it('reports a non-lookalike letter as a warning without a replacement', () => {
    const [finding] = inspectCode('const p\u043Bint = 1;').findings;
    expect(finding).toMatchObject({ kind: 'mixed-script', severity: 'warning', replacement: null, label: 'U+043B NON-LATIN LETTER IN A LATIN WORD' });
  });

  it('leaves words in one script alone: Russian or Greek comments and strings', () => {
    expect(inspectCode('// \u043F\u0440\u0438\u0432\u0435\u0442 \u043C\u0438\u0440, hello \u03B1\u03B2\u03B3').findings).toEqual([]);
  });

  it('merges mixed-script findings with character findings in order', () => {
    const { findings } = inspectCode('\u200B \u0430b \u00A0 c\u0430 \u2019');
    expect(kinds(findings)).toEqual(['invisible', 'mixed-script', 'unusual-space', 'mixed-script', 'confusable-punctuation']);
    expect(findings.map((finding) => finding.index)).toEqual([...findings.map((finding) => finding.index)].sort((a, b) => a - b));
  });

  it('looks only for the kinds asked for', () => {
    const text = '\u202E \u0430b \u201C';
    expect(kinds(inspectCode(text, { kinds: ['mixed-script'] }).findings)).toEqual(['mixed-script']);
    expect(kinds(inspectCode(text, { kinds: ['bidi-control', 'confusable-punctuation'] }).findings)).toEqual(['bidi-control', 'confusable-punctuation']);
    expect(inspectCode(text, { kinds: [] }).findings).toEqual([]);
    expect(CODE_FINDING_KINDS).toHaveLength(6);
  });

  it('stops at maxFindings and says so', () => {
    const text = '\u200B'.repeat(5) + '\u0430b';
    expect(inspectCode(text, { maxFindings: 3 })).toMatchObject({ truncated: true, findings: { length: 3 } });
    expect(inspectCode(text, { maxFindings: 6 })).toMatchObject({ truncated: false, findings: { length: 6 } });
    expect(inspectCode(text, { maxFindings: 5 }).truncated).toBe(true);
    expect(inspectCode('\u200B'.repeat(1001)).truncated).toBe(true);
    expect(inspectCode('\u200B'.repeat(1001), { maxFindings: Infinity }).findings).toHaveLength(1001);
  });

  it('returns nothing for clean code', () => {
    expect(inspectCode('const a = "b";\n\tif (a) return `${a}`;')).toEqual({ findings: [], danger: false, truncated: false });
    expect(inspectCode('')).toEqual({ findings: [], danger: false, truncated: false });
  });

  it('rejects invalid options with a typed error', () => {
    const typed = expect.objectContaining({ copyError: expect.objectContaining({ type: 'invalid-payload' }) });
    expect(() => inspectCode('x', { maxFindings: 0 })).toThrow(typed);
    expect(() => inspectCode('x', { maxFindings: 1.5 })).toThrow(typed);
    expect(() => inspectCode('x', { kinds: ['nope'] as never })).toThrow(typed);
    expect(() => inspectCode('x', { kinds: 'bidi-control' as never })).toThrow(typed);
  });
});

describe('cleanCode', () => {
  it('fixes what word processors and chat apps do to code', () => {
    const { code, fixed, remaining } = cleanCode('const s = \u201Chi\u201D;\u00A0// it\u2019s\u200B ok \u2014force');
    expect(code).toBe('const s = "hi"; // it\'s ok --force');
    expect(fixed).toHaveLength(6);
    expect(fixed[0]).toMatchObject({ index: 10, replacement: '"' });
    expect(remaining).toEqual([]);
  });

  it('removes Trojan Source controls and replaces lookalikes', () => {
    expect(cleanCode(TROJAN).code).toBe('if (access_level != "user // Check if admin ") {');
    expect(cleanCode('if (\u0430dmin) {}').code).toBe('if (admin) {}');
  });

  it('never guesses: a letter with no lookalike stays and is reported in the cleaned text', () => {
    const { code, remaining } = cleanCode('\u201Cp\u043Bint\u201D');
    expect(code).toBe('"p\u043Bint"');
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({ index: 2, replacement: null });
  });

  it('keeps fixing until nothing is left: a removed space can expose a mixed word', () => {
    const { code, fixed, remaining } = cleanCode('x \u201Ca\u200B\u0440\u201D');
    expect(code).toBe('x "ap"');
    // Every fix is reported where it is in the original text, in order.
    expect(fixed.map(({ index, kind }) => [index, kind])).toEqual([
      [2, 'confusable-punctuation'],
      [4, 'invisible'],
      [5, 'mixed-script'],
      [6, 'confusable-punctuation'],
    ]);
    expect(remaining).toEqual([]);
    expect(normalizeCode('x \u201Ca\u200B\u0440\u201D', { clean: true })).toBe('x "ap"');
    // A fix that widens the text (an em dash becomes two hyphens) shifts later offsets back correctly.
    expect(cleanCode('\u2014\u2014a\u200B\u0440').fixed.map((finding) => finding.index)).toEqual([0, 1, 3, 4]);
  });

  it('fixes only the kinds asked for', () => {
    expect(cleanCode('\u201Cx\u201D\u200B', { kinds: ['invisible'] }).code).toBe('\u201Cx\u201D');
    expect(cleanCode('\u2028', { kinds: ['control'] }).code).toBe('\n');
    expect(() => cleanCode('x', { kinds: [1] as never })).toThrow(expect.objectContaining({ copyError: expect.objectContaining({ type: 'invalid-payload' }) }));
  });
});
