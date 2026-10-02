# react-smart-copy

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
