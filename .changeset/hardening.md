---
"react-smart-copy": patch
---

Production hardening.

- `extractOtp` is about four times faster on long text: keywords are found once per message instead of once per number. At its 100,000-character limit, hostile input now takes about 15 ms instead of 60 ms. A keyword cut off at the edge of the 60-character window no longer counts as a whole word.
- Every export's type is written out (`isolatedDeclarations`), so the public API never depends on what TypeScript infers. The published declarations are unchanged apart from naming: `CopyField`, `PasteField` and `FILE_TYPES` have the same types, written explicitly.
- The npm page shows the whole README again. npm cuts READMEs at 64 KiB, and it had grown past that. The README is now a 15 kB overview that links to the docs.
- The docs have a new guide, Performance and limits: bundle costs, every parser's input limits, and the linear-time guarantee. Two docs examples that called `useCopyInterceptor` with the wrong arguments are fixed.
