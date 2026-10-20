---
title: "Browser support"
description: "What works where, and the typed error you get where a capability is missing."
---

Plain text works wherever `navigator.clipboard.writeText` exists: Chromium 66+, Firefox 63+,
Safari 13.1+. Rich HTML, PNG images and multi-format need `ClipboardItem`: Chromium 86+,
Safari 13.1+, Firefox 127+. Keyboard paste (`targetProps`, `listenOnDocument`) and drag-and-drop
(`dropTargetProps`, `PasteField.Zone`) work in every modern browser. The Paste button needs `navigator.clipboard.readText` (Chromium 66+, Safari 13.1+,
Firefox 125+) or `read()` for images (Chromium 86+, Safari 13.1+, Firefox 127+). Web custom formats
(`react-smart-copy/structured`'s first carrier) need Chromium 104+; elsewhere the HTML carrier is used. Check MDN for
embedded webviews. Where a capability is missing you get a typed error, never a silent success.
