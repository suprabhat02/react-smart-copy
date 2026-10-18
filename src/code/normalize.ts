import { copyFailure } from '../core/errors';
import { fixAll, kindSet, type CodeFindingKind } from './inspect';
import { edit, lineText, slice, toLines, type Line } from './lines';

/** Built-in prompt styles for terminal and REPL sessions. */
export type PromptStyle = 'shell' | 'powershell' | 'cmd' | 'python' | 'ipython' | 'node';

/** Every built-in prompt style. `'auto'` tries all but `node`, whose `> ` is too common to guess. */
export const PROMPT_STYLES: readonly PromptStyle[] = Object.freeze(['shell', 'powershell', 'cmd', 'python', 'ipython', 'node']);

/**
 * A custom prompt. `command` matches the prompt at the start of a command line,
 * `continuation` the prompt of the lines that continue it. Matches must start at
 * the beginning of the line; the `g` and `y` flags are ignored.
 */
export interface PromptPattern {
  readonly command: RegExp;
  readonly continuation?: RegExp;
}

export interface CodeTextOptions {
  /**
   * Copy a terminal or REPL session as the commands to run: prompts are removed
   * and output lines are dropped. `'auto'` (the default for copying) does this only
   * when the first line starts with a `$`, `PS>`, `C:\>`, `>>>` or `In [1]:`
   * prompt; `false` keeps the text as it is.
   */
  readonly prompt?: 'auto' | false | PromptStyle | PromptPattern;
  /** Copy a unified diff as the code after (`'after'`) or before (`'before'`) the change. Default `false`. */
  readonly diff?: false | 'after' | 'before';
  /**
   * Remove line numbers typed into the text (`1: code`, `  12 | code`). Only
   * applied when every line starts with a number and the numbers count up by one.
   * Default `false`.
   */
  readonly lineNumbers?: boolean;
  /** Remove the indentation every line shares. Default `true`. */
  readonly dedent?: boolean;
  /** Default `true`. */
  readonly trimTrailingWhitespace?: boolean;
  /** Remove blank lines at the start and the end. Default `true`. */
  readonly trimBlankLines?: boolean;
  /** Default `'lf'`. */
  readonly lineEnding?: 'lf' | 'crlf';
  /** End with a line break. Default `false`. */
  readonly finalNewline?: boolean;
  /**
   * Fix what `inspectCode` finds (see `cleanCode`): `true` for every kind, or a
   * list of kinds. Default `false` when copying, `true` when pasting.
   */
  readonly clean?: boolean | readonly CodeFindingKind[];
}

export interface Resolved {
  readonly prompt: Prompt | 'auto' | null;
  readonly diff: 'after' | 'before' | null;
  readonly lineNumbers: boolean;
  readonly dedent: boolean;
  readonly trimTrailingWhitespace: boolean;
  readonly trimBlankLines: boolean;
  readonly eol: string;
  readonly finalNewline: boolean;
  readonly clean: ReadonlySet<CodeFindingKind> | null;
}

/* ------------------------------------------------------------------ Prompts */

interface Prompt {
  readonly command: RegExp;
  readonly continuation: RegExp | null;
  /** Shell rules: a line continues after `\`, inside a heredoc or an open quote, with an optional `> ` prompt. */
  readonly shell: boolean;
}

const PROMPTS: Readonly<Record<PromptStyle, Prompt>> = {
  // `$` after an optional `(venv) `, `user@host`, and a `~/path`; `#` and `%` are left out: they start comments.
  shell: { command: /^(?:\([^()\s]{1,64}\) )?(?:[\w.-]{1,64}@[\w.-]{1,253}:?)?(?:[~/][^\s$]{0,1024})? ?\$(?: |$)/, continuation: null, shell: true },
  powershell: { command: /^PS(?: [^>\r\n]{0,1024})?> ?/, continuation: /^>> ?/, shell: false },
  cmd: { command: /^[A-Za-z]:\\[^>\r\n]{0,1024}> ?/, continuation: /^More\? ?/, shell: false },
  python: { command: /^>>>(?: |$)/, continuation: /^\.\.\.(?: |$)/, shell: false },
  ipython: { command: /^In \[\d{0,9}\]: ?/, continuation: /^ {0,64}\.{3,}: ?/, shell: false },
  node: { command: /^>(?: |$)/, continuation: /^\.\.\.(?: |$)/, shell: false },
};

const AUTO: readonly PromptStyle[] = ['powershell', 'cmd', 'ipython', 'python', 'shell'];

/** A user pattern without `g` / `y`, so `exec` is stateless. */
function stateless(pattern: unknown, name: string): RegExp {
  if (!(pattern instanceof RegExp)) throw copyFailure('invalid-payload', `\`prompt.${name}\` must be a RegExp.`);
  return new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ''));
}

function resolvePrompt(prompt: CodeTextOptions['prompt'], fallback: 'auto' | false): Prompt | 'auto' | null {
  const value = prompt ?? fallback;
  if (value === false) return null;
  if (value === 'auto') return 'auto';
  if (typeof value === 'string') {
    if (!Object.prototype.hasOwnProperty.call(PROMPTS, value)) {
      throw copyFailure('invalid-payload', `\`prompt\` must be 'auto', false, a PromptPattern or one of: ${PROMPT_STYLES.join(', ')}.`);
    }
    return PROMPTS[value];
  }
  // Plain-JS callers can pass anything.
  if (typeof (value as unknown) !== 'object' || (value as unknown) === null) {
    throw copyFailure('invalid-payload', `\`prompt\` must be 'auto', false, a PromptPattern or one of: ${PROMPT_STYLES.join(', ')}.`);
  }
  return {
    command: stateless(value.command, 'command'),
    continuation: value.continuation === undefined ? null : stateless(value.continuation, 'continuation'),
    shell: false,
  };
}

/** The length of the prompt at the start of `text`, or -1. */
function promptLength(pattern: RegExp, text: string): number {
  const match = pattern.exec(text);
  return match?.index === 0 ? match[0].length : -1;
}

/** Whether a shell command goes on to the next line: a trailing `\`, an open heredoc or an open quote. */
interface ShellState {
  quote: '"' | "'" | null;
  heredoc: string | null;
  /** The next line continues because this one ended with an unescaped `\`. */
  escaped: boolean;
}

const HEREDOC = /<<-?[ \t]*(['"]?)([A-Za-z_][\w-]{0,63})\1/;

function readShell(text: string, state: ShellState): void {
  if (state.heredoc !== null) {
    if (text.replace(/^\t+/, '') === state.heredoc) state.heredoc = null;
    state.escaped = false;
    return;
  }
  let escaped = false;
  for (let at = 0; at < text.length; at += 1) {
    const char = text.charAt(at);
    if (escaped) escaped = false;
    else if (char === '\\' && state.quote !== "'") escaped = true;
    else if (state.quote === null && (char === '"' || char === "'")) state.quote = char;
    else if (char === state.quote) state.quote = null;
    else if (state.quote !== null) continue;
    else if (char === '#') break; // A comment: quotes after it don't count.
    else if (char === '<' && state.heredoc === null) {
      const heredoc = HEREDOC.exec(text.slice(at));
      if (heredoc?.index === 0) state.heredoc = heredoc[2] as string;
    }
  }
  state.escaped = escaped;
}

const continues = (state: ShellState): boolean => state.escaped || state.quote !== null || state.heredoc !== null;

function firstNonBlank(lines: readonly Line[]): string {
  for (const line of lines) {
    const text = lineText(line);
    if (text.trim() !== '') return text;
  }
  return '';
}

/** Keeps the commands of a session, without prompts; drops its output. */
function stripPrompts(lines: readonly Line[], setting: Prompt | 'auto'): Line[] {
  let prompt: Prompt;
  if (setting === 'auto') {
    const first = firstNonBlank(lines);
    const style = AUTO.find((name) => promptLength(PROMPTS[name].command, first) >= 0);
    if (style === undefined) return [...lines];
    prompt = PROMPTS[style];
  } else {
    prompt = setting;
  }
  const out: Line[] = [];
  const shell: ShellState = { quote: null, heredoc: null, escaped: false };
  let inCommand = false;
  /** Shell continuation lines carry a `> ` prompt (PS2) when the first one does. */
  let ps2: boolean | null = null;
  for (const line of lines) {
    const text = lineText(line);
    if (prompt.shell && continues(shell)) {
      if (ps2 === null) ps2 = /^>(?: |$)/.test(text);
      const cut = ps2 ? (text.startsWith('> ') ? 2 : text === '>' ? 1 : 0) : 0;
      const rest = slice(line, cut);
      out.push(rest);
      readShell(lineText(rest), shell);
      continue;
    }
    const command = promptLength(prompt.command, text);
    if (command >= 0) {
      const rest = slice(line, command);
      out.push(rest);
      inCommand = true;
      ps2 = null;
      if (prompt.shell) readShell(lineText(rest), shell);
      continue;
    }
    const continuation = inCommand && prompt.continuation !== null ? promptLength(prompt.continuation, text) : -1;
    if (continuation >= 0) {
      out.push(slice(line, continuation));
      continue;
    }
    inCommand = false; // Output.
  }
  return out;
}

/* --------------------------------------------------------------------- Diff */

const DIFF_HEADER = /^(?:diff |index |--- |\+\+\+ |new file mode|deleted file mode|old mode|new mode|similarity index|dissimilarity index|rename from|rename to|copy from|copy to|Binary files)/;

/** Keeps one side of a unified diff, without the `+`, `-` and space markers. */
function pickSide(lines: readonly Line[], side: 'after' | 'before'): Line[] {
  const keep = side === 'after' ? '+' : '-';
  const drop = side === 'after' ? '-' : '+';
  const out: Line[] = [];
  // A diff that starts with file headers stays in the header until its first hunk.
  let header = /^(?:diff |--- |index )/.test(firstNonBlank(lines));
  for (const line of lines) {
    const text = lineText(line);
    if (text.startsWith('diff --git ')) header = true;
    if (header) {
      if (text.startsWith('@@')) header = false;
      else if (DIFF_HEADER.test(text) || text.trim() === '') continue;
      else header = false; // Not a header after all: the hunk starts here.
    }
    if (text.startsWith('@@') || text.startsWith('\\ ')) continue;
    const marker = text.charAt(0);
    if (marker === drop) continue;
    out.push(marker === keep || marker === ' ' ? slice(line, 1) : line);
  }
  return out;
}

/* ------------------------------------------------------------- Line numbers */

const NUMBERED = /^[ \t]*(\d{1,9})(?:[ \t]*[:|\u2502](?: |$)|[ \t]+|$)/;

function stripLineNumbers(lines: readonly Line[]): Line[] {
  const cuts: number[] = [];
  let expected: number | null = null;
  for (const line of lines) {
    const match = NUMBERED.exec(lineText(line));
    if (match === null) return [...lines];
    const number = Number(match[1]);
    if (expected !== null && number !== expected) return [...lines];
    expected = number + 1;
    cuts.push(match[0].length);
  }
  // A single line can't show that the numbers count.
  if (cuts.length < 2) return [...lines];
  return lines.map((line, at) => slice(line, cuts[at] as number));
}

/* ------------------------------------------------------------ Whitespace */

function trimEnd(line: Line): Line {
  const text = lineText(line);
  const end = text.replace(/[ \t]+$/, '').length;
  return end === text.length ? line : slice(line, 0, end);
}

function dedentLines(lines: readonly Line[]): Line[] {
  let common: string | null = null;
  for (const line of lines) {
    const text = lineText(line);
    if (text.trim() === '') continue;
    const indent = /^[ \t]*/.exec(text)?.[0] as string;
    if (common === null) {
      common = indent;
    } else {
      let shared = 0;
      while (shared < common.length && shared < indent.length && common[shared] === indent[shared]) shared += 1;
      common = common.slice(0, shared);
    }
    if (common === '') return [...lines];
  }
  if (common === null) return [...lines];
  const width = common.length;
  return lines.map((line) => slice(line, Math.min(width, /^[ \t]*/.exec(lineText(line))?.[0].length as number)));
}

/* ------------------------------------------------------------------ Options */

const oneOf = <const T extends string | boolean>(value: unknown, allowed: readonly T[], fallback: NoInfer<T>, name: string): T => {
  if (value === undefined) return fallback;
  if ((allowed as readonly unknown[]).includes(value)) return value as T;
  throw copyFailure('invalid-payload', `\`${name}\` must be one of: ${allowed.map((option) => JSON.stringify(option)).join(', ')}.`);
};

const flag = (value: unknown, fallback: boolean, name: string): boolean => oneOf(value, [true, false], fallback, name);

export interface Defaults {
  readonly prompt: 'auto' | false;
  readonly clean: boolean;
}

export function resolveText(options: CodeTextOptions, defaults: Defaults): Resolved {
  const clean = options.clean ?? defaults.clean;
  return {
    prompt: resolvePrompt(options.prompt, defaults.prompt),
    diff: oneOf(options.diff, [false, 'after', 'before'], false, 'diff') || null,
    lineNumbers: flag(options.lineNumbers, false, 'lineNumbers'),
    dedent: flag(options.dedent, true, 'dedent'),
    trimTrailingWhitespace: flag(options.trimTrailingWhitespace, true, 'trimTrailingWhitespace'),
    trimBlankLines: flag(options.trimBlankLines, true, 'trimBlankLines'),
    eol: oneOf(options.lineEnding, ['lf', 'crlf'], 'lf', 'lineEnding') === 'crlf' ? '\r\n' : '\n',
    finalNewline: flag(options.finalNewline, false, 'finalNewline'),
    clean: clean === false ? null : kindSet(clean === true ? undefined : clean, 'clean'),
  };
}

/* ----------------------------------------------------------------- Pipeline */

export interface Transformed {
  readonly lines: readonly Line[];
  /** How many characters `clean` replaced or removed. */
  readonly fixed: number;
}

export function transform(input: readonly Line[], options: Resolved): Transformed {
  let lines: Line[] = [...input];
  let fixed = 0;
  const kinds = options.clean;
  if (kinds !== null) {
    lines = lines.map((line) => {
      const { fixed: found } = fixAll(lineText(line), kinds);
      fixed += found.length;
      return edit(
        line,
        found.map(({ index, length, rule: { replacement } }) => ({ index, length, text: replacement as string })),
      );
    });
  }
  if (options.diff !== null) lines = pickSide(lines, options.diff);
  // Prompts are found after the shared indentation, as in a session indented inside a list.
  if (options.prompt !== null) lines = stripPrompts(options.dedent ? dedentLines(lines) : lines, options.prompt);
  if (options.lineNumbers) lines = stripLineNumbers(lines);
  if (options.trimTrailingWhitespace) lines = lines.map(trimEnd);
  if (options.trimBlankLines) {
    const blank = (line: Line) => lineText(line).trim() === '';
    let start = 0;
    let end = lines.length;
    while (start < end && blank(lines[start] as Line)) start += 1;
    while (end > start && blank(lines[end - 1] as Line)) end -= 1;
    lines = lines.slice(start, end);
  }
  if (options.dedent) lines = dedentLines(lines);
  return { lines, fixed };
}

/** The text of transformed lines. */
export function render(lines: readonly Line[], options: Pick<Resolved, 'eol' | 'finalNewline'>): string {
  const text = lines.map(lineText).join(options.eol);
  return options.finalNewline && text !== '' ? text + options.eol : text;
}

/**
 * Code as it should be copied or saved: a terminal session becomes its commands,
 * a diff one side of the change, typed line numbers and shared indentation are
 * removed, line endings are normalised. Works anywhere, including on the server.
 *
 * @example
 * normalizeCode('$ npm install react-smart-copy\nadded 1 package'); // 'npm install react-smart-copy'
 */
export function normalizeCode(code: string, options: CodeTextOptions = {}): string {
  const resolved = resolveText(options, { prompt: 'auto', clean: false });
  return render(transform(toLines([{ text: code, style: '' }]), resolved).lines, resolved);
}
