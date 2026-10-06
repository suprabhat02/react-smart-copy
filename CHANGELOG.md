# react-smart-copy

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
