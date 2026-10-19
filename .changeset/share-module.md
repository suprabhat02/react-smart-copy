---
"react-smart-copy": minor
---

Add sharing: one button that opens the share sheet on phones and tablets and copies a titled link everywhere else.

- `useShare` (from `react-smart-copy`) returns `share`, `status` (`idle`, `sharing`, `shared`, `copied` or `error`) and `method`. `method` is `"native"` or `"copy"`, so the button can say "Share…" or "Copy link". It is `"copy"` during server rendering, then follows the device.
- `react-smart-copy/share` (framework-agnostic): `shareOrCopy(content, options)` never rejects. It resolves to `shared`, `copied` (with its reason: `preferred`, `unsupported` or `fallback`), `cancelled` or `error` with a typed `CopyError`. Closing the share sheet is `cancelled`: never an error, and never a surprise copy. Also `shareMethod` and `describeShareError`.
- `mode`: `"auto"` (default) uses the share sheet on touch-first devices, `"native"` uses it wherever available, and `"copy"` always copies. When the share sheet fails, the link is copied instead (`fallback: false` reports the error instead).
- Links are checked like everything in `react-smart-copy/link`: safe schemes only, credentials removed, tracking parameters removed with `clean: true`, titles cleaned. Files go only to a share sheet that accepts them.
- `react-smart-copy/link` constants are now marked pure, so bundles that don't use them drop them.
