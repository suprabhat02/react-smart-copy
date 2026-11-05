/**
 * The copy that works where the async Clipboard API does not: plain HTTP pages (intranets,
 * internal tools on an IP address) and webviews without `navigator.clipboard`.
 *
 * `document.execCommand('copy')` fires a `copy` event whose `clipboardData` takes any text
 * format, so the payload is written exactly, as text and HTML alike. Nothing is shown and
 * nothing moves: the selection the command needs is made on a node outside the layout, and
 * the user's own selection and focus are put back before the function returns. It runs
 * synchronously, inside the user's gesture. Internal: not part of the public API.
 */
import { isWebCustomFormat } from './mime';
import { serializeJson, type CopyPayload } from './payload';

/** Each format and its text, in the order written. */
export type LegacyEntries = readonly (readonly [format: string, data: string])[];

/** What can travel through a copy event: every text format, no images, no blobs, no web custom formats. */
export function legacyEntries(payload: CopyPayload): LegacyEntries | null {
  switch (payload.kind) {
    case 'text':
      return [['text/plain', payload.value]];
    case 'json':
      return [['text/plain', serializeJson(payload)]];
    case 'html':
      return [
        ['text/html', payload.html],
        ['text/plain', payload.text],
      ];
    case 'image':
      return null;
    case 'multi': {
      const entries: (readonly [string, string])[] = [];
      for (const { mimeType, data, optional } of payload.items) {
        if (typeof data === 'string' && !isWebCustomFormat(mimeType)) entries.push([mimeType, data]);
        // A required format that a copy event cannot carry: the copy would be incomplete.
        else if (optional !== true) return null;
      }
      return entries.length > 0 ? entries : null;
    }
  }
}

type SavedFocus = readonly [element: HTMLElement, range: readonly [number, number, 'forward' | 'backward' | 'none'] | null];

function saveFocus(doc: Document): SavedFocus | null {
  const element = doc.activeElement as (HTMLElement & Partial<HTMLInputElement>) | null;
  if (!element || element === doc.body) return null;
  try {
    const { selectionStart: start, selectionEnd: end, selectionDirection: direction } = element;
    return [element, typeof start === 'number' && typeof end === 'number' ? [start, end, direction ?? 'none'] : null];
  } catch {
    // Older engines throw for inputs without a selection API (email, number).
    return [element, null];
  }
}

function restoreFocus(doc: Document, saved: SavedFocus | null): void {
  if (!saved?.[0].isConnected) return;
  const [element, range] = saved;
  if (doc.activeElement !== element) element.focus({ preventScroll: true });
  if (range) (element as HTMLInputElement).setSelectionRange(...range);
}

/**
 * Writes `entries` through `execCommand('copy')`. Returns whether the browser took them;
 * `false` leaves the clipboard as it was (the caller reports its own, classified error).
 */
export function legacyCopy(doc: Document, entries: LegacyEntries): boolean {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/no-deprecated -- missing in some webviews; the only copy without the async API
  if (typeof doc.execCommand !== 'function' || !doc.body) return false;
  const plain = entries.find(([format]) => format === 'text/plain')?.[1];
  // Set by the listener: an object, so the check after `execCommand` reads its latest value.
  const seen = { written: false };
  const onCopy = (event: Event): void => {
    const data = (event as ClipboardEvent).clipboardData;
    if (!data) return;
    event.preventDefault();
    // This copy carries an exact payload: page copy handlers and interceptors must not rewrite it.
    event.stopImmediatePropagation();
    try {
      for (const [format, value] of entries) data.setData(format, value);
      seen.written = true;
    } catch {
      // A format the browser refuses: the copy is reported as failed, not thrown into the page.
    }
  };

  // Saved first: in some engines reading or moving the selection already moves focus.
  const focus = saveFocus(doc);
  const selection = doc.getSelection();
  const ranges: Range[] = [];
  if (selection) for (let index = 0; index < selection.rangeCount; index += 1) ranges.push(selection.getRangeAt(index));

  // The copy command is only enabled over a selection, so select something nobody can see.
  const holder = doc.createElement('span');
  holder.textContent = plain === undefined || plain === '' ? ' ' : plain;
  holder.setAttribute('aria-hidden', 'true');
  // CSSOM, not a style attribute: allowed under a strict Content Security Policy.
  holder.style.cssText = 'position:fixed;top:0;left:0;clip-path:inset(50%);white-space:pre;user-select:text;-webkit-user-select:text';

  doc.addEventListener('copy', onCopy, true);
  doc.body.append(holder);
  try {
    if (selection) {
      const range = doc.createRange();
      range.selectNodeContents(holder);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- the only copy without the async API
    doc.execCommand('copy');
  } catch {
    // Reported through `written`, which the listener never set.
  } finally {
    doc.removeEventListener('copy', onCopy, true);
    holder.remove();
    if (selection) {
      selection.removeAllRanges();
      for (const range of ranges) selection.addRange(range);
    }
    restoreFocus(doc, focus);
  }
  return seen.written;
}
