/**
 * `react-smart-copy/rich`
 *
 * Copy styled content from your app so it pastes as it looks in Gmail, Outlook,
 * Apple Mail, Google Docs, Word, Notion and Slack: portable, sanitized HTML with
 * inline styles, email-safe colours and absolute links, plus readable plain text.
 *
 * - {@link richPayload}: a copy payload for `useCopy`, `CopyField` or `useDragCopy`.
 * - {@link richTransform}: makes Ctrl/Cmd+C of a selection portable too, with `useCopyInterceptor`.
 * - {@link prepareRich}: the HTML, text and a report of what was left out.
 *
 * And the other way: paste from Google Docs, Word, mail or the web into a rich-text editor.
 *
 * - {@link pasteToRich}: clean, semantic HTML for an editor's paste hook (TipTap, Lexical, Quill).
 * - {@link pasteAsRich}: a paste handler for `contenteditable` elements, with undo intact.
 *
 * @module
 */

export { prepareRich, type RichOptions, type RichRemoval, type RichRemovalReason, type RichResult, type RichSource } from './walk';
export { richPayload, richTransform } from './payload';
export { plainText } from './text';
export {
  pasteAsRich,
  pasteToRich,
  RICH_PASTE_FORMATS,
  type PasteAsRichOptions,
  type PasteToRichOptions,
  type RichPaste,
  type RichPasteEvent,
  type RichPasteFormat,
  type RichPasteSource,
} from './paste';
export type { RichColors, StyleSource } from './style';
