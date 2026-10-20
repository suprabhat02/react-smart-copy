---
title: "Testing"
description: "Mock adapters and result builders that keep your tests green across releases."
---

`react-smart-copy/testing` ships utilities that keep consumer test suites
green across library upgrades. Every `PasteResult` field added in v1.3 and
v1.4 required updating hand-written result literals — these helpers absorb
future additions at the library level.

## `createPasteResult(init?)`

Builds a complete `PasteResult` from partial input. Every field defaults
sensibly, so adding a required field in a future release won't touch your tests.

```ts
import { createPasteResult } from "react-smart-copy/testing";

const result = createPasteResult({ text: "hello" });
// result.source     → 'clipboard'
// result.text       → 'hello'
// result.html       → null
// result.images     → []
// result.files      → []
// result.imageFiles → []
// result.items      → [{ type: 'text/plain', data: 'hello' }]
```

## `createMockPasteAdapter()`

A controllable `PasteAdapter` backed by a result queue. Queue entries
are consumed FIFO; an empty queue rejects with `'no-content'`.

```ts
import { createMockPasteAdapter, createPasteResult } from "react-smart-copy/testing";
import { createPasteMachine } from "react-smart-copy/core";

const mock = createMockPasteAdapter();
mock.queueResult(createPasteResult({ text: "hello" }));
mock.queueError(createCopyError("permission-denied", "blocked"));

const machine = createPasteMachine({ adapter: mock.adapter });
await machine.paste();          // → { status: 'read', result: … }
expect(mock.readCount()).toBe(1);
```

## `createMockClipboardAdapter()`

A controllable `ClipboardAdapter` for copy tests. Captures the last payload
the machine sent so you can assert on it.

```ts
import { createMockClipboardAdapter } from "react-smart-copy/testing";
import { createCopyMachine } from "react-smart-copy/core";

const mock = createMockClipboardAdapter();
mock.queueSuccess();

const machine = createCopyMachine({ adapter: mock.adapter });
await machine.copy("hello");
expect(mock.lastPayload()).toEqual({ kind: "text", value: "hello" });
```

The subpackage also re-exports the types most often needed in test files:
`CopyFailure`, `CopyError`, `PasteResult`, `PasteSource`, `ClipboardAdapter`,
and more — so a single import covers both utilities and type annotations.
