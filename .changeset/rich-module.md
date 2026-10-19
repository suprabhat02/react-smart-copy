---
"react-smart-copy": minor
---

Add `react-smart-copy/rich`: copy styled content so it pastes as it looks in Gmail, Outlook, Apple Mail, Google Docs, Word, Notion and Slack.

- `richPayload(element)` for a copy button, and `richTransform()` for `useCopyInterceptor`, so Ctrl/⌘+C of a selection is portable too. `prepareRich` returns `{ html, text, removed, truncated }`.
- Only allowlisted elements and attributes are kept. Scripts, event handlers, embeds, SVG, media, forms and controls are left out, and so are hidden and `data-copy-ignore` content. `removed` lists what was left out and why.
- Styles are inline, from what the reader sees (computed styles), and only where they change. Layout CSS is never copied.
- Every colour (`oklch()`, `color()`, translucent `rgb()`) becomes opaque hex. With `colors: "readable"` (the default), light text from a dark theme takes the destination's colour.
- Links and images get absolute, scheme-checked URLs. Images get their displayed size. `data:` images are opt-in.
- Table rows sit in table bodies and blocks stay out of paragraphs, so nothing moves when the paste is parsed.
- Readable plain text: bullets, numbers, tab-separated table cells.
- Property-tested against hostile HTML: DOMPurify finds nothing to remove, and running the output through again changes nothing. Computed styles are checked end to end in Chromium, Firefox and WebKit.

Also: every property test file now has a 60-second timeout, so heavy runs no longer time out on busy CI runners.
