import { asTextField, insertText } from '../core/text-field';
import { convert, parseHtml, resolveOptions, type MarkdownOptions } from './convert';

export { insertText };

export interface PasteToMarkdownOptions extends MarkdownOptions {
  /**
   * When the HTML is only code (a code editor such as VS Code or a JetBrains IDE,
   * or a single `<pre>`), return the plain text as it is, like a native paste.
   * Default `true`; `false` converts it to a fenced code block.
   */
  readonly codeAsText?: boolean;
}

export interface PasteMarkdown {
  readonly markdown: string;
  /** `html` when converted from rich content; `text` when the plain text was kept as it is. */
  readonly source: 'html' | 'text';
  readonly truncated: boolean;
}

/** The clipboard flavours: a `PasteResult` from `usePaste`, or anything with `html` / `text`. */
export interface MarkdownPasteSource {
  readonly html?: string | null;
  readonly text?: string | null;
}

const MONOSPACE_PRE = /white-space\s*:\s*pre/i;
const MONOSPACE_FONT = /font-family\s*:[^;]*\b(monospace|courier|consolas|menlo|monaco|mono)\b/i;

/** Every visible character sits inside a `<pre>` or a monospace `white-space: pre` box. */
function isCodeOnly(body: HTMLElement): boolean {
  const walker = body.ownerDocument.createTreeWalker(body, 4 /* NodeFilter.SHOW_TEXT */);
  let seen = false;
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if ((node as Text).data.trim() === '') continue;
    seen = true;
    let code = false;
    for (let element = node.parentElement; element !== null && element !== body; element = element.parentElement) {
      const style = element.getAttribute('style') ?? '';
      if (element.localName === 'pre' || (MONOSPACE_PRE.test(style) && MONOSPACE_FONT.test(style))) {
        code = true;
        break;
      }
    }
    if (!code) return false;
  }
  return seen;
}

/**
 * Markdown for what was pasted. Rich content (the HTML flavour) is converted;
 * plain text is returned as it is, because plain text pasted into a Markdown
 * editor is usually Markdown already (copied from another `.md` file or editor),
 * and escaping it would break it. Returns `null` when there is nothing to paste.
 *
 * Never throws for clipboard content: on a server without `DOMParser`, or when
 * the HTML holds nothing to convert, it falls back to the text.
 *
 * @example
 * usePaste({ accept: ['html', 'text'], onPaste: (result) => {
 *   const pasted = pasteToMarkdown(result);
 *   if (pasted) insertText(textarea, pasted.markdown);
 * } });
 */
export function pasteToMarkdown(source: MarkdownPasteSource, options: PasteToMarkdownOptions = {}): PasteMarkdown | null {
  const resolved = resolveOptions(options); // invalid options are a programming error: they throw
  const text = source.text ?? null;
  const html = source.html ?? null;
  if (html !== null && html.trim() !== '' && typeof DOMParser !== 'undefined') {
    const { body, truncated } = parseHtml(html, resolved);
    if (!(options.codeAsText !== false && text !== null && text !== '' && isCodeOnly(body))) {
      const converted = convert(body, resolved, truncated);
      if (converted.markdown !== '') return { ...converted, source: 'html' };
    }
  }
  return text === null || text === '' ? null : { markdown: text.replace(/\r\n?/g, '\n'), source: 'text', truncated: false };
}

/** Structural paste event: a DOM `ClipboardEvent` and React's `onPaste` event both fit. */
export interface MarkdownPasteEvent {
  readonly clipboardData: { getData(format: string): string } | null;
  readonly currentTarget: EventTarget | null;
  readonly target: EventTarget | null;
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}

/**
 * A paste handler for Markdown text fields: when the clipboard holds rich
 * content (Google Docs, Word, a web page), it is inserted as Markdown; plain
 * text and code pastes are left to the browser, untouched. Returns whether it
 * handled the paste.
 *
 * @example
 * <textarea onPaste={pasteAsMarkdown} />
 * <textarea onPaste={(event) => pasteAsMarkdown(event, { images: 'keep' })} />
 */
export function pasteAsMarkdown(event: MarkdownPasteEvent, options?: PasteToMarkdownOptions): boolean {
  if (event.defaultPrevented || event.clipboardData === null) return false;
  const field = asTextField(event.currentTarget) ?? asTextField(event.target);
  if (field === null || field.disabled || field.readOnly) return false;
  const html = event.clipboardData.getData('text/html');
  if (html === '') return false;
  let pasted: PasteMarkdown | null;
  try {
    pasted = pasteToMarkdown({ html, text: event.clipboardData.getData('text/plain') }, options);
  } catch {
    return false; // Invalid options or an unexpected failure: the native paste still happens.
  }
  if (pasted?.source !== 'html') return false;
  event.preventDefault();
  return insertText(field, pasted.markdown);
}
