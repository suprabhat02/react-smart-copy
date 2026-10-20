---
"react-smart-copy": minor
---

Paste into rich-text editors: `pasteToRich` and `pasteAsRich` in `react-smart-copy/rich`. What Google Docs, Word, Outlook, Gmail and web pages put on the clipboard becomes clean, semantic HTML for TipTap, ProseMirror, Lexical, Quill or a `contenteditable` element.

- Formatting set by CSS becomes `<strong>`, `<em>`, `<u>`, `<s>`, `<code>`, `<sup>` and `<sub>`, and CSS wins over tags, as in the browser (Google Docs' non-bold `<b>` wrapper stays non-bold). Every style, class and id is left out, so the paste takes the editor's look.
- Word's list paragraphs become nested lists with their numbering. Docs' paragraphs in list items and lists nested beside their items are put right. Mail layout tables become their content; data tables keep their sections, merged cells and captions. Code blocks keep their lines and indentation.
- The output is canonical: the same content always gives the same HTML, and cleaning it again changes nothing.
- The same sanitizer as `prepareRich`: allowlisted elements and attributes, absolute, scheme-checked URLs. Google and Outlook Safe Links redirects are unwrapped. Relative links resolve only against `base`. `removed` reports scripts, embeds, and unsafe links and images.
- `formats` limits the output to what the editor holds, keeping all of the text: a heading becomes a bold paragraph, a list item a paragraph after its marker, a table its cells.
- `pasteAsRich(event)` inserts into a `contenteditable` element with undo intact, and leaves plain-text pastes to the browser. Plain text through `pasteToRich` becomes paragraphs, without a DOM.
- Property-tested against generated Docs, Word, mail and hostile HTML: only allowlisted markup, nothing for DOMPurify to remove, every visible character kept with the formats it showed, and a fixpoint.

Also: link and image removal reports read the URL scheme as the URL parser does, so `java&#x09;script:` is reported as `javascript`.

Also, across `markdown`, `code`, `link`, `table` and `rich`, pasted HTML is now parsed by one internal routine that removes event handler attributes as soon as it has parsed them, so no node of the inert document carries one.
