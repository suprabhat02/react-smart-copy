/**
 * Code as lines of styled runs. Plain text is one unstyled run per line; a
 * highlighted element keeps each token's colour. Every transform works on this
 * one model, so the plain text and the HTML of a copy always hold the same code.
 */

export interface Run {
  readonly text: string;
  /** Inline CSS for the run, `''` for none. */
  readonly style: string;
}

export type Line = readonly Run[];

/** Line breaks: CRLF, LF, CR, and the Unicode line and paragraph separators and NEL. */
const BREAK = /\r\n|[\n\r\u2028\u2029\u0085]/;

export const lineText = (line: Line): string => line.map((run) => run.text).join('');

/** Splits runs into lines. */
export function toLines(runs: readonly Run[]): Line[] {
  const lines: Run[][] = [[]];
  let carriageReturn = false;
  for (const run of runs) {
    // A CRLF split across two runs is one line break.
    const text = carriageReturn && run.text.startsWith('\n') ? run.text.slice(1) : run.text;
    if (run.text !== '') carriageReturn = run.text.endsWith('\r');
    const parts = text.split(BREAK);
    parts.forEach((part, at) => {
      if (at > 0) lines.push([]);
      if (part !== '') (lines[lines.length - 1] as Run[]).push({ text: part, style: run.style });
    });
  }
  return lines;
}

/** The characters of a line from `from` to `to` (UTF-16 offsets), with their styles. */
export function slice(line: Line, from: number, to = Infinity): Line {
  const out: Run[] = [];
  let offset = 0;
  for (const run of line) {
    const start = Math.max(from - offset, 0);
    const end = Math.min(to - offset, run.text.length);
    if (start < end) out.push(start === 0 && end === run.text.length ? run : { text: run.text.slice(start, end), style: run.style });
    offset += run.text.length;
  }
  return out;
}

export interface Edit {
  readonly index: number;
  readonly length: number;
  readonly text: string;
}

/** Applies non-overlapping replacements of at least one character, sorted by `index`; the new text keeps the style of what it replaces. */
export function edit(line: Line, edits: readonly Edit[]): Line {
  if (edits.length === 0) return line;
  const out: Run[] = [];
  let at = 0;
  for (const { index, length, text } of edits) {
    out.push(...slice(line, at, index));
    if (text !== '') out.push({ text, style: (slice(line, index, index + length)[0] as Run).style });
    at = index + length;
  }
  out.push(...slice(line, at));
  return out;
}
