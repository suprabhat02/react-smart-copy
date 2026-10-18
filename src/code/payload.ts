import { copyFailure } from '../core/errors';
import type { HtmlPayload, TextPayload } from '../core/payload';
import { assertElement, extract } from './element';
import { toLines, type Line } from './lines';
import { render, resolveText, transform, type CodeTextOptions } from './normalize';

/** Code to copy: a string, or a rendered (and possibly highlighted) code block. */
export type CodeSource = string | Element;

export interface CodeFromElementOptions extends CodeTextOptions {
  /**
   * A CSS selector for more parts of the block to leave out. Gutters, hidden and
   * `user-select: none` parts, `aria-hidden` decorations, buttons and anything with
   * `data-copy-ignore` are always left out.
   */
  readonly ignore?: string;
}

export interface CodePayloadOptions extends CodeFromElementOptions {
  /**
   * Add an HTML flavour (`<pre><code>`), so the code stays monospaced when pasted
   * into Google Docs, Word, Slack, Teams or a mail; from an element, with its
   * syntax colours. Editors and terminals still paste the plain text. Default `true`.
   */
  readonly html?: boolean;
  /** Written as `class="language-<name>"` on the `<code>` element. Letters, digits and `_ + # . -` only. */
  readonly language?: string;
}

const LANGUAGE = /^[A-Za-z0-9_+#.-]{1,64}$/;
const MONOSPACE = "font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace;white-space:pre;";

/** HTML can't hold U+0000: parsers turn it into U+FFFD, so the HTML says so itself (the text flavour keeps it). */
const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\0/g, '\uFFFD');

function toHtml(lines: readonly Line[], blockStyle: string, language: string | undefined): string {
  const body = lines
    .map((line) => line.map(({ text, style }) => (style === '' ? escapeHtml(text) : `<span style="${escapeHtml(style)}">${escapeHtml(text)}</span>`)).join(''))
    .join('\n');
  const cls = language === undefined ? '' : ` class="language-${language}"`;
  return `<pre style="${escapeHtml(MONOSPACE + blockStyle)}"><code${cls}>${body}</code></pre>`;
}

/**
 * The code a rendered block shows, ready to run or save: see {@link extract} for
 * what is left out, and {@link CodeTextOptions} for prompts, diffs and whitespace.
 *
 * @example
 * codeFromElement(preRef.current, { prompt: 'shell' });
 */
export function codeFromElement(element: Element, options: CodeFromElementOptions = {}): string {
  assertElement(element, 'element');
  const resolved = resolveText(options, { prompt: 'auto', clean: false });
  const { runs } = extract(element, { ignore: options.ignore, styles: false });
  return render(transform(toLines(runs), resolved).lines, resolved);
}

/**
 * A copy payload for code: plain text for editors and terminals, plus
 * monospaced HTML (with the block's syntax colours when you pass the element)
 * for documents and chat. A terminal session is copied as its commands
 * (`prompt: 'auto'`). Code that ends up empty gives an empty text payload, which
 * `copy()` reports as an `invalid-payload` error.
 *
 * @example
 * const { copy } = useCopy();
 * <button onClick={() => copy(() => codePayload(preRef.current!, { language: 'tsx' }))}>Copy</button>
 */
export function codePayload(source: CodeSource, options: CodePayloadOptions = {}): HtmlPayload | TextPayload {
  const resolved = resolveText(options, { prompt: 'auto', clean: false });
  const withHtml = options.html ?? true;
  if (typeof withHtml !== 'boolean') throw copyFailure('invalid-payload', '`html` must be a boolean.');
  const { language } = options;
  if (language !== undefined && (typeof language !== 'string' || !LANGUAGE.test(language))) {
    throw copyFailure('invalid-payload', '`language` may only hold letters, digits and _ + # . - (at most 64).');
  }
  let lines: Line[];
  let blockStyle = '';
  if (typeof source === 'string') {
    lines = toLines([{ text: source, style: '' }]);
  } else {
    assertElement(source, 'source');
    const extracted = extract(source, { ignore: options.ignore, styles: withHtml });
    lines = toLines(extracted.runs);
    blockStyle = extracted.blockStyle;
  }
  const out = transform(lines, resolved).lines;
  const text = render(out, resolved);
  if (!withHtml || text === '') return { kind: 'text', value: text };
  return { kind: 'html', text, html: toHtml(out, blockStyle, language) };
}
