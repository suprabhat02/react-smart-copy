import { copyFailure } from '../core/errors';

/**
 * What a character in code can be suspicious for.
 *
 * - `bidi-control`: reorders how text is displayed (Trojan Source, CVE-2021-42574).
 * - `invisible`: renders as nothing (zero-width spaces, tag characters, Hangul fillers).
 * - `control`: a control character other than tab, line feed, carriage return or form feed.
 * - `unusual-space`: a space that is not U+0020 (no-break, em, ideographic and similar spaces).
 * - `confusable-punctuation`: typographic punctuation in place of ASCII, as word
 *   processors and chat apps write it (curly quotes, dashes, a Greek question mark).
 * - `mixed-script`: a Cyrillic or Greek letter inside a Latin word (a homoglyph attack).
 */
export type CodeFindingKind = 'bidi-control' | 'invisible' | 'control' | 'unusual-space' | 'confusable-punctuation' | 'mixed-script';

/** Every finding kind, in a stable order. */
export const CODE_FINDING_KINDS: readonly CodeFindingKind[] = Object.freeze([
  'bidi-control',
  'invisible',
  'control',
  'unusual-space',
  'confusable-punctuation',
  'mixed-script',
]);

/**
 * `danger`: the code can run differently from how it reads (a bidi override, an
 * invisible identifier, a lookalike letter). `warning`: likely a copy artifact
 * that breaks the code or hides in it (curly quotes, a zero-width space).
 */
export type CodeFindingSeverity = 'danger' | 'warning';

export interface CodeFinding {
  readonly kind: CodeFindingKind;
  readonly severity: CodeFindingSeverity;
  /** Offset in the inspected text, in UTF-16 code units (as `String.prototype.slice` counts). */
  readonly index: number;
  /** Length in UTF-16 code units: 1, or 2 for a character outside the Basic Multilingual Plane. */
  readonly length: number;
  /** 1-based line. Lines end at `\n`, `\r\n` or `\r`. */
  readonly line: number;
  /** 1-based column in UTF-16 code units, as most editors count it. */
  readonly column: number;
  readonly codePoint: number;
  /** Developer-facing, e.g. `U+202E RIGHT-TO-LEFT OVERRIDE`. */
  readonly label: string;
  /** The safe replacement `cleanCode` writes (`''` removes it), or `null` when there is none to guess. */
  readonly replacement: string | null;
}

export interface InspectCodeOptions {
  /** Which kinds to look for. Default: all of {@link CODE_FINDING_KINDS}. */
  readonly kinds?: readonly CodeFindingKind[];
  /** Stop after this many findings and set `truncated`. Default {@link DEFAULT_CODE_MAX_FINDINGS}. */
  readonly maxFindings?: number;
}

export interface CodeInspection {
  /** In order of position. */
  readonly findings: readonly CodeFinding[];
  /** Whether any finding is `danger`. */
  readonly danger: boolean;
  /** Whether `maxFindings` stopped the scan early. */
  readonly truncated: boolean;
}

export const DEFAULT_CODE_MAX_FINDINGS = 1000;

/* ------------------------------------------------------------ Character table */

interface Rule {
  readonly kind: CodeFindingKind;
  readonly severity: CodeFindingSeverity;
  readonly replacement: string | null;
  readonly name: string;
}

const rule = (kind: CodeFindingKind, severity: CodeFindingSeverity, replacement: string | null, name: string): Rule => ({
  kind,
  severity,
  replacement,
  name,
});

/** Characters with a fixed verdict. Ranges and context-dependent ones are handled in `classify`. */
const TABLE = /* @__PURE__ */ new Map<number, Rule>([
  // Explicit embeddings, overrides and isolates: what Trojan Source uses.
  [0x202a, rule('bidi-control', 'danger', '', 'LEFT-TO-RIGHT EMBEDDING')],
  [0x202b, rule('bidi-control', 'danger', '', 'RIGHT-TO-LEFT EMBEDDING')],
  [0x202c, rule('bidi-control', 'danger', '', 'POP DIRECTIONAL FORMATTING')],
  [0x202d, rule('bidi-control', 'danger', '', 'LEFT-TO-RIGHT OVERRIDE')],
  [0x202e, rule('bidi-control', 'danger', '', 'RIGHT-TO-LEFT OVERRIDE')],
  [0x2066, rule('bidi-control', 'danger', '', 'LEFT-TO-RIGHT ISOLATE')],
  [0x2067, rule('bidi-control', 'danger', '', 'RIGHT-TO-LEFT ISOLATE')],
  [0x2068, rule('bidi-control', 'danger', '', 'FIRST STRONG ISOLATE')],
  [0x2069, rule('bidi-control', 'danger', '', 'POP DIRECTIONAL ISOLATE')],
  // Implicit marks: they nudge the display order of neutral characters, but cannot reorder tokens.
  [0x200e, rule('bidi-control', 'warning', '', 'LEFT-TO-RIGHT MARK')],
  [0x200f, rule('bidi-control', 'warning', '', 'RIGHT-TO-LEFT MARK')],
  [0x061c, rule('bidi-control', 'warning', '', 'ARABIC LETTER MARK')],
  // Letters that render as blank space: an identifier made of them is invisible.
  [0x115f, rule('invisible', 'danger', '', 'HANGUL CHOSEONG FILLER')],
  [0x1160, rule('invisible', 'danger', '', 'HANGUL JUNGSEONG FILLER')],
  [0x3164, rule('invisible', 'danger', '', 'HANGUL FILLER')],
  [0xffa0, rule('invisible', 'danger', '', 'HALFWIDTH HANGUL FILLER')],
  [0x200b, rule('invisible', 'warning', '', 'ZERO WIDTH SPACE')],
  [0x2060, rule('invisible', 'warning', '', 'WORD JOINER')],
  [0x2061, rule('invisible', 'warning', '', 'FUNCTION APPLICATION')],
  [0x2062, rule('invisible', 'warning', '', 'INVISIBLE TIMES')],
  [0x2063, rule('invisible', 'warning', '', 'INVISIBLE SEPARATOR')],
  [0x2064, rule('invisible', 'warning', '', 'INVISIBLE PLUS')],
  [0xfeff, rule('invisible', 'warning', '', 'ZERO WIDTH NO-BREAK SPACE')],
  [0x00ad, rule('invisible', 'warning', '', 'SOFT HYPHEN')],
  [0x034f, rule('invisible', 'warning', '', 'COMBINING GRAPHEME JOINER')],
  [0x180e, rule('invisible', 'warning', '', 'MONGOLIAN VOWEL SEPARATOR')],
  [0x17b4, rule('invisible', 'warning', '', 'KHMER VOWEL INHERENT AQ')],
  [0x17b5, rule('invisible', 'warning', '', 'KHMER VOWEL INHERENT AA')],
  // Line and paragraph separators end a line in JavaScript but not in most editors.
  [0x2028, rule('control', 'warning', '\n', 'LINE SEPARATOR')],
  [0x2029, rule('control', 'warning', '\n', 'PARAGRAPH SEPARATOR')],
  [0x0085, rule('control', 'warning', '\n', 'NEXT LINE')],
  [0x00a0, rule('unusual-space', 'warning', ' ', 'NO-BREAK SPACE')],
  [0x1680, rule('unusual-space', 'warning', ' ', 'OGHAM SPACE MARK')],
  [0x202f, rule('unusual-space', 'warning', ' ', 'NARROW NO-BREAK SPACE')],
  [0x205f, rule('unusual-space', 'warning', ' ', 'MEDIUM MATHEMATICAL SPACE')],
  [0x3000, rule('unusual-space', 'warning', ' ', 'IDEOGRAPHIC SPACE')],
  [0x2018, rule('confusable-punctuation', 'warning', "'", 'LEFT SINGLE QUOTATION MARK')],
  [0x2019, rule('confusable-punctuation', 'warning', "'", 'RIGHT SINGLE QUOTATION MARK')],
  [0x201a, rule('confusable-punctuation', 'warning', "'", 'SINGLE LOW-9 QUOTATION MARK')],
  [0x201b, rule('confusable-punctuation', 'warning', "'", 'SINGLE HIGH-REVERSED-9 QUOTATION MARK')],
  [0x2032, rule('confusable-punctuation', 'warning', "'", 'PRIME')],
  [0x02bc, rule('confusable-punctuation', 'warning', "'", 'MODIFIER LETTER APOSTROPHE')],
  [0x201c, rule('confusable-punctuation', 'warning', '"', 'LEFT DOUBLE QUOTATION MARK')],
  [0x201d, rule('confusable-punctuation', 'warning', '"', 'RIGHT DOUBLE QUOTATION MARK')],
  [0x201e, rule('confusable-punctuation', 'warning', '"', 'DOUBLE LOW-9 QUOTATION MARK')],
  [0x201f, rule('confusable-punctuation', 'warning', '"', 'DOUBLE HIGH-REVERSED-9 QUOTATION MARK')],
  [0x2033, rule('confusable-punctuation', 'warning', '"', 'DOUBLE PRIME')],
  [0x2010, rule('confusable-punctuation', 'warning', '-', 'HYPHEN')],
  [0x2011, rule('confusable-punctuation', 'warning', '-', 'NON-BREAKING HYPHEN')],
  [0x2012, rule('confusable-punctuation', 'warning', '-', 'FIGURE DASH')],
  [0x2013, rule('confusable-punctuation', 'warning', '-', 'EN DASH')],
  [0x2212, rule('confusable-punctuation', 'warning', '-', 'MINUS SIGN')],
  // Word and macOS turn "--" into an em dash: "--force" comes back as "\u2014force".
  [0x2014, rule('confusable-punctuation', 'warning', '--', 'EM DASH')],
  [0x2015, rule('confusable-punctuation', 'warning', '--', 'HORIZONTAL BAR')],
  [0x2026, rule('confusable-punctuation', 'warning', '...', 'HORIZONTAL ELLIPSIS')],
  [0x2044, rule('confusable-punctuation', 'warning', '/', 'FRACTION SLASH')],
  [0x2215, rule('confusable-punctuation', 'warning', '/', 'DIVISION SLASH')],
  [0x037e, rule('confusable-punctuation', 'warning', ';', 'GREEK QUESTION MARK')],
]);

/**
 * Latin lookalikes for Cyrillic and Greek letters: these make a homoglyph attack.
 * Pairs of (letter, lookalike), written as escapes so this file holds no homoglyphs itself.
 */
const LOOKALIKE_PAIRS =
    '\u0430a\u0435e\u0456i\u0458j\u043eo\u0440p\u0441c\u0443y\u0445x\u0455s' +
    '\u0501d\u051bq\u051dw\u04bbh\u04cfl\u0410A\u0412B\u0415E\u041aK\u041cM' +
    '\u041dH\u041eO\u0420P\u0421C\u0422T\u0425X\u0423Y\u0406I\u0408J\u0405S' +
    '\u0500D\u051aQ\u051cW\u04baH\u04c0I\u03b1a\u03bfo\u03bdv\u03c1p\u03b9i' +
    '\u03c5u\u03c7x\u0391A\u0392B\u0395E\u0396Z\u0397H\u0399I\u039aK\u039cM' +
    '\u039dN\u039fO\u03a1P\u03a4T\u03a5Y\u03a7X';
const LOOKALIKES = /* @__PURE__ */ new Map<string, string>(
  /* @__PURE__ */ Array.from({ length: LOOKALIKE_PAIRS.length / 2 }, (_, at): [string, string] => [
    LOOKALIKE_PAIRS.charAt(at * 2),
    LOOKALIKE_PAIRS.charAt(at * 2 + 1),
  ]),
);

const LATIN = /\p{Script=Latin}/u;
const FOREIGN = /[\p{Script=Cyrillic}\p{Script=Greek}]/u;
const FOREIGN_LETTER = /^[\p{Script=Cyrillic}\p{Script=Greek}]$/u;
/** Identifier-like runs: letters, marks, digits, `_` and `$`. */
const WORD = /[\p{L}\p{M}\p{Nd}_$]+/gu;
/** Joiners are part of emoji sequences and of Arabic and Indic spelling. */
const JOINS = /[\p{L}\p{M}\p{Extended_Pictographic}]/u;
const JOINS_ASCII = /[\0-\x7f]/;
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3000-\u303f\uff00-\uffef]/u;

/** A character with a glyph: not a space, a control or a format character. */
const VISIBLE = /^[^\s\p{Cc}\p{Cf}\p{Zs}]/u;

const hex = (codePoint: number): string => `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;

const isSelector = (codePoint: number): boolean => (codePoint >= 0xfe00 && codePoint <= 0xfe0f) || (codePoint >= 0xe0100 && codePoint <= 0xe01ef);

const joinsHere = (char: string | undefined): boolean => char !== undefined && !JOINS_ASCII.test(char) && JOINS.test(char);

/** The verdict for one character, given its neighbours (code points, `undefined` at the text's edges). */
function classify(codePoint: number, before: number | undefined, after: number | undefined): Rule | null {
  const fixed = TABLE.get(codePoint);
  if (fixed !== undefined) return fixed;
  if (codePoint === 0x200c || codePoint === 0x200d) {
    // Inside a word or an emoji sequence (both sides non-ASCII letters, marks or pictographs) a joiner is spelling.
    const charBefore = before === undefined ? undefined : String.fromCodePoint(before);
    const charAfter = after === undefined ? undefined : String.fromCodePoint(after);
    if (joinsHere(charBefore) && joinsHere(charAfter)) return null;
    return rule('invisible', 'warning', '', codePoint === 0x200c ? 'ZERO WIDTH NON-JOINER' : 'ZERO WIDTH JOINER');
  }
  if (isSelector(codePoint)) {
    // One selector after a visible character picks its glyph (an emoji's colour form); a run of them smuggles data,
    // and after a space, a control or nothing at all a selector selects nothing.
    const base = before === undefined ? '' : String.fromCodePoint(before);
    if (VISIBLE.test(base) && !isSelector(before as number) && (after === undefined || !isSelector(after))) return null;
    return rule('invisible', 'warning', '', 'VARIATION SELECTOR');
  }
  // Tag characters spell invisible ASCII ("ASCII smuggling", hidden prompt text).
  if (codePoint >= 0xe0000 && codePoint <= 0xe007f) return rule('invisible', 'danger', '', 'TAG CHARACTER');
  if (codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0c || codePoint === 0x0d) return null;
  if (codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f)) return rule('control', 'warning', '', 'CONTROL CHARACTER');
  if (codePoint >= 0x2000 && codePoint <= 0x200a) return rule('unusual-space', 'warning', ' ', 'SPACE');
  if (codePoint >= 0xff01 && codePoint <= 0xff5e) {
    // Full-width punctuation is normal next to CJK text, as in a Chinese or Japanese comment.
    const charBefore = before === undefined ? '' : String.fromCodePoint(before);
    const charAfter = after === undefined ? '' : String.fromCodePoint(after);
    if (CJK.test(charBefore) || CJK.test(charAfter)) return null;
    return rule('confusable-punctuation', 'warning', String.fromCharCode(codePoint - 0xfee0), 'FULLWIDTH FORM');
  }
  return null;
}

/* ----------------------------------------------------------------- Scanning */

export interface RawFinding {
  readonly index: number;
  readonly length: number;
  readonly codePoint: number;
  readonly rule: Rule;
}

const ALL = /* @__PURE__ */ new Set<CodeFindingKind>(CODE_FINDING_KINDS);

export function kindSet(kinds: readonly CodeFindingKind[] | undefined, name: string): ReadonlySet<CodeFindingKind> {
  if (kinds === undefined) return ALL;
  if (!Array.isArray(kinds) || !(kinds as readonly unknown[]).every((kind) => ALL.has(kind as CodeFindingKind))) {
    throw copyFailure('invalid-payload', `\`${name}\` must be a list of: ${CODE_FINDING_KINDS.join(', ')}.`);
  }
  return new Set(kinds);
}

/** Every suspicious character in `text`, in order of position. Stops once `limit` are found. */
export function scan(text: string, kinds: ReadonlySet<CodeFindingKind>, limit: number): RawFinding[] {
  const found: RawFinding[] = [];
  let before: number | undefined;
  for (let index = 0; index < text.length && found.length < limit; ) {
    const codePoint = text.codePointAt(index) as number;
    const length = codePoint > 0xffff ? 2 : 1;
    // Only characters outside printable ASCII can be suspicious; skip the rest fast.
    if (codePoint < 0x20 || codePoint >= 0x7f) {
      const verdict = classify(codePoint, before, text.codePointAt(index + length));
      if (verdict !== null && kinds.has(verdict.kind)) found.push({ index, length, codePoint, rule: verdict });
    }
    before = codePoint;
    index += length;
  }
  if (kinds.has('mixed-script') && FOREIGN.test(text)) {
    const mixed: RawFinding[] = [];
    for (const match of text.matchAll(WORD)) {
      const word = match[0];
      if (!LATIN.test(word) || !FOREIGN.test(word)) continue;
      let offset = 0;
      for (const char of word) {
        if (FOREIGN_LETTER.test(char)) {
          const lookalike = LOOKALIKES.get(char);
          const codePoint = char.codePointAt(0) as number;
          mixed.push({
            index: (match.index) + offset,
            length: char.length,
            codePoint,
            rule:
              lookalike === undefined
                ? rule('mixed-script', 'warning', null, 'NON-LATIN LETTER IN A LATIN WORD')
                : rule('mixed-script', 'danger', lookalike, `LOOKALIKE OF "${lookalike}"`),
          });
        }
        offset += char.length;
      }
    }
    return merge(found, mixed).slice(0, limit);
  }
  return found;
}

function merge(a: readonly RawFinding[], b: readonly RawFinding[]): RawFinding[] {
  if (b.length === 0) return [...a];
  const out: RawFinding[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    const next = j >= b.length || (i < a.length && (a[i] as RawFinding).index < (b[j] as RawFinding).index) ? a[i++] : b[j++];
    out.push(next as RawFinding);
  }
  return out;
}

/** Offsets where each line starts. */
function lineStarts(text: string): number[] {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charCodeAt(index);
    if (char === 0x0a || (char === 0x0d && text.charCodeAt(index + 1) !== 0x0a)) starts.push(index + 1);
  }
  return starts;
}

export function toFindings(text: string, raw: readonly RawFinding[]): CodeFinding[] {
  if (raw.length === 0) return [];
  const starts = lineStarts(text);
  return raw.map(({ index, length, codePoint, rule: { kind, severity, replacement, name } }) => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if ((starts[mid] as number) <= index) low = mid;
      else high = mid - 1;
    }
    return {
      kind,
      severity,
      index,
      length,
      line: low + 1,
      column: index - (starts[low] as number) + 1,
      codePoint,
      label: `${hex(codePoint)} ${name}`,
      replacement,
    };
  });
}

export function positiveLimit(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (value === Infinity || (Number.isInteger(value) && value > 0)) return value;
  throw copyFailure('invalid-payload', `\`${name}\` must be a positive integer or Infinity (received ${String(value)}).`);
}

/**
 * Finds characters that make code read differently from how it runs, or that a
 * copy through a word processor or chat app slipped in: bidirectional overrides
 * (Trojan Source), invisible characters and identifiers, control characters,
 * unusual spaces, curly quotes and dashes, and Cyrillic or Greek lookalikes inside
 * Latin words. Works anywhere, including on the server.
 *
 * @example
 * const { danger, findings } = inspectCode(pasted);
 * if (danger) warn(findings.map((f) => `${f.line}:${f.column} ${f.label}`));
 */
export function inspectCode(code: string, options: InspectCodeOptions = {}): CodeInspection {
  const kinds = kindSet(options.kinds, 'kinds');
  const max = positiveLimit(options.maxFindings, DEFAULT_CODE_MAX_FINDINGS, 'maxFindings');
  // One past the limit tells whether more were left.
  const raw = scan(code, kinds, max === Infinity ? Infinity : max + 1);
  const truncated = raw.length > max;
  const findings = toFindings(code, truncated ? raw.slice(0, max) : raw);
  return { findings, danger: findings.some((finding) => finding.severity === 'danger'), truncated };
}

export interface CleanCodeOptions {
  /** Which kinds to fix. Default: all. Findings without a `replacement` are never changed. */
  readonly kinds?: readonly CodeFindingKind[];
}

export interface CleanCode {
  readonly code: string;
  /** What was replaced or removed, in order, with positions in the original text. */
  readonly fixed: readonly CodeFinding[];
  /** What is still in `code` (positions in `code`): findings without a safe replacement. */
  readonly remaining: readonly CodeFinding[];
}

/** Applies the replacement of each (fixable) finding, from the end so earlier offsets stay valid. */
function applyFixes(text: string, fixable: readonly RawFinding[]): string {
  let out = text;
  for (let at = fixable.length - 1; at >= 0; at -= 1) {
    const { index, length, rule: verdict } = fixable[at] as RawFinding;
    out = out.slice(0, index) + (verdict.replacement as string) + out.slice(index + length);
  }
  return out;
}

const fixableIn = (text: string, kinds: ReadonlySet<CodeFindingKind>): RawFinding[] =>
  scan(text, kinds, Infinity).filter((finding) => finding.rule.replacement !== null);

/**
 * Maps an offset in the text after `fixes` back to the text they were applied to.
 * The offset is never inside a replacement: replacements are ASCII (or a line
 * feed), which is never suspicious, so a later pass can't find anything in them.
 */
function beforeFixes(index: number, fixes: readonly RawFinding[]): number {
  let shift = 0;
  for (const { index: at, length, rule: verdict } of fixes) {
    if (index < at + shift) break;
    shift += (verdict.replacement as string).length - length;
  }
  return index - shift;
}

/**
 * Fixes until nothing fixable is left: removing a character can expose another
 * finding (a zero-width space between `a` and a Cyrillic letter hides a mixed
 * word). Every pass removes or replaces suspicious characters with ASCII, which is
 * never suspicious, so this ends. Returns what was fixed, positioned in `text`.
 */
export function fixAll(text: string, kinds: ReadonlySet<CodeFindingKind>): { readonly text: string; readonly fixed: readonly RawFinding[] } {
  const passes: RawFinding[][] = [];
  let out = text;
  for (let fixable = fixableIn(out, kinds); fixable.length > 0; fixable = fixableIn(out, kinds)) {
    passes.push(fixable);
    out = applyFixes(out, fixable);
  }
  const fixed = passes.flatMap((found, pass) =>
    found.map((finding) => {
      let index = finding.index;
      for (let earlier = pass - 1; earlier >= 0; earlier -= 1) index = beforeFixes(index, passes[earlier] as RawFinding[]);
      return { ...finding, index };
    }),
  );
  return { text: out, fixed: fixed.sort((x, y) => x.index - y.index) };
}

/**
 * Replaces what {@link inspectCode} finds with safe ASCII: removes bidi controls,
 * invisible and control characters, turns unusual spaces into spaces, curly quotes
 * and dashes into `'` `"` `-`, and lookalike letters into the Latin letters they
 * imitate. Letters with no lookalike are reported in `remaining`, never guessed.
 *
 * @example
 * cleanCode('const s = \u201Chi\u201D;').code; // 'const s = "hi";'
 */
export function cleanCode(code: string, options: CleanCodeOptions = {}): CleanCode {
  const kinds = kindSet(options.kinds, 'kinds');
  const { text, fixed } = fixAll(code, kinds);
  return { code: text, fixed: toFindings(code, fixed), remaining: toFindings(text, scan(text, kinds, Infinity)) };
}
