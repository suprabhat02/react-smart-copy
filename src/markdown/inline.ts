import { escapeInline, escapeLineStart } from './escape';
import { linkDestination } from './url';

/**
 * Inline content is collected as style runs (text with a set of styles and an
 * optional link), the way rich-text editors model it, instead of being
 * translated tag by tag. That handles what pasted HTML really looks like:
 * bold set by CSS on spans (Google Docs, Word), one bold word split over three
 * spans, `<b>` used as a non-bold wrapper. Delimiters are then placed from the
 * runs, spaces are moved outside them, and any delimiter pair that CommonMark
 * would not recognise (its flanking rules) is dropped, so formatting can be
 * lost in rare spots but text never turns into literal `**`.
 */

export const STRONG = 1;
export const EM = 2;
export const STRIKE = 4;
export const CODE = 8;

export type Run =
  | { readonly kind: 'text'; readonly text: string; readonly style: number; readonly href: string | null }
  | { readonly kind: 'image'; readonly alt: string; readonly src: string; readonly style: number; readonly href: string | null }
  | { readonly kind: 'break' };

export interface InlineOptions {
  /** Escape `|` for a GFM table cell. */
  readonly pipes: boolean;
  /** The hard line break: `\\\n` or `  \n`. */
  readonly hardBreak: string;
}

interface Delimiter {
  readonly marker: string;
  readonly pair: number;
  readonly open: boolean;
}

/** Delimiter tokens are rewritten in place when emphasis switches from `*` to `_`. */
interface DelimToken {
  readonly kind: 'delim';
  s: string;
  delim: Delimiter;
}

/** `text` tokens hold escaped text and can take line-start escaping; others are syntax. */
type Token =
  | { kind: 'text'; s: string }
  | { readonly kind: 'syntax'; readonly s: string }
  | DelimToken
  | { readonly kind: 'break'; readonly s: string };

/** Outermost first: a style lower in the list is always nested inside the ones above it. */
const ORDER: readonly (readonly [bit: number, marker: string])[] = [
  [STRIKE, '~~'],
  [STRONG, '**'],
  [EM, '*'],
];

/** HTML's collapsible whitespace. A no-break space is content: HTML neither collapses nor trims it. */
const SPACE = /[ \t\n\r\f]+/g;
/** CommonMark's Unicode whitespace: Zs, tab, LF, FF, CR (not U+2028, which JavaScript's `\s` includes). */
const WHITESPACE = /[\t\n\f\r\p{Zs}]/u;
const PUNCTUATION = /[\p{P}\p{S}]/u;

/** Collapses HTML whitespace across runs and trims it at line starts and ends. */
function normalize(runs: readonly Run[]): Run[] {
  const out: Run[] = [];
  let atStart = true;
  for (const run of runs) {
    if (run.kind === 'break') {
      out.push(run);
      atStart = true;
      continue;
    }
    if (run.kind === 'image') {
      out.push(run);
      atStart = false;
      continue;
    }
    let text = run.text.replace(SPACE, ' ');
    // Line edges lose all whitespace, no-break spaces included: renderers disagree on keeping it there.
    if (atStart) text = text.replace(/^\s+/, '');
    else if (lastText(out).endsWith(' ')) text = text.replace(/^ /, '');
    if (text === '') continue;
    out.push({ ...run, text });
    atStart = false;
  }
  // Trim trailing spaces before every break and at the end; drop leading and trailing breaks.
  const trimmed: Run[] = [];
  for (const run of [...out, { kind: 'break' } as const]) {
    if (run.kind === 'break') {
      trimTrailingSpace(trimmed);
      if (trimmed.length > 0 && trimmed[trimmed.length - 1]?.kind !== 'break') trimmed.push(run);
      continue;
    }
    trimmed.push(run);
  }
  trimmed.pop(); // the sentinel (or a trailing break)
  return trimmed;
}

function lastText(runs: readonly Run[]): string {
  const last = runs[runs.length - 1];
  return last?.kind === 'text' ? last.text : '';
}

function trimTrailingSpace(runs: Run[]): void {
  for (let last = runs[runs.length - 1]; last?.kind === 'text'; last = runs[runs.length - 1]) {
    const text = last.text.replace(/\s+$/, '');
    if (text !== '') {
      runs[runs.length - 1] = { ...last, text };
      return;
    }
    runs.pop();
  }
}

/** Splits text into leading spaces, content and trailing spaces. */
function splitSpaces(text: string): [lead: string, core: string, trail: string] {
  const core = text.trim();
  if (core === '') return [text, '', ''];
  const start = text.indexOf(core);
  return [text.slice(0, start), core, text.slice(start + core.length)];
}

function codeSpan(text: string, pipes: boolean): string {
  let longest = 0;
  for (const match of text.matchAll(/`+/g)) longest = Math.max(longest, match[0].length);
  const fence = '`'.repeat(longest + 1);
  const body = pipes ? text.replace(/\|/g, '\\|') : text;
  // A leading or trailing backtick would merge with the fence; a space on both sides is stripped once.
  const padded = /^`|`$/.test(body) || /^ .* $/.test(body) ? ` ${body} ` : body;
  return `${fence}${padded}${fence}`;
}

/** Serialises runs into tokens. */
function tokenize(runs: readonly Run[], options: InlineOptions): Token[] {
  const tokens: Token[] = [];
  const stack: { bit: number; pair: number; marker: string }[] = [];
  let pairs = 0;
  let href: string | null = null;
  let linkStart = -1;
  let pending = '';

  const closeFrom = (index: number): void => {
    while (stack.length > index) {
      const top = stack.pop() as { bit: number; pair: number; marker: string };
      tokens.push({ kind: 'delim', s: top.marker, delim: { marker: top.marker, pair: top.pair, open: false } });
    }
  };
  const flushPending = (): void => {
    if (pending !== '') tokens.push({ kind: 'text', s: pending });
    pending = '';
  };
  const setStyle = (style: number, lead: string): void => {
    const keep = stack.findIndex((entry) => (style & entry.bit) === 0);
    closeFrom(keep === -1 ? stack.length : keep);
    pending += lead;
    flushPending();
    for (const [bit, marker] of ORDER) {
      if ((style & bit) !== 0 && !stack.some((entry) => entry.bit === bit)) {
        pairs += 1;
        stack.push({ bit, pair: pairs, marker });
        tokens.push({ kind: 'delim', s: marker, delim: { marker, pair: pairs, open: true } });
      }
    }
  };
  const closeLink = (): void => {
    closeFrom(0);
    if (href === null) return;
    if (tokens.length - 1 === linkStart) tokens.pop(); // a link with no content is dropped
    else tokens.push({ kind: 'syntax', s: `](${linkDestination(href)})` });
    href = null;
  };

  for (let index = 0; index < runs.length; index += 1) {
    const run = runs[index] as Run;
    if (run.kind === 'break') {
      closeLink();
      pending = '';
      tokens.push({ kind: 'break', s: options.hardBreak });
      continue;
    }
    if (run.href !== href) {
      closeLink();
      flushPending();
      if (run.href !== null) {
        href = run.href;
        linkStart = tokens.length;
        tokens.push({ kind: 'syntax', s: '[' });
      }
    }
    if (run.kind === 'image') {
      setStyle(run.style & ~CODE, '');
      tokens.push({ kind: 'syntax', s: `![${escapeInline(run.alt, options.pipes)}](${linkDestination(run.src)})` });
      continue;
    }
    // Consecutive code runs with the same style and link form one code span.
    let text = run.text;
    if ((run.style & CODE) !== 0) {
      for (let next = runs[index + 1]; next?.kind === 'text' && next.style === run.style && next.href === run.href; next = runs[index + 1]) {
        text += next.text;
        index += 1;
      }
    }
    const [lead, core, trail] = splitSpaces(text);
    if (core === '') {
      pending += lead; // whitespace keeps the current styles, so "**a** **b**" stays one span
      continue;
    }
    setStyle(run.style & ~CODE, lead);
    tokens.push((run.style & CODE) !== 0 ? { kind: 'syntax', s: codeSpan(core, options.pipes) } : { kind: 'text', s: escapeInline(core, options.pipes) });
    pending = trail;
  }
  closeLink();
  flushPending();
  return tokens;
}

/**
 * The character next to a delimiter run, at token `index` (the token just
 * outside the run). Line starts and ends count as whitespace. Runs are maximal,
 * so this token is never a delimiter of the same character.
 */
function neighbour(tokens: readonly Token[], index: number, step: 1 | -1): string {
  const token = tokens[index];
  if (token === undefined || token.kind === 'break') return '\n';
  // Whole code points (the `u` flag): an astral symbol is punctuation to CommonMark, half of one is not.
  return ((step === 1 ? FIRST_CHAR : LAST_CHAR).exec(token.s) as RegExpExecArray)[0];
}

const FIRST_CHAR = /^[\s\S]/u;
const LAST_CHAR = /[\s\S]$/u;

const leftFlanking = (before: string, after: string): boolean =>
  !WHITESPACE.test(after) && (!PUNCTUATION.test(after) || WHITESPACE.test(before) || PUNCTUATION.test(before));
const rightFlanking = (before: string, after: string): boolean =>
  !WHITESPACE.test(before) && (!PUNCTUATION.test(before) || WHITESPACE.test(after) || PUNCTUATION.test(after));

/** GFM strikethrough: can this `~~` open (left-flanking) or close (right-flanking)? */
function strikeFlanks(tokens: readonly Token[], index: number, delim: Delimiter): boolean {
  const before = neighbour(tokens, index - 1, -1);
  const after = neighbour(tokens, index + 1, 1);
  return delim.open ? leftFlanking(before, after) : rightFlanking(before, after);
}

/**
 * Adjacent `*` delimiters form one delimiter run. When a run both closes one span
 * and opens another (`*a***b**`), CommonMark can pair them differently than meant,
 * so the emphasis (`*`) pairs in such a run switch to `_`, which is a separate run.
 */
function separateMixedRuns(tokens: readonly Token[]): void {
  let group: DelimToken[] = [];
  const settle = (): void => {
    const opens = group.filter((token) => token.delim.open);
    const closes = group.filter((token) => !token.delim.open);
    if (opens.length > 0 && closes.length > 0) {
      // Switch the emphasis that opens here; if only strong opens, the emphasis that closes.
      const emphasisOpens = opens.filter((token) => token.delim.marker === '*');
      const switching = emphasisOpens.length > 0 ? emphasisOpens : closes.filter((token) => token.delim.marker === '*');
      const pairs = new Set(switching.map((token) => token.delim.pair));
      for (const token of tokens) {
        if (token.kind === 'delim' && pairs.has(token.delim.pair)) {
          token.s = '_';
          token.delim = { ...token.delim, marker: '_' };
        }
      }
    }
    group = [];
  };
  for (const token of tokens) {
    if (token.kind === 'delim' && token.delim.marker[0] === '*') group.push(token);
    else settle();
  }
  settle();
}

interface DelimiterChar {
  readonly pair: number;
  readonly open: boolean;
  matched: boolean;
}

/** One delimiter run on CommonMark's delimiter stack. `front`/`len`: the characters not yet used. */
interface StackEntry {
  readonly char: string;
  readonly orig: number;
  readonly canOpen: boolean;
  readonly canClose: boolean;
  readonly chars: DelimiterChar[];
  front: number;
  len: number;
}

/** Groups the delimiter tokens at `indexes` into runs (adjacent `*` or adjacent `_`). */
function runsOf(tokens: readonly Token[], indexes: readonly number[]): StackEntry[] {
  const entries: StackEntry[] = [];
  let run: number[] = [];
  const close = (): void => {
    if (run.length === 0) return;
    const firstIndex = run[0] as number;
    const lastIndex = run[run.length - 1] as number;
    const char = ((tokens[firstIndex] as DelimToken).delim.marker[0]) as string;
    const before = neighbour(tokens, firstIndex - 1, -1);
    const after = neighbour(tokens, lastIndex + 1, 1);
    const left = leftFlanking(before, after);
    const right = rightFlanking(before, after);
    const chars = run.flatMap((index) => {
      const { delim } = tokens[index] as DelimToken;
      return Array.from(delim.marker, () => ({ pair: delim.pair, open: delim.open, matched: false }));
    });
    entries.push({
      char,
      orig: chars.length,
      canOpen: char === '_' ? left && (!right || PUNCTUATION.test(before)) : left,
      canClose: char === '_' ? right && (!left || PUNCTUATION.test(after)) : right,
      chars,
      front: 0,
      len: chars.length,
    });
    run = [];
  };
  let previous = -1;
  for (const index of indexes) {
    const token = tokens[index] as Token;
    const emphasis = token.kind === 'delim' && token.delim.marker[0] !== '~';
    const adjacent = previous === index - 1;
    const sameChar = run.length > 0 && emphasis && (tokens[run[0] as number] as DelimToken).delim.marker[0] === (token).delim.marker[0];
    if (!emphasis || !adjacent || !sameChar) close();
    if (emphasis) run.push(index);
    previous = index;
  }
  close();
  return entries;
}

/**
 * CommonMark's "process emphasis" algorithm, run on our own output: it pairs
 * delimiter characters exactly as a Markdown renderer will. Returns the pairs
 * whose characters would not be paired as intended (they would render as
 * literal asterisks or pair with the wrong span).
 */
function misread(tokens: readonly Token[], indexes: readonly number[]): Set<number> {
  const stack = runsOf(tokens, indexes);
  const failed = new Set<number>();
  let current = 0;
  while (current < stack.length) {
    const closer = stack[current] as StackEntry;
    if (!closer.canClose || closer.len === 0) {
      current += 1;
      continue;
    }
    let openerIndex = current - 1;
    for (; openerIndex >= 0; openerIndex -= 1) {
      const opener = stack[openerIndex] as StackEntry;
      if (opener.char !== closer.char || !opener.canOpen || opener.len === 0) continue;
      const oddMatch = (closer.canOpen || opener.canClose) && closer.orig % 3 !== 0 && (opener.orig + closer.orig) % 3 === 0;
      if (!oddMatch) break;
    }
    if (openerIndex < 0) {
      current += 1;
      continue;
    }
    const opener = stack[openerIndex] as StackEntry;
    const use = closer.len >= 2 && opener.len >= 2 ? 2 : 1;
    for (let k = 0; k < use; k += 1) {
      const open = opener.chars[opener.front + opener.len - 1] as DelimiterChar;
      const shut = closer.chars[closer.front] as DelimiterChar;
      opener.len -= 1;
      closer.front += 1;
      closer.len -= 1;
      open.matched = true;
      shut.matched = true;
      if (open.pair !== shut.pair || !open.open || shut.open) {
        failed.add(open.pair);
        failed.add(shut.pair);
      }
    }
    // Delimiters between the opener and the closer can no longer match anything.
    for (let between = openerIndex + 1; between < current; between += 1) (stack[between] as StackEntry).len = 0;
  }
  for (const entry of stack) for (const char of entry.chars) if (!char.matched) failed.add(char.pair);
  return failed;
}

/** The delimiter token indexes inside each link's text, and those outside every link. */
function scopes(tokens: readonly Token[]): number[][] {
  const outside: number[] = [];
  const links: number[][] = [];
  let inside: number[] | null = null;
  tokens.forEach((token, index) => {
    if (token.kind === 'syntax' && token.s === '[') inside = [];
    else if (token.kind === 'syntax' && token.s.startsWith('](') && inside !== null) {
      links.push(inside);
      inside = null;
    } else if (token.kind === 'delim') (inside ?? outside).push(index);
  });
  return [...links, outside];
}

/**
 * Drops delimiter pairs CommonMark would not read as intended, until every
 * remaining pair renders exactly as meant: emphasis is checked by running
 * CommonMark's own pairing algorithm (link text first, as the spec does),
 * strikethrough by its flanking rules.
 */
function resolve(tokens: Token[]): Token[] {
  let current = tokens;
  for (;;) {
    const invalid = new Set<number>();
    current.forEach((token, index) => {
      if (token.kind === 'delim' && token.delim.marker[0] === '~' && !strikeFlanks(current, index, token.delim)) invalid.add(token.delim.pair);
    });
    for (const scope of scopes(current)) for (const pair of misread(current, scope)) invalid.add(pair);
    if (invalid.size === 0) return current;
    current = joinTouching(current.filter((token) => token.kind !== 'delim' || !invalid.has(token.delim.pair)));
  }
}

/**
 * Dropping a pair can leave one span's closing delimiter right before the next
 * span's opening one, with the same marker (`~~a~~~~b~~`). Those two cancel
 * out: the spans join into one, which is what the text looked like anyway.
 */
function joinTouching(tokens: readonly Token[]): Token[] {
  const out: Token[] = [];
  for (const token of tokens) {
    const last = out[out.length - 1];
    if (token.kind === 'delim' && token.delim.open && last?.kind === 'delim' && !last.delim.open && last.s === token.s) {
      out.pop();
      // The joined span keeps the earlier opener and the later closer: relabel the closer.
      const closer = tokens.find((candidate) => candidate.kind === 'delim' && !candidate.delim.open && candidate.delim.pair === token.delim.pair) as DelimToken;
      closer.delim = { ...closer.delim, pair: last.delim.pair };
      continue;
    }
    out.push(token);
  }
  return out;
}

/** Escapes the first text of every line, once delimiters are final. */
function escapeLineStarts(tokens: Token[]): void {
  let lineStart = true;
  for (const token of tokens) {
    if (token.kind === 'break') {
      lineStart = true;
    } else {
      if (lineStart && token.kind === 'text') token.s = escapeLineStart(token.s);
      lineStart = false;
    }
  }
}

/** Inline Markdown for runs: one line, or several joined by hard breaks. Empty when there is no content. */
export function renderInline(runs: readonly Run[], options: InlineOptions): string {
  const raw = tokenize(normalize(runs), options);
  separateMixedRuns(raw);
  const tokens = resolve(raw);
  escapeLineStarts(tokens);
  const markdown = tokens.map((token) => token.s).join('');
  // Only whitespace (an editor's `<p>&nbsp;</p>`): nothing to keep.
  return markdown.trim() === '' ? '' : markdown;
}
