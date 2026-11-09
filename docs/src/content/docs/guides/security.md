---
title: "Security"
description: "Clipboard content is untrusted input: how it is handled, and how to verify a release."
---

Clipboard content is untrusted input, and this package treats it that way: pasted HTML
is parsed inertly, URLs are scheme-checked, hidden characters are reported, and image
metadata is verified as removed. Report vulnerabilities privately as described in
[SECURITY.md](https://github.com/suprabhat02/react-smart-copy/blob/main/SECURITY.md). Releases carry npm provenance (`npm audit signatures`
verifies them), and CodeQL and the OpenSSF Scorecard run on every change. Each GitHub release
(from 1.15.0 on) also holds the exact tarball npm serves, with a Sigstore attestation that it was
built by this repository's release workflow:

```bash
v=$(npm view react-smart-copy version)
gh release download "v$v" -R suprabhat02/react-smart-copy -p '*.tgz'
gh attestation verify "react-smart-copy-$v.tgz" -R suprabhat02/react-smart-copy
```

## What is safe to render

Pasted content comes from another app, so what you may insert into the page depends on which
result you hold:

| What you have | Insert as HTML? |
| --- | --- |
| `pasteToRich(...).html`, `prepareRich(...).html` | Yes. It is rebuilt from an allowlist: scripts, event handlers, `javascript:` links and unsafe images are gone, and `removed` lists what was taken out. Sanitise again if you change it before inserting it. |
| `usePaste`'s `result.html`, `clipboardData.getData("text/html")` | **No.** It is exactly what the other app wrote. Pass it through `pasteToRich`, or a sanitiser such as DOMPurify, first. |
| `pasteToMarkdown(...).markdown` | It is text. Markup in the source text is escaped (`\<img ...>`), but render it with your Markdown renderer's raw HTML turned off, which is the default in markdown-it and react-markdown. |
| Table cells, code, numbers, addresses, one-time codes | Plain strings. Render them as text, as React does by default. |
| `readLink(...)` | Only `https:`, `http:`, `mailto:` and `tel:` links come back (change it with `protocols`); anything else is `null`. |

These rules are tested on hostile input in `test/docs-snippets.test.tsx`.

