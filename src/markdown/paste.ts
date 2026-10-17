import { convert, parseHtml, resolveOptions, type MarkdownOptions } from './convert';

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

/** Text fields `setRangeText` and `execCommand('insertText')` both support. */
type TextField = HTMLTextAreaElement | HTMLInputElement;

const TEXT_INPUTS = new Set(['text', 'search', 'url', 'tel', 'password']);

function asTextField(target: EventTarget | null): TextField | null {
  if (typeof target !== 'object' || target === null) return null;
  const element = target as Partial<Element> & { type?: unknown };
  if (element.nodeName === 'TEXTAREA') return target as HTMLTextAreaElement;
  if (element.nodeName === 'INPUT' && typeof element.type === 'string' && TEXT_INPUTS.has(element.type)) return target as HTMLInputElement;
  return null;
}

/**
 * Inserts text at the cursor of a `<textarea>` or text `<input>`, replacing the
 * selection, as typing or pasting would: the browser's undo (Ctrl/⌘+Z) still
 * works, `input` events fire (so React and other frameworks see the change),
 * and `maxlength` is respected. Returns `false` for disabled or read-only fields.
 */
export function insertText(field: TextField, text: string): boolean {
  if (field.disabled || field.readOnly) return false;
  // An <input> holds one line: each run of line breaks (a paragraph break too) becomes one space.
  const value = field.nodeName === 'INPUT' ? text.replace(/[ \t]*(?:\r\n|\r|\n)+[ \t]*/g, ' ') : text;
  const doc = field.ownerDocument;
  field.focus();
  // `null` for inputs without a selection API (email, number): the text is appended.
  const start = field.selectionStart;
  const end = field.selectionEnd;
  try {
    // Re-applying the selection ends the current typing run, so the paste gets its own undo step
    // (as a native paste does) instead of merging with what was typed just before.
    if (start !== null && end !== null) field.setSelectionRange(start, end);
    // The only way to keep the native undo stack; supported for text fields in every current browser.
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- no replacement keeps undo history
    if (doc.activeElement === field && doc.execCommand('insertText', false, value)) return true;
  } catch {
    // Fall through to the manual insertion.
  }
  const from = start ?? field.value.length;
  const to = end ?? from;
  let insert = value;
  if (field.maxLength >= 0) {
    const room = Math.max(0, field.maxLength - (field.value.length - (to - from)));
    insert = insert.slice(0, room);
    // Never leave half of a surrogate pair (an emoji) behind.
    if (/[\ud800-\udbff]$/.test(insert)) insert = insert.slice(0, -1);
  }
  if (start === null) setNativeValue(field, field.value + insert);
  else field.setRangeText(insert, from, to, 'end');
  const view = doc.defaultView;
  const event =
    view !== null && typeof view.InputEvent === 'function'
      ? new view.InputEvent('input', { bubbles: true, inputType: 'insertFromPaste', data: insert })
      : new Event('input', { bubbles: true });
  field.dispatchEvent(event);
  return true;
}

/**
 * Sets a field's value through the prototype's setter. React tracks the value
 * set on the element itself; going around it lets React see the change and
 * call `onChange` for the `input` event that follows.
 */
function setNativeValue(field: TextField, next: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field) as object, 'value');
  // eslint-disable-next-line @typescript-eslint/unbound-method -- it is called right below with the field as `this`
  const setter = descriptor?.set;
  if (setter) setter.call(field, next);
  else field.value = next;
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
