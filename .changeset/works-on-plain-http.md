---
'react-smart-copy': minor
---

Copy now works where the async Clipboard API does not: on plain-HTTP pages (intranet tools, internal dashboards on an IP address) and in webviews without `navigator.clipboard`, text, HTML and JSON are copied through the browser's `copy` command, as `react-copy-to-clipboard` does. The payload is written exactly through the `copy` event: nothing is added to the visible page, the user's selection and focus are restored, and page copy handlers and interceptors do not rewrite it. HTML is copied as HTML where `ClipboardItem` is missing, instead of being reduced to text. Images still need HTTPS. Copies that used to fail with `insecure-context` or `unsupported` now succeed; pass `legacyFallback: false` to `createBrowserClipboardAdapter` to keep the old behaviour. `useCopy` grows by about 0.7 kB.

New docs page: Migrating, from react-copy-to-clipboard, copy-to-clipboard, react-use and `navigator.clipboard`, with every snippet run as a test.
