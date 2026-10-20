---
title: "Errors"
description: "Every failure is a typed, classified error: the types, what causes them and what to show."
---

Every failure, copy or paste, comes back as an error with a `type` you can switch on. Nothing fails silently.

| `error.type`             | Meaning                                                                         | Retryable |
| ------------------------ | ------------------------------------------------------------------------------- | --------- |
| `unsupported`            | No Clipboard API (old browser, server, locked webview)                          | No        |
| `insecure-context`       | Not HTTPS / localhost                                                           | No        |
| `permission-denied`      | Blocked by browser or user. Safari also reports a missing user gesture this way | Yes       |
| `not-focused`            | Document lost focus mid-copy                                                    | Yes       |
| `invalid-payload`        | Empty or malformed input, or a source function that threw                       | No        |
| `unsupported-format`     | This browser can't write that MIME type                                         | No        |
| `blob-generation-failed` | Image source threw, rejected or didn't return a Blob                            | Yes       |
| `max-retries-exceeded`   | `retry()` after `maxRetries`                                                    | No        |
| `no-content`             | Paste: nothing on the clipboard matches `accept`                                | No        |
| `too-large`              | Over `maxBytes`, `maxItems`, `maxPixels` or `maxLength`                         | No        |
| `timeout`                | Capture did not finish within `timeoutMs`                                       | Yes       |
| `aborted`                | Your `AbortSignal` fired, or the operation was reset, superseded or unmounted   | No        |
| `unknown`                | Anything unclassified                                                           | Yes       |

`error.message` is for developers. For users, call `describeCopyError(error)` /
`describePasteError(error)` or map `error.type` through your own translations.
