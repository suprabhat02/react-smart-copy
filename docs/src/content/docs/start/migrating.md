---
title: "Migrating"
description: "Move from react-copy-to-clipboard, copy-to-clipboard, react-use or navigator.clipboard, one button at a time."
---

Every snippet on this page is also a test in the repository (`test/migration.test.tsx`), so it
keeps working as the library changes. Move one button at a time: both libraries can live in the
same app while you do.

## What changes for your users

- **The same pages keep working.** On plain HTTP (an intranet tool at `http://10.0.0.5/`), in
  webviews without `navigator.clipboard`, and in embedded apps such as a Teams tab or a
  SharePoint web part, text, HTML and JSON are copied through the browser's `copy` command, as
  `react-copy-to-clipboard` does. Only images need HTTPS and clipboard access.
- **Failures get a reason.** Instead of `result === false`, you get a typed error such as
  `permission-denied` or `not-focused`, a message you can show, and whether a retry can help.
- **Nothing moves on the page.** No textarea is added, the user's selection and focus are put
  back, and page copy handlers do not rewrite the payload.

## From react-copy-to-clipboard: change the import

`react-smart-copy/compat` has a `CopyToClipboard` with the same props. Change the import and
nothing else:

```diff
- import { CopyToClipboard } from "react-copy-to-clipboard";
+ import { CopyToClipboard } from "react-smart-copy/compat";
```

The default import (`import CopyToClipboard from ...`) works too. Your types still check: the
props are the same, and `onCopy` gets a third argument you can ignore.

What it fixes on the way:

| react-copy-to-clipboard | `react-smart-copy/compat` |
| --- | --- |
| A failed copy opens a `window.prompt` that blocks the page | No prompt: `onCopy(text, false, outcome)`, and `outcome.error.type` says why |
| Copies through a hidden element, so pasted text can bring its styling (the yellow background) | Writes plain text through the Clipboard API |
| `format: "text/html"` writes only HTML: a plain-text field, a terminal or a chat input gets nothing | Writes the HTML and its plain text; a script or style sheet in it is never part of the text |
| A class component, with `prop-types` at run time | A typed function component, tested on React 19 and safe to render on the server |
| `debug`, `message` | Accepted and ignored: nothing is logged, nothing is prompted |

What behaves differently, on purpose:

- **`onCopy` runs when the copy is written, not during the click.** The Clipboard API is
  asynchronous; reporting `true` before it finishes would be a guess. Your child's own
  `onClick` still runs inside the click, so `preventDefault()` there keeps working.
- **It still reports after unmounting.** A menu that closes on click unmounts the button at
  once; its `onCopy` still says the link was copied, so your toast still shows.
- **A second click while the first copy is being written is ignored**: one write, one `onCopy`.
- **Formats other than `text/html`** (the original passed any type straight through) are written
  as plain text, which is what the Clipboard API can write everywhere.
- **A `ref`** reaches the child element (React 19), not a component instance.
- **Empty text**, or a value that is not text, copies nothing and reports `false`.

It works on plain HTTP and in embedded apps, as the original did, and is checked in Chromium,
Firefox and WebKit with a real click.

### Then, at your own pace

Before:

```tsx
import { CopyToClipboard } from "react-copy-to-clipboard";

<CopyToClipboard text={invoiceId} onCopy={(text, result) => setCopied(result)}>
  <button>Copy</button>
</CopyToClipboard>;
```

After, with the component that also handles the "Copied" state, its reset and the
screen-reader announcement:

```tsx
import { CopyField } from "react-smart-copy";

<CopyField.Root value={invoiceId} label="Invoice number">
  <CopyField.Trigger>{({ displayStatus }) => (displayStatus === "copied" ? "Copied" : "Copy")}</CopyField.Trigger>
</CopyField.Root>;
```

Or keep your own button and state, with the hook:

```tsx
import { useCopy } from "react-smart-copy";

function CopyInvoice({ invoiceId }: { invoiceId: string }) {
  const { copy, status } = useCopy();
  return (
    <button type="button" onClick={() => void copy(invoiceId)}>
      {status === "copied" ? "Copied" : "Copy"}
    </button>
  );
}
```

| react-copy-to-clipboard | react-smart-copy |
| --- | --- |
| `text` | `value` on `CopyField.Root`, or the argument of `copy()` |
| `onCopy(text, result)` | `onCopy(payload)` on success, `onError(error)` on failure; or `await copy()` for the outcome |
| `options.format: "text/html"` | `copy({ kind: "html", html, text })`: the HTML and its plain text, both written |
| `options.debug`, `options.message` | Not needed: no prompt is ever shown; failures are typed errors |
| The child element is cloned with an `onClick` | You render a real `<button>`; `CopyField.Trigger` is one |

## From copy-to-clipboard (no React)

Before:

```ts
import copy from "copy-to-clipboard";

const ok = copy(invoiceId);
```

After, with the framework-agnostic core. Call it inside the click handler, as before:

```ts
import { createCopyMachine } from "react-smart-copy/core";

const copier = createCopyMachine();
button.addEventListener("click", async () => {
  const outcome = await copier.copy(invoiceId);
  if (outcome.status === "error") show(outcome.error.message);
});
```

`copy()` never throws or rejects. It resolves to `copied`, `error` (with the typed error) or
`ignored` (a second click while the first copy is still running).

## From react-use's useCopyToClipboard

Before:

```tsx
const [state, copyToClipboard] = useCopyToClipboard();
// state.value, state.error
```

After:

```tsx
const { copy, status, error } = useCopy();
// status: "idle" | "copying" | "copied" | "error"; error.type says why
```

`status` goes back to `idle` on its own after two seconds (`resetAfterMs`), so a "Copied"
label needs no timer of yours.

## From navigator.clipboard.writeText

Before:

```ts
navigator.clipboard.writeText(text).then(
  () => setCopied(true),
  () => setFailed(true), // why? the DOMException does not say in a way users understand
);
```

After:

```tsx
const { copy, status, error } = useCopy();
// copy(text) never rejects; error.type is one of the typed errors,
// and describeCopyError(error) gives a message you can show.
```

What you also get: the plain-HTTP fallback above, ignored double clicks, cancellation when the
component unmounts, and `retry()` for the errors where it can help.

## Then

- Pick the parts you need from the table in the [introduction](/react-smart-copy/start/introduction/#the-parts).
- Testing your own components: [Testing](/react-smart-copy/guides/testing/).
- The errors you can now handle: [Errors](/react-smart-copy/reference/errors/).
