---
title: "Payloads"
description: "What a copy writes: text, HTML with a plain-text fallback, images, JSON and several formats at once."
---

A bare string is shorthand for text. Everything else is a discriminated union, so the
compiler stops you from, say, copying HTML without a plain-text fallback.

```ts
copy("PLT-29018");
copy({
  kind: "html",
  html: "<b>INV-29018</b> · ₹12,400",
  text: "INV-29018 · ₹12,400",
});
copy({ kind: "json", value: row, pretty: true });
copy({ kind: "image", blob: () => chartToPngBlob() });
copy({
  kind: "multi",
  items: [
    { mimeType: "text/plain", data: "INV-29018" },
    { mimeType: "text/html", data: "<b>INV-29018</b>" },
  ],
});
copy(() => editor.getValue()); // resolved at click time, always the latest value
```

A `multi` item can be marked `optional: true`: it is written only when `ClipboardItem.supports()`
confirms its type, and skipped otherwise instead of failing the copy. That is how a web custom
format (`"web application/vnd.acme.rows+json"`, Chromium) rides along with HTML and text that
every browser writes. Copy and drag events skip web custom formats, which only the async
Clipboard API can write.

## Copying an image, including a piece of your UI

Pass a **function** that produces the Blob. It is called synchronously inside the click,
and its promise is handed straight to `ClipboardItem`, which is what Safari needs to allow
asynchronous image generation. The `react-smart-copy/capture` entry does this for you.
