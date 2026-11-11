---
'react-smart-copy': patch
---

A URL in text becomes a Markdown autolink only when its host is letters, digits, hyphens and dots, as real hosts are. A host such as `x.y=` is valid to the URL standard, but renderers read it differently: markdown-it linked `<http://x.y=:1>` to `http://x.y:1=`, so the link went somewhere other than its text. Such URLs are now kept as text, as other unusual addresses already were. Found by the randomized round-trip tests.
