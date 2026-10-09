---
"react-smart-copy": minor
---

Control what native copy puts on the clipboard: `useCopyInterceptor`

Until now every copy the library handled started from a button. The copies people make most
often are native: select, then Ctrl/⌘+C, Ctrl/⌘+X or the context menu. Those can now be
rewritten, redacted or blocked inside any element.

```tsx
const { ref } = useCopyInterceptor<HTMLElement>({
  transform: ({ text }) => `${text}\n\nSource: ${location.href}`,
});
return <article ref={ref}>…</article>;
```

The transform receives the selection (`text`, `html`, a detached `fragment` safe to mutate,
the `field` for inputs, and `kind`) and returns a string or a text/HTML/JSON/multi payload to
write instead, `false` to block the copy, or nothing to leave it alone.

- **Works everywhere, no prompt.** Writes go through the copy event's `clipboardData`, so
  there is no permission request and no HTTPS requirement. Only strings can be written this
  way: image payloads and `async` transforms are compile errors.
- **Fails closed.** A transform that throws or returns something unwritable blocks the copy
  and reports `onError`, the safe default for redaction. `failureMode: "native"` lets the
  original copy through instead.
- **Cuts behave like cuts.** In inputs and `contenteditable`, the selection is still removed
  after your content is written, through the browser's editing path (undo works, React sees
  `input`). A blocked cut deletes nothing.
- **Deterministic overlap.** One document listener serves every scope. When a selection
  touches several, exactly one handles it: highest `priority`, then innermost, then document
  order. The winner sees the whole selection, so a high-priority redaction scope masks
  content copied across it and its neighbours.
- **Framework-agnostic core.** `registerCopyInterceptor(element, options)` and
  `interceptCopyEvent(event, options)` in `react-smart-copy/core`; `readCopySelection(event)`
  for custom handlers.

Tree-shaken: `useCopy`, `usePaste`, `CopyField` and `PasteField` are unchanged in size.
`useCopyInterceptor` on its own is 2.28 kB (min + brotli).

Not a security boundary: users can still screenshot or open dev tools. It guards against
accidental copying of sensitive values.
