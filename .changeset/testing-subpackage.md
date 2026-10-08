---
"react-smart-copy": minor
---

## `react-smart-copy/testing` — test utilities subpackage

A new **`react-smart-copy/testing`** entry point ships three utilities that
make consumer test suites resilient to future API additions:

### `createPasteResult(init?)`

Builds a complete, self-consistent `PasteResult` from partial input. Every
field has a sensible default (`null`, `[]`, `'clipboard'`), so adding a
required field in a future release will not break existing test code.

```ts
import { createPasteResult } from 'react-smart-copy/testing';

// Builds items, imageFiles, etc. automatically
const result = createPasteResult({ text: 'hello', source: 'clipboard' });
```

When `items` is omitted it is derived from `text`, `html`, and `images`;
`imageFiles` is always computed from the intersection of `images` and `files`,
exactly as the machine does.

### `createMockPasteAdapter()`

Returns a controllable `PasteAdapter` backed by a result queue. Queue entries
are consumed in FIFO order; an empty queue rejects with `'no-content'`.

```ts
import { createMockPasteAdapter, createPasteResult } from 'react-smart-copy/testing';
import { createPasteMachine } from 'react-smart-copy/core';

const mock = createMockPasteAdapter();
mock.queueResult(createPasteResult({ text: 'hello' }));
mock.queueError(createCopyError('permission-denied', 'blocked'));

const machine = createPasteMachine({ adapter: mock.adapter });
await machine.paste();                    // → { status: 'read', result: … }
expect(mock.readCount()).toBe(1);
```

Pass `mock.adapter` as `adapter` in `createPasteMachine` options or in
`usePaste`'s `adapter` prop.

### `createMockClipboardAdapter()`

Returns a controllable `ClipboardAdapter` backed by a success/error queue.
Captures the last payload the machine sent so you can assert on it.

```ts
import { createMockClipboardAdapter } from 'react-smart-copy/testing';
import { createCopyMachine } from 'react-smart-copy/core';

const mock = createMockClipboardAdapter();
mock.queueSuccess();

const machine = createCopyMachine({ adapter: mock.adapter });
await machine.copy('hello');
expect(mock.lastPayload()).toEqual({ kind: 'text', value: 'hello' });
```

### Re-exports

`react-smart-copy/testing` also re-exports the types most often needed in
test files: `CopyFailure`, `CopyError`, `CopyPayload`, `PasteAdapter`,
`PasteReadResult`, `PasteResult`, `PasteSource`, `PasteItem`, and
`ClipboardAdapter`, so a single import path covers both the utilities and
their types.

### Why now?

v1.3.0 added `imageFiles` and v1.4.0 added `source: 'drop'` to `PasteResult`.
Both releases required consumers to update hand-written result literals in their
tests. `createPasteResult` absorbs future additions at the library level so
that upgrading a minor release never touches test code.

### Bundle size

683 B brotli (zero browser globals; works in Node, jsdom, and Deno).
