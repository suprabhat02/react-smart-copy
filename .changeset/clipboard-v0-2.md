---
"react-smart-copy": minor
---

**Paste, copy groups and image capture.**

- **`usePaste`**: read the clipboard with the same honest state machine as `useCopy` (`idle → reading → read | error`). Supports a Paste button (`paste()`) and keyboard paste with no permission prompt (`targetProps` or `listenOnDocument`). Strict by default: plain text only unless you `accept` more, images verified from their bytes, SVG never matched by wildcards, `maxBytes` / `maxItems` enforced before decoding. Framework-agnostic `createPasteMachine` and `createBrowserPasteAdapter` in `react-smart-copy/core`.
- **`<CopyGroup>`**: only one `useCopy` / `CopyField` inside shows "Copied" at a time. Built on `createCopyCoordinator()`, also usable from vanilla `createCopyMachine({ coordinator })`.
- **`react-smart-copy/capture`** (new, opt-in entry, zero dependencies): `svgToPngBlob`, `captureElement`, `captureSource` and `captureImage` to copy an `<svg>` or any element as a verified PNG, with pixel limits, timeouts and `AbortSignal` support.
- **Fix (React 18)**: a fast `CopyField` copy could stay on "Copied" instead of auto-resetting, because `useDisplayStatus` updated state during render, which disturbs `useSyncExternalStore` on React 18.
- **Fix**: an image copy is no longer reported as copied when a lax clipboard implementation resolves without reading an image source that failed.
- `toCopyError(cause, operation)` now produces read-specific messages and classifies `AbortError` / `TimeoutError`. New `describePasteError()`.

**Heads-up:** `CopyErrorType` gains `no-content`, `too-large`, `timeout` and `aborted`. If you keep an exhaustive `Record<CopyErrorType, string>` of translations, add these four keys.
