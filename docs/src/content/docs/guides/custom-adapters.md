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

For async copy sources, an adapter can also implement `writeDeferred(text, context)`: it receives
a *promise* of the text and should start the platform write at once (the browser adapter hands
`ClipboardItem` the promise). Without it, the machine waits for the text and calls `write`,
which is right for clipboards with no gesture rules, such as Electron or a test adapter.

## The default adapter's options

`createBrowserClipboardAdapter(options)` is what `useCopy` uses when you pass no adapter.

```ts
import { createBrowserClipboardAdapter } from "react-smart-copy/core";

const adapter = createBrowserClipboardAdapter({
  degradeHtmlToText: true, // HTML becomes its plain text where rich copy is impossible
  legacyFallback: true, // without the async API (plain HTTP, old webviews), use the copy command
});
```

With `legacyFallback` (the default), a page without the async Clipboard API, or an embedded
app whose write the browser refuses with `NotAllowedError` (an iframe without
`allow="clipboard-write"`), still copies text, HTML and JSON through `document.execCommand('copy')`: the payload is written exactly through the
`copy` event, nothing is added to the visible page, the user's selection and focus are restored,
and page copy handlers and interceptors do not rewrite it. Images still need the async API.
Pass `false` to get `insecure-context` or `unsupported` instead, for example to make a page
insist on HTTPS.
