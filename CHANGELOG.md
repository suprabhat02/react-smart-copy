# react-smart-copy

## 1.6.0

### Minor Changes

- 2c42967: ## `react-smart-copy/testing` — test utilities subpackage
  
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

## 1.5.0

### Minor Changes

- 2c42967: ## `react-smart-copy/testing` — test utilities subpackage
  
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

- 298e972: **Drag-and-drop through the paste pipeline.**
  
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

- a2f4b7a: **Lifecycle callbacks, consistent `maxBytes`, and `PasteResult.imageFiles`.**
  
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

- 783e87e: **Paste, copy groups and image capture.**
  
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
