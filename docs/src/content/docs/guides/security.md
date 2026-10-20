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
