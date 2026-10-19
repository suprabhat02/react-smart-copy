/**
 * `react-smart-copy/link`
 *
 * Copy links that paste well everywhere, link to a passage of a page, and read
 * links back. Framework-agnostic and free of dependencies: use it with `useCopy`,
 * `CopyField`, `useDragCopy`, `useCopyInterceptor` and `usePaste`, or on its own.
 *
 * - {@link linkPayload}: a titled link for Slack, Docs, Notion, Teams and mail, and the
 *   URL for editors; `{ target: 'drag' }` adds `text/uri-list` for drag-and-drop.
 * - {@link textFragmentUrl} and {@link selectionLink}: links that scroll to and
 *   highlight a passage (`#:~:text=`).
 * - {@link readLink} and {@link pasteAsLink}: read a pasted link; paste a URL over
 *   selected text to make it a link.
 * - {@link cleanLinkUrl}: remove tracking parameters.
 *
 * Every URL is validated: allowed schemes only (never `javascript:`), user names
 * and passwords removed; titles are cleaned of hidden characters; output is escaped.
 *
 * @module
 */

export {
  DEFAULT_LINK_TITLE_LENGTH,
  linkPayload,
  markdownLink,
  resolveLink,
  type Link,
  type LinkDragPayloadOptions,
  type LinkPayloadOptions,
  type LinkSource,
  type LinkTextFormat,
  type ResolvedLink,
} from './payload';
export { supportsTextFragments, textFragmentUrl, type TextFragment, type TextFragmentOptions } from './fragment';
export {
  pasteAsLink,
  readLink,
  selectionLink,
  type LinkPasteEvent,
  type LinkPasteSource,
  type PasteAsLinkOptions,
  type SelectionLink,
  type SelectionLinkOptions,
} from './paste';
export { DEFAULT_LINK_PROTOCOLS, TRACKING_PARAMETERS, cleanLinkUrl, resolveLinkUrl, type CleanLinkOptions, type LinkUrlOptions } from './url';
export { insertText } from '../core/text-field';
