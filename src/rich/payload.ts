import type { CopyInterceptTransform, CopySelection, SyncCopyPayload } from '../core/copy-interceptor';
import { copyFailure } from '../core/errors';
import type { HtmlPayload } from '../core/payload';
import { prepareRich, type RichOptions, type RichSource } from './walk';

/**
 * Content to copy as portable rich text: the sanitized HTML, and its plain text for
 * editors and plain fields. A typed `invalid-payload` error when nothing is left to copy.
 *
 * @example
 * const { copy } = useCopy();
 * <button onClick={() => copy(() => richPayload(noteRef.current))}>Copy note</button>
 */
export function richPayload(source: RichSource, options: RichOptions = {}): HtmlPayload {
  const { html, text } = prepareRich(source, options);
  if (html === '' || text === '') throw copyFailure('invalid-payload', 'There is nothing to copy: the content is empty, hidden or entirely left out.');
  return { kind: 'html', html, text };
}

/**
 * A copy interceptor transform that makes Ctrl/Cmd+C (and cut) of a selection in your
 * page portable: what the reader selected, with the styles they see, sanitized. The
 * plain text stays the browser's own. Selections in text fields are left alone.
 *
 * @example
 * useCopyInterceptor(articleRef, { transform: richTransform() });
 */
export function richTransform(options: RichOptions = {}): CopyInterceptTransform {
  return (selection: CopySelection): SyncCopyPayload | undefined => {
    if (selection.field !== null || typeof document === 'undefined') return undefined;
    const live = document.getSelection();
    if (live === null || live.rangeCount === 0) return undefined;
    const parts: string[] = [];
    for (let index = 0; index < live.rangeCount; index += 1) {
      const { html, text } = prepareRich(live.getRangeAt(index), options);
      // Nothing visible left (only scripts or hidden content, say): not worth a paste.
      if (text !== '' || html.includes('<img')) parts.push(html);
    }
    const html = parts.join('');
    return html === '' ? undefined : { kind: 'html', html, text: selection.text };
  };
}
