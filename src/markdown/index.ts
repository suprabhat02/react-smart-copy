/**
 * `react-smart-copy/markdown`
 *
 * Paste rich content as Markdown: Google Docs, Word, Notion, GitHub, web pages
 * and mail become clean CommonMark (with GFM tables, strikethrough and task
 * lists) for comment boxes, editors and CMSs. Framework-agnostic and free of
 * dependencies.
 *
 * - {@link pasteAsMarkdown}: a ready paste handler for a `<textarea>`.
 * - {@link pasteToMarkdown}: Markdown for a paste result; plain text stays as it is.
 * - {@link htmlToMarkdown}: the converter, for HTML strings or DOM nodes (e.g. to
 *   copy a rendered article as Markdown).
 * - {@link insertText}: insert at the cursor and keep the browser's undo.
 * - {@link escapeMarkdown}: make any text render literally.
 *
 * The output never contains raw HTML, links and images keep only allowed URL
 * schemes, and every size limit is explicit.
 *
 * @module
 */

export {
  DEFAULT_MARKDOWN_MAX_DEPTH,
  DEFAULT_MARKDOWN_MAX_LENGTH,
  DEFAULT_MARKDOWN_MAX_NODES,
  htmlToMarkdown,
  type MarkdownOptions,
  type MarkdownResult,
} from './convert';
export { escapeMarkdown } from './escape';
export {
  insertText,
  pasteAsMarkdown,
  pasteToMarkdown,
  type MarkdownPasteEvent,
  type MarkdownPasteSource,
  type PasteMarkdown,
  type PasteToMarkdownOptions,
} from './paste';
export { DEFAULT_IMAGE_PROTOCOLS, DEFAULT_LINK_PROTOCOLS } from './url';
