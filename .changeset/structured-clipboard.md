---
"react-smart-copy": minor
---

Add `react-smart-copy/structured`: typed, versioned, validated application data on the clipboard.

- `defineClipFormat({ id, version, schema, migrate, encode, text, html })` defines a format. The schema can be any Standard Schema (Zod, Valibot, ArkType, Effect Schema) or a plain validator function, and the value type is inferred from it.
- `clipPayload(format, value)` builds a payload for `copy()`, a `useCopyInterceptor` transform or a `useDragCopy` source. It carries the data three ways: a web custom format (`web application/vnd.<id>+json`), a custom clipboard type, and a hidden envelope in the HTML, plus readable text and HTML for other apps. Every browser and paste path gets at least one.
- `readClip(source, format)` / `readClipSync` read the data from a `PasteResult`, a `DataTransfer` or a payload, and return `ok`, `absent`, `invalid` or `unsupported-version`. They never throw for clipboard content. `clipAccept(...formats)` returns the `accept` list for `usePaste` and `PasteField`.
- Security: carriers are size-checked before they are parsed (`maxBytes`, default 8 MiB), own `__proto__` keys are dropped, migrations run before the schema validates, and copying rejects values `JSON.stringify` would silently change (`NaN`, `BigInt`, `Map`, `Set`, functions).

Core additions, all backward compatible:

- `multi` payload items accept `optional: true`. An optional item is written only when `ClipboardItem.supports()` confirms its type, and is skipped otherwise instead of failing the copy.
- Copy and drag events skip web custom formats, which only the async Clipboard API can write.
- `accept` accepts web custom formats (`'web application/vnd.acme+json'`), and `+json` types arrive as strings. Wildcards never match either kind, so they must be listed exactly, as `image/svg+xml` already had to be.
- New helpers `normalizeClipboardType` and `isWebCustomFormat`.
