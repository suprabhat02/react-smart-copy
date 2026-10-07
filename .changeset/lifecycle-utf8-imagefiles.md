---
"react-smart-copy": minor
---

**Lifecycle callbacks, consistent `maxBytes`, and `PasteResult.imageFiles`.**

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
