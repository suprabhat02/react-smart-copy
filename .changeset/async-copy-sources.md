---
'react-smart-copy': minor
---

Copy text the server makes after the click. `copy()` (and `CopyField`'s `value`) now accepts an async function, such as one that creates a share link: `copy(async ({ signal }) => (await fetch(url, { signal })).text())`. The write starts during the click with a promise of the text, so it works in Safari, which ends the click at the first `await`; checked in Chromium, Firefox and WebKit. The source receives the copy's `AbortSignal`, so `reset()` or unmounting also cancels the request, and text that arrives after that is never written. It may resolve to text or JSON. A rejected request is an `invalid-payload` error with the thrown value as its `cause`; if the write fails after the text arrived, `retry()` writes it again without asking the server.

Type change: while an async source is still producing its text, `CopyingState.payload` is `null`, so its type is now `CopyPayload | null`. Code that reads `state.payload` during `copying` needs a null check; synchronous sources behave exactly as before. Custom adapters can implement the new optional `writeDeferred(text, context)` to start their write before the text arrives; without it, the machine waits for the text and calls `write`.

`useCopy` grows by about 0.2 kB.
