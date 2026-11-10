---
'react-smart-copy': minor
---

`react-smart-copy/compat`: a drop-in replacement for `react-copy-to-clipboard`. Change the import and keep the JSX: the same props, the same single child cloned with your other props, its own `onClick` kept, and `onCopy(text, result)`, now with a third argument saying why a copy failed. On the way it drops the blocking `window.prompt` on failure, writes plain text through the Clipboard API (no styling carried into the paste), and with `format: "text/html"` writes the HTML and its plain text, where the original wrote only the HTML. `onCopy` runs when the copy is written, still reports after a menu closes and unmounts it, and the whole component works on plain HTTP and in embedded apps. The migration guide lists each difference; the component is checked with a real click in Chromium, Firefox and WebKit.
