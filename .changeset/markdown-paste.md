---
"react-smart-copy": minor
---

Add `react-smart-copy/markdown`: paste rich content as Markdown.

- `pasteAsMarkdown(event, options?)`: a paste handler for a `<textarea>` or text `<input>` (`onPaste={pasteAsMarkdown}`). Rich pastes from Google Docs, Word, Notion, GitHub, web pages and mail are inserted as Markdown at the cursor. The browser's undo still works, with the paste as its own step, `input` events fire so React state follows, and `maxlength` is respected. Plain-text pastes, which are usually Markdown already, and code from editors are left to the browser.
- `htmlToMarkdown(source, options?)`: HTML string or DOM node to CommonMark with GFM tables, strikethrough and task lists. Handles Google Docs (CSS-only bold and italic, the non-bold `<b>` wrapper, sibling-nested lists, redirect links), Word (`mso-list` lists), mail layout tables and code editors.
- `pasteToMarkdown(result, options?)`, `insertText(field, text)` and `escapeMarkdown(text)` for custom flows, including `usePaste` and `PasteField`.
- Correct by construction: every emphasis delimiter is checked with CommonMark's own pairing algorithm before it is kept, so text always renders as the same text. Property tests with a CommonMark parser check this.
- Secure by default: inert parsing (no scripts, no requests), no raw HTML in the output, links limited to `http:`, `https:` and `mailto:`, images as alt text unless `images: 'keep'`, and explicit `maxLength`, `maxNodes` and `maxDepth` limits reported through `truncated`.
