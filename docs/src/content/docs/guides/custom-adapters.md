---
title: "Custom adapters"
description: "Replace how the clipboard is written or read: native shells, extensions and tests."
---

The clipboard is reached through an adapter. Pass your own to route copies through Electron, a native bridge or a test double.

```ts
import {
  CopyFailure,
  createCopyError,
  type ClipboardAdapter,
} from "react-smart-copy/core";

const electronAdapter: ClipboardAdapter = {
  write: async (payload, context) => {
    if (payload.kind !== "text")
      throw new CopyFailure(createCopyError("unsupported-format", "Text only"));
    window.electron.clipboard.writeText(payload.value);
    // context?.signal aborts on reset / unmount: check it before any slow follow-up work.
  },
};
```

Start the platform write before any `await`, or browsers drop the user gesture.

## The default adapter's options

`createBrowserClipboardAdapter(options)` is what `useCopy` uses when you pass no adapter.

```ts
import { createBrowserClipboardAdapter } from "react-smart-copy/core";

const adapter = createBrowserClipboardAdapter({
  degradeHtmlToText: true, // HTML becomes its plain text where rich copy is impossible
  legacyFallback: true, // without the async API (plain HTTP, old webviews), use the copy command
});
```

With `legacyFallback` (the default), a page without the async Clipboard API still copies text,
HTML and JSON through `document.execCommand('copy')`: the payload is written exactly through the
`copy` event, nothing is added to the visible page, the user's selection and focus are restored,
and page copy handlers and interceptors do not rewrite it. Images still need the async API.
Pass `false` to get `insecure-context` or `unsupported` instead, for example to make a page
insist on HTTPS.
