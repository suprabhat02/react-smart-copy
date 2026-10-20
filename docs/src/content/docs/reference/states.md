---
title: "States"
description: "The states a copy or paste goes through, and what each one means for your UI."
---

Copy and paste each run through a small state machine. These are the states and the data attributes that mirror them.

```ts
type CopyState =
  | { status: "idle" }
  | { status: "copying"; payload: CopyPayload; retryCount: number }
  | { status: "copied"; payload: CopyPayload; at: number }
  | {
      status: "error";
      payload: CopyPayload | null;
      error: CopyError;
      retryCount: number;
    };
```

| From                               | Event          | To                                                     |
| ---------------------------------- | -------------- | ------------------------------------------------------ |
| any except `copying`               | `copy()`       | `copying`                                              |
| `copying`                          | `copy()`       | ignored (no double-fire)                               |
| `copying`                          | write resolves | `copied`, then `idle` after `resetAfterMs`             |
| `copying`                          | write rejects  | `error`                                                |
| `error` (retryable, under the cap) | `retry()`      | `copying` with the same payload, `retryCount + 1`      |
| `error` (cap reached)              | `retry()`      | `error` with `max-retries-exceeded`                    |
| any                                | `reset()`      | `idle`; in-flight work is aborted and its result discarded |
| any                                | unmount        | timers cleared; in-flight work aborted, its result and callbacks dropped |
