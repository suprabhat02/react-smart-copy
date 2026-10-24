/**
 * Text-field helpers shared by the paste handlers of the opt-in entry points.
 * Internal: not part of `react-smart-copy/core`'s public API.
 */

/** Text fields `setRangeText` and `execCommand('insertText')` both support. */
export type TextField = HTMLTextAreaElement | HTMLInputElement;

const TEXT_INPUTS = new Set(['text', 'search', 'url', 'tel', 'password']);

export function asTextField(target: EventTarget | null): TextField | null {
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
  field.dispatchEvent(pasteInputEvent(doc, insert));
  return true;
}

/**
 * Replaces a field's whole value, as a paste would, for fields with no selection to paste
 * into (`<input type="number">`): an `input` event fires, so React and other frameworks see
 * the change. Returns `false` for disabled or read-only fields.
 */
export function replaceFieldValue(field: HTMLInputElement, value: string): boolean {
  if (field.disabled || field.readOnly) return false;
  field.focus();
  setNativeValue(field, value);
  field.dispatchEvent(pasteInputEvent(field.ownerDocument, value));
  return true;
}

/** The `input` event a paste fires: an `InputEvent` where the window has one. */
function pasteInputEvent(doc: Document, data: string): Event {
  const view = doc.defaultView;
  return view !== null && typeof view.InputEvent === 'function'
    ? new view.InputEvent('input', { bubbles: true, inputType: 'insertFromPaste', data })
    : new Event('input', { bubbles: true });
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
