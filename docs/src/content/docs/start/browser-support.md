---
title: "Browser support"
description: "What works where, and the typed error you get where a capability is missing."
---

Plain text works wherever `navigator.clipboard.writeText` exists: Chromium 66+, Firefox 63+,
Safari 13.1+. Where it does not (a plain-HTTP page, a webview without `navigator.clipboard`),
text, HTML and JSON are copied through the browser's `copy` command instead, in every engine
tested; only images need HTTPS.

**Embedded apps.** A Microsoft Teams tab, a SharePoint web part, a Storybook canvas or any app
in an iframe from another origin gets no clipboard access in Chromium unless the host page
adds `allow="clipboard-write"`, which you usually cannot change. When the browser refuses the
write that way, the same `copy` command fallback is used while the click is still fresh, so a
copy button keeps working. If you control the host page, `allow="clipboard-write"` is still
the better fix: it also lets images through. Rich HTML, PNG images and multi-format need `ClipboardItem`: Chromium 86+,
Safari 13.1+, Firefox 127+. Keyboard paste (`targetProps`, `listenOnDocument`) and drag-and-drop
(`dropTargetProps`, `PasteField.Zone`) work in every modern browser. The Paste button needs `navigator.clipboard.readText` (Chromium 66+, Safari 13.1+,
Firefox 125+) or `read()` for images (Chromium 86+, Safari 13.1+, Firefox 127+). Web custom formats
(`react-smart-copy/structured`'s first carrier) need Chromium 104+; elsewhere the HTML carrier is used. Check MDN for
embedded webviews. Where a capability is missing you get a typed error, never a silent success.
