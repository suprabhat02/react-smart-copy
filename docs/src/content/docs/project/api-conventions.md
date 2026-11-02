---
title: "API conventions"
description: "How names, limits, errors and paste handlers work across every react-smart-copy module, and how the library deprecates things."
---

Eighteen entry points are easier to use when they behave alike. These are the rules each one
follows, where it does not yet, and what is done about that without breaking anyone.

## Names

| Shape | Means | Example |
| --- | --- | --- |
| `parseX(text)` | Reads text into data. `null` when the text is not an X. | `parseNumber`, `parseTable` |
| `pasteToX(source)` | Reads what a paste holds (`html`, `text`, files) into data. | `pasteToMarkdown`, `pasteToCode` |
| `pasteAsX(event)` | A paste handler for an `onPaste` prop. Handles the paste itself. | `pasteAsLink`, `pasteAsNumber` |
| `xPayload(data)` | Data written as something to copy. | `colorPayload`, `numberPayload` |
| `formatX(data)` | Data written as text. | `formatNumber`, `formatAddress` |

## Limits

Every parser caps its input, and every cap can be set.

- The option is called after what it limits: `maxLength` (characters), `maxBytes`, `maxNodes`,
  `maxDepth`, `maxCells`, `maxRows`. Modules whose input is text of any size take `maxLength`
  (`code`, `markdown`, `secrets`, `number`, `email`, `otp`).
- The default is an exported constant named `DEFAULT_<MODULE>_MAX_<THING>`, such as
  `DEFAULT_NUMBER_MAX_LENGTH`.
- A limit is a positive whole number or `Infinity`. Anything else throws a `CopyFailure` of type
  `invalid-payload`, with the option's name in the message. One function checks every limit.
- What happens past the limit is part of each module's contract, and is written on its page:
  **a flag** (`truncated`: `markdown`, `rich`, `email`, `secrets`), **`null`** (`parseNumber`:
  text that long is not a number), or **a typed error** (`too-large`: pasted code, tables,
  `structured` copies). See [Performance and limits](/react-smart-copy/guides/performance/).

## Errors

Failures are `CopyFailure`s with a `type`. Invalid options are `invalid-payload`. Hostile or
malformed input never throws anything else: the corpus tests check this on every capture.

## Paste handlers

A handler calls `preventDefault()` only for pastes it handles, and leaves the rest to the browser
(plain text into a text field, for example). What it returns says what happened:

| Handler | Returns |
| --- | --- |
| `pasteAsCode`, `pasteAsColor`, `pasteAsLink`, `pasteAsMarkdown`, `pasteAsRich` | `boolean`: `true` when it handled the paste |
| `pasteAsNumber` | `'pasted'`, `'rejected'` or `'ignored'` |
| `pasteAddresses` | `'parsed'` or `'ignored'` |
| `pasteWithoutSecrets` | `'clean'`, `'redacted'` or `'blocked'` |

The return types differ because the handlers do different things: some have a third outcome
worth telling apart (a number that was turned away, a secret that was blocked). They do share one
rule: **`false`, `'ignored'` and `'clean'` mean the paste is still the browser's to handle.**
The [2.0 proposal](/react-smart-copy/project/v2-rfc/) would give them one vocabulary.

## Deprecation

A name is never removed in a minor or patch release. When a better name replaces it, the old one
stays as an alias with a `@deprecated` note that names its replacement, and is removed only in
the next major version. In 1.x the aliases are `NUMBER_MAX_LENGTH`, `ADDRESS_LIST_MAX_LENGTH` and
`OTP_SCAN_LENGTH`, now `DEFAULT_NUMBER_MAX_LENGTH`, `DEFAULT_ADDRESS_LIST_MAX_LENGTH` and
`DEFAULT_OTP_MAX_LENGTH`.
