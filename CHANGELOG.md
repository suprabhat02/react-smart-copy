# react-smart-copy

## 1.16.0

### Minor Changes

- c6d3a4b: Add `react-smart-copy/color`: copy and paste colours in every CSS format.
  
  - `colorPayload(color, { format })` copies a colour as hex, `rgb()`, `hsl()`, `hwb()`, `oklch()`, `oklab()`, `lab()`, `lch()` or `color(display-p3 …)`. Docs, Notion, Slack and mail also get a small swatch (`swatch: false` turns it off).
  - `parseColor` reads every CSS Color 4 notation: hex, the 148 named colours, `rgb()` and `hsl()` in both syntaxes, `hwb()`, `lab()`, `lch()`, `oklab()`, `oklch()`, and `color()` in `srgb`, `srgb-linear`, `display-p3`, `xyz`, `xyz-d65` and `xyz-d50`. It returns `null` for anything else and never throws.
  - `formatColor` writes any of the formats. The default precision brings every 8-bit colour back exactly; this was checked on 836,056 colours. Colours outside sRGB are gamut-mapped as CSS Color 4 specifies (chroma reduced in OKLCH, hue kept); `gamut: "clip"` clips them instead. `inGamut` and `toGamut` are exported too.
  - `readColor` reads a pasted colour, including declarations copied from developer tools (`color: #3b82f6;`). `pasteAsColor` inserts any pasted colour in a field's format and keeps the browser's undo.
  - `contrastRatio` and `contrastLevel`: WCAG 2 contrast for normal and large text, never rounded up.
  - Accuracy is property-tested against culori, and checked against the browser's own CSS parser in Chromium, Firefox and WebKit.

## 1.15.0

### Minor Changes

- 5890272: Add sharing: one button that opens the share sheet on phones and tablets and copies a titled link everywhere else.
  
  - `useShare` (from `react-smart-copy`) returns `share`, `status` (`idle`, `sharing`, `shared`, `copied` or `error`) and `method`. `method` is `"native"` or `"copy"`, so the button can say "Share…" or "Copy link". It is `"copy"` during server rendering, then follows the device.
  - `react-smart-copy/share` (framework-agnostic): `shareOrCopy(content, options)` never rejects. It resolves to `shared`, `copied` (with its reason: `preferred`, `unsupported` or `fallback`), `cancelled` or `error` with a typed `CopyError`. Closing the share sheet is `cancelled`: never an error, and never a surprise copy. Also `shareMethod` and `describeShareError`.
  - `mode`: `"auto"` (default) uses the share sheet on touch-first devices, `"native"` uses it wherever available, and `"copy"` always copies. When the share sheet fails, the link is copied instead (`fallback: false` reports the error instead).
  - Links are checked like everything in `react-smart-copy/link`: safe schemes only, credentials removed, tracking parameters removed with `clean: true`, titles cleaned. Files go only to a share sheet that accepts them.
  - `react-smart-copy/link` constants are now marked pure, so bundles that don't use them drop them.

## 1.14.1

### Patch Changes

- 313622a: `react-smart-copy/markdown`: inline code in a table cell that holds a backslash before a pipe (such as `a\|b`) no longer breaks the table on GitHub and other GFM renderers. GFM splits table cells before it reads code spans, so a pipe after an odd number of backslashes cannot be written inside one code span. The code is now split around such a pipe, and the cell keeps its exact text. Every other pipe stays inside the code. Table output is now tested against micromark, the reference GFM parser, as well as markdown-it.

## 1.14.0

### Minor Changes

- 6140182: Add `react-smart-copy/link`: copy links that paste well everywhere and link to a passage of a page.
  
  - `linkPayload` copies a titled `<a>` link and the URL, so Slack, Google Docs, Notion, Teams and mail paste the title as a link and editors paste the URL. Plain text can be the URL, the title, both, or Markdown. `{ target: "drag" }` adds `text/uri-list` and `text/x-moz-url` for `useDragCopy`.
  - Every URL is resolved and checked: only `https:`, `http:`, `mailto:` and `tel:` by default (never `javascript:` or `data:`), user names and passwords removed, international domains in punycode. Titles are cleaned of hidden and reordering characters, capped, and escaped.
  - `cleanLinkUrl` and `clean: true` remove tracking parameters (`utm_*`, `fbclid`, `gclid`, `msclkid` and more) and keep everything else.
  - `textFragmentUrl` and `selectionLink` make links that scroll to and highlight a passage (`#:~:text=`), with each term inside one block and context added when the passage repeats.
  - `readLink` reads the one link a paste or drop holds, with its title. `pasteAsLink` turns selected text into a link when a URL is pasted over it, keeping the browser's undo.
  - No dependencies, about 4 kB; `linkPayload` alone is about 1.8 kB. Works on the server with a `base`.
  
  The README's drag-to-copy example now uses `linkPayload`, which escapes the title and checks the URL.

## 1.13.2

### Patch Changes

- 767446b: Documentation only: the README now says the library is tested in Chromium, Firefox and WebKit on every change, and how to run those tests. No code changes.

## 1.13.1

### Patch Changes

- aab62ce: `react-smart-copy/image`: every metadata check now reads only its own segment, chunk or Exif block. Before this, an empty JPEG APP2 segment could be classified from the bytes after it, so a malformed file kept a segment on the first strip and dropped it on the second. Fuzz tests found it. They now run five times as many cases in CI, and the case is a regression test.

## 1.13.0

### Minor Changes

- b99c852: Add `react-smart-copy/image`: get pasted and dropped images ready to upload, private and small.
  
  - `prepareImage(file, options?)`: removes metadata and fits the image to `maxWidth`, `maxHeight`, `maxPixels` and `maxBytes`. It re-encodes only when it has to. When only the metadata goes, every pixel stays the same. For a byte budget it searches for the highest JPEG or WebP quality that fits (down to `minQuality`), then reduces the size. `type: 'auto'` keeps PNG screenshots lossless while they fit, then moves to WebP or JPEG. When a limit can't be met, it is a `too-large` error, never an oversized file. Large reductions are drawn in halving steps.
  - `stripMetadata(file, options?)`: lossless metadata removal for JPEG, PNG, WebP and GIF. It removes Exif (camera, dates, serial numbers), the GPS location, embedded thumbnails, XMP, IPTC, comments, PNG text, multi-picture and depth images (MPF), content credentials (C2PA) and data appended after the image (motion photos). It keeps the colour profile, and the orientation in a 26-byte Exif block, so photos stay upright. Works on the server.
  - `readImageInfo(file)`: format, size, orientation, animation and the metadata a file carries, read from its bytes. This includes AVIF and HEIC, whose Exif and GPS are found through their item tables. It never decodes the picture and never trusts the file name or the claimed type.
  - Safe with hostile files: sizes are checked against `maxInputPixels` before decoding (decompression bombs), every parser read is bounded by its own box or chunk, and fuzz tests feed random and mutated files to every parser. Animations keep every frame by default (`animated: 'keep' | 'first-frame' | 'reject'`). Every failure is a typed error, and `signal` and `timeoutMs` cancel the work.
  - `removed` is read back from the output, not assumed (some encoders add their own colour profile), and an injectable `environment` takes a custom decoder or a test double.
  
  Also: the published `react-smart-copy/code` bundle no longer contains its lookalike table as raw Cyrillic and Greek letters (the build had turned the escapes into characters), so security scanners don't flag the package itself. Every release is now checked by the package's own `inspectCode` for hidden, reordering, control and lookalike characters before it is published.

## 1.12.0

### Minor Changes

- bece0dd: Add `react-smart-copy/code`: copy code the way developers expect, paste it safely.
  
  - `codePayload(source, options?)`: a copy payload for a string or a rendered, highlighted code block. It holds plain text for editors and terminals, plus monospaced HTML with the block's syntax colours for Google Docs, Word, Slack, Teams and mail. Line-number gutters, `user-select: none` and `aria-hidden` parts, hidden parts, buttons and `data-copy-ignore` are left out. `codeFromElement` returns just the text.
  - Terminal and REPL sessions copy as their commands (`prompt: 'auto'`): bash/zsh, PowerShell, cmd, Python, IPython and Node prompts, or your own pattern. Continued commands stay whole (a trailing backslash, a heredoc, an open quote), and output is dropped. `diff: 'after' | 'before'` copies one side of a unified diff, and `lineNumbers: true` removes typed line numbers that count up. Shared indentation and trailing whitespace are removed and line endings normalised. `normalizeCode` exposes all of this, and also works on the server.
  - `pasteAsCode(event, options?)`: a paste handler for code fields. It fixes curly quotes, dashes, no-break spaces and invisible characters, dedents, and indents each line to the cursor. The browser's undo stays intact. `onPaste` sees every finding and can cancel. `pasteToCode(result)` serves `usePaste`, CodeMirror and Monaco.
  - `inspectCode(text)` finds code that runs differently from how it reads, with line, column and Unicode name: Trojan Source bidi overrides (CVE-2021-42574), invisible identifiers (Hangul fillers), hidden tag characters, runs of variation selectors, Cyrillic and Greek lookalikes in Latin words, control characters, unusual spaces and typographic punctuation. Joiners in Arabic, Persian, Indic and emoji, and full-width punctuation in CJK text, are left alone. `cleanCode(text)` applies safe replacements until nothing fixable is left, and never guesses a letter.
  - Pasted code is never cut: past `maxLength` it is a `too-large` error, or a native paste with `pasteAsCode`. HTML is parsed inertly.
  
  `insertText` now lives in one shared module and is exported from both `/markdown` and `/code`.

## 1.11.0

### Minor Changes

- 94358e2: Add `react-smart-copy/markdown`: paste rich content as Markdown.
  
  - `pasteAsMarkdown(event, options?)`: a paste handler for a `<textarea>` or text `<input>` (`onPaste={pasteAsMarkdown}`). Rich pastes from Google Docs, Word, Notion, GitHub, web pages and mail are inserted as Markdown at the cursor. The browser's undo still works, with the paste as its own step, `input` events fire so React state follows, and `maxlength` is respected. Plain-text pastes, which are usually Markdown already, and code from editors are left to the browser.
  - `htmlToMarkdown(source, options?)`: HTML string or DOM node to CommonMark with GFM tables, strikethrough and task lists. Handles Google Docs (CSS-only bold and italic, the non-bold `<b>` wrapper, sibling-nested lists, redirect links), Word (`mso-list` lists), mail layout tables and code editors.
  - `pasteToMarkdown(result, options?)`, `insertText(field, text)` and `escapeMarkdown(text)` for custom flows, including `usePaste` and `PasteField`.
  - Correct by construction: every emphasis delimiter is checked with CommonMark's own pairing algorithm before it is kept, so text always renders as the same text. Property tests with a CommonMark parser check this.
  - Secure by default: inert parsing (no scripts, no requests), no raw HTML in the output, links limited to `http:`, `https:` and `mailto:`, images as alt text unless `images: 'keep'`, and explicit `maxLength`, `maxNodes` and `maxDepth` limits reported through `truncated`.

## 1.10.0

### Minor Changes

- 7a41986: Add `react-smart-copy/structured`: typed, versioned, validated application data on the clipboard.
  
  - `defineClipFormat({ id, version, schema, migrate, encode, text, html })` defines a format. The schema can be any Standard Schema (Zod, Valibot, ArkType, Effect Schema) or a plain validator function, and the value type is inferred from it.
  - `clipPayload(format, value)` builds a payload for `copy()`, a `useCopyInterceptor` transform or a `useDragCopy` source. It carries the data three ways: a web custom format (`web application/vnd.<id>+json`), a custom clipboard type, and a hidden envelope in the HTML, plus readable text and HTML for other apps. Every browser and paste path gets at least one.
  - `readClip(source, format)` / `readClipSync` read the data from a `PasteResult`, a `DataTransfer` or a payload, and return `ok`, `absent`, `invalid` or `unsupported-version`. They never throw for clipboard content. `clipAccept(...formats)` returns the `accept` list for `usePaste` and `PasteField`.
  - Security: carriers are size-checked before they are parsed (`maxBytes`, default 8 MiB), own `__proto__` keys are dropped, migrations run before the schema validates, and copying rejects values `JSON.stringify` would silently change (`NaN`, `BigInt`, `Map`, `Set`, functions).
  
  Core additions, all backward compatible:
  
  - `multi` payload items accept `optional: true`. An optional item is written only when `ClipboardItem.supports()` confirms its type, and is skipped otherwise instead of failing the copy.
  - Copy and drag events skip web custom formats, which only the async Clipboard API can write.
  - `accept` accepts web custom formats (`'web application/vnd.acme+json'`), and `+json` types arrive as strings. Wildcards never match either kind, so they must be listed exactly, as `image/svg+xml` already had to be.
  - New helpers `normalizeClipboardType` and `isWebCustomFormat`.

## 1.9.0

### Minor Changes

- f7eaabe: Add `react-smart-copy/table`: spreadsheet-ready copy and paste for tables.
  
  - **Copy:** `tablePayload(data)` returns an `html` payload, an HTML `<table>` plus tab-separated text, for `copy()`, `useCopyInterceptor` and `useDragCopy`. Rows paste as cells in Excel, Google Sheets, Numbers and LibreOffice, and as a table in Docs, Word and Notion. Numbers, bigints, booleans and dates stay typed; strings stay text, so leading zeros survive (`preserveText`). Text that would run as a formula is neutralised by default, following OWASP's CSV Injection guidance (`formulaGuard`).
  - **Sources:** `fromRows` for your own objects (type-checked column keys), `fromAgGrid` for AG Grid v31+ (Community and Enterprise), `fromTanStackTable` for TanStack Table v8 and v9 in any framework, and `fromTableElement` for any rendered `<table>`. No dependency on any grid library.
  - **Paste:** `parseTable` reads the HTML that Excel, Google Sheets, Word and web pages put on the clipboard (merged cells, line breaks, hidden rows) and falls back to tab-separated text, also on the server. `toRecords` maps a pasted range onto typed records by header, with aliases, and reports missing columns and parse errors. Explicit limits for rows, columns, cells and input length, reported through `truncated`.
  
  Also: a `CopyFailure` thrown inside a `copy()` source, a drag source or a copy transform now keeps its own error type (for example `too-large`) instead of becoming a generic `invalid-payload`.

### Patch Changes

- 06a4afe: Docs: the README roadmap now lists the `react-smart-copy/testing` subpackage under 1.6, the version it shipped in.

## 1.8.1

### Patch Changes

- 9e51b6d: Docs: the npm README now links the GitHub repository for stars and names the package author, and `package.json` carries the author's name and site.

## 1.8.0

### Minor Changes

- 3fdf411: Add `useDragCopy` — a headless React hook that makes any element draggable and populates its `DataTransfer` with structured data on `dragstart`.
  
  **Features:**
  
  - **Structured payloads** — `text`, `html` (with plain-text fallback), `json`, and `multi` (arbitrary MIME types).
  - **Zero Clipboard API** — works in every browser that supports HTML5 drag-and-drop.
  - **Always-fresh source** — the `source` callback reads the latest props/state on every drag, never stale closures.
  - **`enabled` prop** — remove `draggable` and the listener without unmounting; status resets to `idle`.
  - **`effectAllowed`** — controls the browser drag cursor and permitted drop effects.
  - **`onDragStart` prop path** — stable callback for use inside render-prop components or when the native listener alone isn't enough.
  - **SSR-safe** — no DOM access during server rendering; `draggable` is never set on the server.
  - **Framework-agnostic core** — `applyDragCopy` and `registerDragCopy` are also exported from `react-smart-copy/core`.
  
  ```tsx
  const { ref } = useDragCopy({
    source: () => ({ kind: 'html', html: '<b>Hello</b>', text: 'Hello' }),
    effectAllowed: 'copy',
  });
  return <div ref={ref}>Drag me</div>;
  ```

## 1.7.2

### Patch Changes

- 0c3f028: Docs: README footer now reads "Made with ❤️ from 🇮🇳". No code changes.

## 1.7.1

### Patch Changes

- 70d3ace: Copy interception: `selection.text` now matches what the browser itself would copy
  
  `CopySelection.text` was built from `Range#toString()`, which returns raw DOM text. In real
  browsers that meant source indentation, line breaks from your markup and visually hidden text
  leaked into rewritten copies, so an attribution transform produced messier text than a plain
  Ctrl/⌘+C. It is now read from `Selection#toString()`, which follows the rendered layout. `html`
  and `fragment` are unchanged.

## 1.7.0

### Minor Changes

- 5b043cd: Control what native copy puts on the clipboard: `useCopyInterceptor`
  
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

## 1.6.0

### Minor Changes

- 2f75705: ## `react-smart-copy/testing` — test utilities subpackage
  
  A new **`react-smart-copy/testing`** entry point ships three utilities that
  make consumer test suites resilient to future API additions:
  
  ### `createPasteResult(init?)`
  
  Builds a complete, self-consistent `PasteResult` from partial input. Every
  field has a sensible default (`null`, `[]`, `'clipboard'`), so adding a
  required field in a future release will not break existing test code.
  
  ```ts
  import { createPasteResult } from 'react-smart-copy/testing';
  
  // Builds items, imageFiles, etc. automatically
  const result = createPasteResult({ text: 'hello', source: 'clipboard' });
  ```
  
  When `items` is omitted it is derived from `text`, `html`, and `images`;
  `imageFiles` is always computed from the intersection of `images` and `files`,
  exactly as the machine does.
  
  ### `createMockPasteAdapter()`
  
  Returns a controllable `PasteAdapter` backed by a result queue. Queue entries
  are consumed in FIFO order; an empty queue rejects with `'no-content'`.
  
  ```ts
  import { createMockPasteAdapter, createPasteResult } from 'react-smart-copy/testing';
  import { createPasteMachine } from 'react-smart-copy/core';
  
  const mock = createMockPasteAdapter();
  mock.queueResult(createPasteResult({ text: 'hello' }));
  mock.queueError(createCopyError('permission-denied', 'blocked'));
  
  const machine = createPasteMachine({ adapter: mock.adapter });
  await machine.paste();                    // → { status: 'read', result: … }
  expect(mock.readCount()).toBe(1);
  ```
  
  Pass `mock.adapter` as `adapter` in `createPasteMachine` options or in
  `usePaste`'s `adapter` prop.
  
  ### `createMockClipboardAdapter()`
  
  Returns a controllable `ClipboardAdapter` backed by a success/error queue.
  Captures the last payload the machine sent so you can assert on it.
  
  ```ts
  import { createMockClipboardAdapter } from 'react-smart-copy/testing';
  import { createCopyMachine } from 'react-smart-copy/core';
  
  const mock = createMockClipboardAdapter();
  mock.queueSuccess();
  
  const machine = createCopyMachine({ adapter: mock.adapter });
  await machine.copy('hello');
  expect(mock.lastPayload()).toEqual({ kind: 'text', value: 'hello' });
  ```
  
  ### Re-exports
  
  `react-smart-copy/testing` also re-exports the types most often needed in
  test files: `CopyFailure`, `CopyError`, `CopyPayload`, `PasteAdapter`,
  `PasteReadResult`, `PasteResult`, `PasteSource`, `PasteItem`, and
  `ClipboardAdapter`, so a single import path covers both the utilities and
  their types.
  
  ### Why now?
  
  v1.3.0 added `imageFiles` and v1.4.0 added `source: 'drop'` to `PasteResult`.
  Both releases required consumers to update hand-written result literals in their
  tests. `createPasteResult` absorbs future additions at the library level so
  that upgrading a minor release never touches test code.
  
  ### Bundle size
  
  683 B brotli (zero browser globals; works in Node, jsdom, and Deno).

## 1.4.0

### Minor Changes

- a7b04e9: **Drag-and-drop through the paste pipeline.**
  
  - **New: drops are pastes.** A dropped file or text selection goes through the same `accept` list, `maxBytes` / `maxItems` limits and image byte-checks as a paste, and resolves with `result.source === 'drop'`. Dropped image files arrive in `result.imageFiles` with their names.
  - **New: `PasteField.Zone` accepts drops by default.** It sets `data-drag-over` while an accepted drag is over it and announces `messages.dropped` ("Dropped content added"). If you override only `pasted`, for example to translate it, that message is used for drops too. Pass `droppable={false}` to keep the 1.3 behaviour. Your own `onDragEnter` / `onDragOver` / `onDragLeave` / `onDrop` handlers run first, and calling `preventDefault()` in one takes over.
  - **New in `usePaste`:**
    - `dropTargetProps`: spread it onto one element.
    - `isDragOver`.
    - `dropEvent`.
  
    Drops are kept separate from `targetProps`, so a textarea that only spreads `targetProps` keeps its native text drop.
  - **New in core:**
    - `machine.dropEvent(event)`.
    - `canAcceptDrag(dataTransfer, options)`: decides from the item kinds and types a browser exposes while dragging. A file whose type is hidden until the drop counts as a maybe.
    - The `PasteDropEventLike`, `DataTransferItemLike` and `PasteDropTargetProps` types.
  - **Safe in real browsers:**
    - Every `dragover` on the target is claimed. Drags the field doesn't accept get `dropEffect: 'none'`, so a rejected file is cancelled instead of being opened in place of your page.
    - Drags aimed at an `<input>`, `<textarea>` or editable region nested inside the target keep their native behaviour. Inside a target that is itself editable, every drop is still checked against `accept` and the limits.
    - The drop effect respects the source's `effectAllowed`.
    - The drag-over state clears on any drop or `dragend`, and when the pointer leaves for an element outside the target, so it can't get stuck.
  - **New: `describePasteError(error, source?)`.** Pass `state.source` to word drop failures as drops ("The dropped content is too large."). `messages.error` receives the source as its second argument.
  - **Changed:** the developer-facing `no-content` message now says "content" instead of "clipboard", since it covers drops too.
  - **Docs:** the README already said `PasteField.Zone` accepts drops, which wasn't true until this release.
  - Tests: 459 at 100% coverage, with drag behaviour also checked in Chromium against the docs site.
  - Size (brotli):
  
    | Bundle | 1.4.0 | 1.3.0 |
    |---|---|---|
    | `usePaste` | 4.29 kB | 3.79 kB |
    | `PasteField` | 7.03 kB | 6.37 kB |
    | core | 6.05 kB | 5.86 kB |
    | `useCopy`, `CopyField` + `CopyGroup`, capture | unchanged | |
  
  **Heads-up for TypeScript users.** Everything is additive, but:
  
  - **Exhaustive switches on the source.** `PasteSource` gains `'drop'`, so an exhaustive `switch` over `result.source` or `state.source` needs the new case.
  - **Hand-built objects.** If you build these types by hand, for example in test mocks, add the new members:
    - `UsePasteResult` (and so `PasteFieldContextValue`) gains `dropEvent`, `dropTargetProps` and `isDragOver`.
    - `PasteMachine` gains `dropEvent`.
  - **Messages.** `PasteFieldMessages` gains an optional `dropped`. `error` may receive a second `source` argument, and existing one-argument functions still fit.

## 1.3.0

### Minor Changes

- e1e010d: **Lifecycle callbacks, consistent `maxBytes`, and `PasteResult.imageFiles`.**
  
  - **New: `onCancel(reason)`.** `useCopy`, `usePaste`, `createCopyMachine` and `createPasteMachine` accept `onCancel`, called once when an in-flight operation is cancelled: `'reset'`, `'disconnect'` (unmount), or for paste `'superseded'` (a paste event replaced a Clipboard API read). It is not called when nothing was in flight, so React Strict Mode's extra mount/unmount is silent. The new `CopyCancelReason` and `PasteCancelReason` types are exported. (The callback is named `onCancel` rather than `onRelease` so it isn't confused with `CopyGroup`'s internal hand-off.)
  - **New: `onReset()`.** Called when `reset()` moves a copy or paste out of a non-idle state. When `reset()` cancels work, `onCancel('reset')` runs first, then `onReset()`. It is not called for the automatic `resetAfterMs` timer or a `CopyGroup` hand-off.
  - **New: `PasteResult.imageFiles`.** These are the entries of `files` that were verified as images. They keep their file names (retyped from their bytes when needed) and can go straight into `FormData`. Clipboard API image blobs, which have no names, stay in `images` only. The paste machine derives `imageFiles` from every adapter's result, so the field is always consistent.
  - **Changed: `maxBytes` counts UTF-8 bytes on every paste path.** Before this release, paste events and `readText()` measured strings in UTF-16 code units, while `navigator.clipboard.read()` charged `Blob.size`. The same text could therefore pass on one path and fail on another. Strings are now measured as they would be encoded, without allocating a copy. Non-ASCII text counts more than before: `'日本'` is 6 bytes, not 2. If you set a tight `maxBytes` for CJK or emoji-heavy content, check your limit.
  - **Changed:** if a custom adapter (typically untyped JavaScript) resolves a result without `images` or `files`, the paste now ends in an `error` state. Before, the incomplete object was stored as a successful read.
  - Tests: 427 at 100% coverage, including type-level tests for the new API.
  - Size (brotli):
  
    | Bundle | 1.3.0 | 1.2.0 |
    |---|---|---|
    | `useCopy` | 3.42 kB | 3.37 kB |
    | `usePaste` | 3.79 kB | 3.59 kB |
    | `PasteField` | 6.37 kB | 6.18 kB |
    | `CopyField` + `CopyGroup` | 5.55 kB | 5.51 kB |
    | core | 5.86 kB | 5.66 kB |
    | capture | 3.54 kB | unchanged |
  
  **Heads-up for TypeScript users.** No runtime behaviour you rely on is removed, but:
  
  - **Building results by hand.** `PasteResult` gains a required `imageFiles`. If you build `PasteResult` objects by hand, for example in test mocks or `onPaste` fixtures, add `imageFiles: []`.
  - **Custom adapters.** `PasteAdapter.read()` now resolves `PasteReadResult`, which is `PasteResult` without `imageFiles`. Existing adapters that return a full `PasteResult` keep compiling.
  - **Reading adapters directly.** If you store `createBrowserPasteAdapter().read()` in a variable typed `PasteResult`, change it to `PasteReadResult`.
  - **Options types.** `UseCopyOptions`, `UsePasteOptions` and the machine options gain the optional `onReset` and `onCancel`.

## 1.2.0

### Minor Changes

- **Paste retry, cancellation and `PasteField.Preview`.**
  
  - **New: paste `retry()`.** `usePaste` and `createPasteMachine` gain `retry()`, `canRetry` and a `maxRetries` option (default 3), matching the copy side. After a retryable failure of the Paste button (permission denied, page not focused, timeout), `retry()` reads the clipboard again; past the cap it fails with `max-retries-exceeded`. Keyboard-paste failures report `not-retryable`, because the event's data is gone once it has been handled. `canRetryPasteState()` is exported for vanilla use, and `PasteField.Trigger` render props now include `canRetry`.
  - **New: cancellation.** Every copy and paste gets an `AbortSignal` that fires on `reset()`, on unmount, or when a newer paste supersedes it, and never after the operation has finished. Late results were already ignored; now the work itself stops. Lazy image sources and custom adapters receive it as an optional last argument (`OperationContext`), `captureSource` / `captureImage` stop rasterising (combined with any `signal` you pass, without leaking listeners on browsers lacking `AbortSignal.any`), and the browser paste adapter stops reading further clipboard items. Existing adapters and sources keep working unchanged.
  - **Changed: cancelled operations resolve `{ status: 'ignored', reason: 'cancelled' }`.** If a copy or paste fails *after* you cancelled it (reset, unmount, superseded), the promise you awaited now resolves `ignored`/`cancelled` instead of `error`, and `onError` is not called. Code that shows a toast for `status === 'error'` no longer reports failures for work the user walked away from.
  - **New: `PasteField.Preview`.** Shows what was pasted: text (truncated at `maxTextLength`), image thumbnails with `imageAlt` text, and non-image file names. It never renders pasted HTML. Object URLs are revoked when the result changes and on unmount. Pass a function child to render `{ result, imageUrls }` yourself, and `placeholder` for the empty state.
  - **Fix:** `useCopy().canRetry` now reads `maxRetries` from the effective options, the same ones the machine uses.
  - **Docs:** the README's `PasteField` example passed `onPaste` to `PasteField.Root`, which has no such prop. It now goes in `pasteOptions`.
  - Tests: 398 at 100% coverage, including StrictMode runs of `CopyGroup` and `PasteField.Preview`, and type-level tests for the paste API.
  - Size (brotli): `PasteField` with `Preview` 6.18 kB (was 5.40), `usePaste` 3.59 kB (was 3.16), `useCopy` 3.37 kB (was 3.22), `CopyField` + `CopyGroup` 5.51 kB (was 5.37), core 5.66 kB (was 5.47), capture 3.54 kB (was 3.41).
  
  **Heads-up for TypeScript users.** All changes are additive, but if you build these types by hand (for example in test mocks), you'll need the new members:
  
  - `PasteErrorState` gains `source` and `retryCount`
  - `PasteMachine` gains `retry`; `UsePasteResult` (and so `PasteFieldContextValue`) gains `retry` and `canRetry`
  - `PasteFieldTriggerRenderProps` gains `canRetry`
  - `PasteIgnoredReason` gains `'nothing-to-retry'`, `'not-retryable'` and `'cancelled'`; `CopyIgnoredReason` gains `'cancelled'`. An exhaustive `switch` over ignored reasons needs the new cases.

## 1.1.1

### Patch Changes

- **Accessibility fixes for `PasteField` and `CopyField`.** No API changes; no bundle growth.
  
  - **Fix: `PasteField.Zone` accessible name.** The zone set both `aria-label` and `aria-labelledby`, and `aria-labelledby` wins, so a custom `zoneLabel` message or `aria-label` prop was silently ignored. The zone is now named by `aria-label` only ("Paste area for Notes"). Pass `aria-labelledby` yourself if you want to name it from another element.
  - **Fix: reduced motion in `PasteField.Trigger`.** The default label crossfade now respects `prefers-reduced-motion`, matching `CopyField.Trigger`. Both triggers now share one label component.
  - **New: `aria-busy` on triggers.** `CopyField.Trigger` and `PasteField.Trigger` set `aria-busy="true"` while a copy or paste is in flight, so screen readers know the action is in progress. The button is still never `disabled`, so focus stays put.
  - **New: `aria-keyshortcuts` on `PasteField.Zone`.** Defaults to `"Control+V Meta+V"` so screen-reader users hear how to paste. Override it with your own `aria-keyshortcuts` prop.
  - **Docs:** `maxRetries` JSDoc now states that `0` disables retry and `Infinity` allows unlimited retries.

## 1.1.0

### Minor Changes

- Add `PasteField` compound component — a headless, fully accessible paste UI that mirrors `CopyField` for the paste side.
  
  **New exports**
  
  - `PasteField` — compound component with `Root`, `Label`, `Status`, `Zone`, `Trigger` sub-components
  - `usePasteField()` — context hook for building custom sub-components inside `PasteField.Root`
  - `defaultPasteFieldMessages` — the default English messages object
  - `usePasteDisplayStatus` — flicker-free presentation hook for paste status (suppresses the `reading` flash on fast pastes)
  - `DEFAULT_PASTE_PENDING_DELAY_MS` / `DEFAULT_PASTE_MIN_PENDING_MS` — exported timing constants
  
  **`PasteField` highlights**
  
  - `PasteField.Zone` — a `<div role="region">` that accepts keyboard `paste` events and drag-and-drop, focusable by default (`tabIndex=0`)
  - `PasteField.Status` — displays a human-readable label per paste status (`idle → "Ready"`, `reading → "Reading…"`, `read → "Pasted"`, `error → "Error"`)
  - `PasteField.Trigger` — button that calls the Clipboard API; supports render-function children for full control
  - All parts carry `data-state` (real), `data-display-state` (flicker-free), and `data-revealed` attributes for CSS styling
  - Built-in `<LiveRegion>` announces success and error messages to screen readers
  - Full SSR support, `alwaysVisible` prop, custom `messages` overrides, `pendingDelayMs` / `minPendingMs` timing controls
  - 44 new tests; 350 tests total, 100% coverage maintained

## 1.0.0

### Major Changes

- v1.0.0 — production-ready release
  
  Full SSR safety audit across every hook and core module, verified with 10 dedicated SSR tests in a Node environment (no `window`). Hardened against prototype pollution in `CopyField` kind labels and clipboard adapter multi-format record creation. Comprehensive WCAG 2.1 AA accessibility audit confirmed compliance across all 10 relevant criteria. Performance and bundle size at peak — zero runtime dependencies, tree-shaking annotations throughout, frozen singletons, proper memoization. 302 tests at 100% coverage across statements, branches, functions, and lines. Package integrity verified with `publint --strict` and `@arethetypeswrong/cli`.

## 0.2.1

### Patch Changes

- **Security & accessibility hardening — all improvements are backwards-compatible.**
  
  ### Security
  - **ReDoS fix**: SVG attribute reading now uses pre-compiled `RegExp` objects instead of runtime-constructed ones — eliminates catastrophic backtracking risk on untrusted SVG markup
  - **Resource leak fix**: `withDeadline` (SVG/DOM capture) now aborts its internal `AbortController` on task completion, stopping downstream cooperative work from running after the result is already settled
  - **Async source guard**: passing an async function (returning a `Promise`) as the copy source now fails immediately with a clear `invalid-payload` error instead of silently breaking the user-gesture window required for clipboard writes
  
  ### Accessibility (WCAG)
  - **Live region role**: `LiveRegion` now uses `role="status"` for all politeness levels instead of `role="alert"` for assertive — `role="alert"` interrupts any sentence currently being spoken, which is inappropriate for copy feedback (WCAG 4.1.3)
  - **Mount-safe announcements**: the live region no longer writes its initial message as React children — it writes imperatively via a ref after mount, preventing spurious announcements on SSR hydration and strict-mode double-mounts in JAWS / NVDA
  - **Non-text payload labels**: `CopyField.Value` now renders a human-readable description for non-text payloads so screen-reader users know what will be copied: `html` → "Rich text", `image` → "Image", `json` → "JSON data", `multi` → "Mixed content"
  - **Accessible name guard**: `CopyField.Trigger` now guarantees a non-empty `aria-label` even if a custom `triggerLabel` message returns an empty string
  
  ### Robustness
  - **Ghost state eliminated**: in `PasteMachine`, option-resolution errors now transition directly to `error` without briefly passing through `reading` — observers no longer see a spurious intermediate state
  
  ### Performance
  - **`useMediaQuery` caching**: the `MediaQueryList` object is now cached in a ref and reused across renders; `matchMedia()` is called only when the query string changes, avoiding repeated parse/layout work on every render

## 0.2.0

### Minor Changes

- a21bd64: **Paste, copy groups and image capture.**
  
  - **`usePaste`**: read the clipboard with the same honest state machine as `useCopy` (`idle → reading → read | error`). Supports a Paste button (`paste()`) and keyboard paste with no permission prompt (`targetProps` or `listenOnDocument`). Strict by default: plain text only unless you `accept` more, images verified from their bytes, SVG never matched by wildcards, `maxBytes` / `maxItems` enforced before decoding. Framework-agnostic `createPasteMachine` and `createBrowserPasteAdapter` in `react-smart-copy/core`.
  - **`<CopyGroup>`**: only one `useCopy` / `CopyField` inside shows "Copied" at a time. Built on `createCopyCoordinator()`, also usable from vanilla `createCopyMachine({ coordinator })`.
  - **`react-smart-copy/capture`** (new, opt-in entry, zero dependencies): `svgToPngBlob`, `captureElement`, `captureSource` and `captureImage` to copy an `<svg>` or any element as a verified PNG, with pixel limits, timeouts and `AbortSignal` support.
  - **Fix (React 18)**: a fast `CopyField` copy could stay on "Copied" instead of auto-resetting, because `useDisplayStatus` updated state during render, which disturbs `useSyncExternalStore` on React 18.
  - **Fix**: an image copy is no longer reported as copied when a lax clipboard implementation resolves without reading an image source that failed.
  - `toCopyError(cause, operation)` now produces read-specific messages and classifies `AbortError` / `TimeoutError`. New `describePasteError()`.
  
  **Heads-up:** `CopyErrorType` gains `no-content`, `too-large`, `timeout` and `aborted`. If you keep an exhaustive `Record<CopyErrorType, string>` of translations, add these four keys.

## 0.1.0

### Initial release

- **`useCopy`**: an honest copy state machine (`idle → copying → copied | error`) with retry, auto-reset and stable function identities. `copy()` never rejects; it resolves to an outcome you can branch on.
- **`CopyField`**: headless compound component (`Root`, `Label`, `Value`, `Trigger`) with reveal on hover, focus and touch, a screen-reader announcement, and a stable-width trigger label.
- **Payloads**: plain text, rich HTML with a required plain-text fallback, JSON, and PNG image blobs, as a typed discriminated union.
- **`useDisplayStatus`**: flicker-free rendering status, so "Copying…" never flashes for a one-frame copy.
- **`useRevealOnInteraction`** and **`LiveRegion`** for building your own accessible copy rows.
- **`react-smart-copy/core`**: framework-agnostic `createCopyMachine` and the browser clipboard adapter.
- Typed errors with `describeCopyError()`. SSR-safe, zero runtime dependencies, dual ESM and CommonJS builds.
