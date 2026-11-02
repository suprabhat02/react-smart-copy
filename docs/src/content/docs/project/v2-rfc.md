---
title: "Toward 2.0 (proposal)"
description: "Changes that would break 1.x code and are being collected for a future major version. A proposal for feedback: nothing here is scheduled."
---

Version 1.x keeps its promises: nothing here changes until a 2.0, and there is **no date** for
one. This page collects the inconsistencies that cannot be fixed without breaking code, so that
if a major version happens, it fixes them once and all together. If one of them costs you
something now, or the fix would cost you more, [open an issue](https://github.com/suprabhat02/react-smart-copy/issues).

## Proposed

### One vocabulary for paste handlers

Today the handlers return a `boolean` or one of three different sets of words (see
[API conventions](/react-smart-copy/project/api-conventions/)). The proposal is one type for all
of them:

```ts
type PasteOutcome = 'handled' | 'rejected' | 'ignored';
```

- `'handled'`: the paste was used. The browser's own paste does not run.
- `'rejected'`: the paste was meant for the handler and turned away (a number that was not a
  number, a paste blocked for a secret). The browser's paste does not run.
- `'ignored'`: not the handler's business (today's `false`, `'ignored'` and `'clean'`). The browser's paste runs.

What a module can say beyond that (`redacted`, the parsed list) moves to its callbacks, which
every handler already has.

**Cost:** any code that tests a handler's `boolean` or compares an outcome string must change.
**Open question:** whether `pasteWithoutSecrets` can report `'redacted'` and `'blocked'` through
`onSecrets` alone.

### One name shape

`pasteAddresses` would become `pasteAsAddresses`, matching `pasteAsNumber` and the others.
`pasteWithoutSecrets` describes what it does and would keep its name.

### Limits named alike

`maxInputBytes` and `maxInputPixels` (`image`) limit what goes in, while `maxBytes` and `maxPixels`
limit what comes out in `files` and `capture`. The proposal is to say which in every name or in
none, and to settle it module by module with the people who use each.

### Remove the deprecated aliases

`NUMBER_MAX_LENGTH`, `ADDRESS_LIST_MAX_LENGTH` and `OTP_SCAN_LENGTH` go.

## Not proposed

- New modules: 2.0 is about making the existing ones consistent.
- Dropping support for any browser or React version beyond what the support policy already says.
