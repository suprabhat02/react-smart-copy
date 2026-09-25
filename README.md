# react-smart-copy

[![npm](https://img.shields.io/npm/v/react-smart-copy)](https://www.npmjs.com/package/react-smart-copy)
[![npm downloads](https://img.shields.io/npm/dm/react-smart-copy)](https://www.npmjs.com/package/react-smart-copy)
[![CI](https://github.com/suprabhat02/react-smart-copy/actions/workflows/ci.yml/badge.svg)](https://github.com/suprabhat02/react-smart-copy/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**[Live demo and docs](https://suprabhat02.github.io/react-smart-copy/)**

Headless, type-safe **copy interactions** for React. Not just a clipboard call: the
whole interaction around it — copying, copied, failed, retry — with honest errors,
hover/focus/touch reveal, and screen-reader announcements built in.

```
Email   shubh@example.com   [Copy]      →   Copied ✓
Phone   +91 98xxx xxxxx     [Copy]
ID      PLT-29018           [Copy]
```

- **~2.9 kB** for `useCopy`, **~4.7 kB** for everything (min + brotli), zero dependencies
- Text, rich HTML (with plain-text fallback), PNG images, JSON, multi-format
- Every failure is a typed, classified error. Nothing silently no-ops
- Unstyled. Works with Tailwind, CSS modules, CSS-in-JS, shadcn, MUI, Ant Design
- SSR / Next.js App Router safe, React 18 and 19, StrictMode-proof

## What it can and cannot copy

This package only promises what browsers actually support.

| Content                          | Supported             | Notes                                                                                                                                       |
| -------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Plain text                       | ✅                    | Everywhere with the async Clipboard API                                                                                                     |
| Rich HTML                        | ✅                    | Always paired with a required plain-text fallback. Degrades to text when `ClipboardItem` is missing                                         |
| Images                           | ✅ PNG only           | `image/png` is the only format with reliable cross-browser write support. Convert with `canvas.toBlob(cb, 'image/png')`                     |
| JSON                             | ✅                    | Serialised to text. JSON is not a native clipboard format                                                                                   |
| Several formats at once          | ✅                    | `kind: 'multi'`; each MIME type is checked with `ClipboardItem.supports()` first                                                            |
| A section of your UI as an image | ⚠️ Bring a rasteriser | Browsers have no "screenshot this element" API. Pass a function that renders to a PNG Blob (e.g. with `modern-screenshot` or `html2canvas`) |
| Files (PDF, DOCX, ZIP)           | ❌                    | Not writable to the system clipboard by any browser API                                                                                     |
| Anything over plain HTTP         | ❌                    | The Clipboard API requires HTTPS or `localhost`. You get an `insecure-context` error, not a silent failure                                  |

## Install

```bash
npm install react-smart-copy
```

## Quick start

```tsx
import { CopyField } from "react-smart-copy";

export function ContactRow() {
  return (
    <CopyField.Root
      value="shubh@example.com"
      label="Email"
      className="group flex items-center gap-3"
    >
      <CopyField.Label className="w-20 text-sm text-gray-500" />
      <CopyField.Value className="font-mono" />
      <CopyField.Trigger className="opacity-0 transition-opacity group-data-[revealed]:opacity-100 focus-visible:opacity-100 motion-reduce:transition-none">
        {({ displayStatus }) =>
          displayStatus === "copied"
            ? "Copied ✓"
            : displayStatus === "error"
              ? "Retry"
              : "Copy"
        }
      </CopyField.Trigger>
    </CopyField.Root>
  );
}
```

That one component gives you: a real `<button type="button">` named "Copy Email", reveal on
mouse hover, keyboard focus and touch (always visible on devices that can't hover), a
polite "Copied to clipboard" announcement for screen readers, ignored double-clicks, and
automatic return to idle after 2 seconds.

## No flicker

A text copy takes 1–5 ms, so rendering the raw state flashes "Copying…" for one frame and
resizes the button. Two statuses solve this:

- `status` / `data-state`: the real, instantaneous state. Use it for logic and tests.
- `displayStatus` / `data-display-state`: what to render. "Copying…" only appears when a
  copy takes longer than `pendingDelayMs` (150 ms), then stays at least `minPendingMs`
  (400 ms) so it can't blink.

The default trigger label also stacks every state in one grid cell, so its width never
changes, and crossfades between them (off under `prefers-reduced-motion`).

```tsx
<CopyField.Root
  value={big}
  label="Report"
  pendingDelayMs={200}
  minPendingMs={500}
>
  …
</CopyField.Root>;

// With the bare hook:
const { status } = useCopy();
const shown = useDisplayStatus(status);
```

## Just the hook

```tsx
import { useCopy } from "react-smart-copy";

function InvoiceNumber({ id }: { id: string }) {
  const { copy, status, error } = useCopy({ resetAfterMs: 1500 });

  return (
    <button type="button" onClick={() => void copy(id)} data-state={status}>
      {status === "copied" ? "Copied" : "Copy"}
      {error && <span role="alert">{error.type}</span>}
    </button>
  );
}
```

`copy()` never rejects. It resolves to a `CopyOutcome` you can branch on:

```ts
const outcome = await copy(id);
if (outcome.status === "error") track("copy_failed", outcome.error.type);
```

## Payloads

A bare string is shorthand for text. Everything else is a discriminated union, so the
compiler stops you from, say, copying HTML without a plain-text fallback.

```ts
copy("PLT-29018");
copy({
  kind: "html",
  html: "<b>INV-29018</b> · ₹12,400",
  text: "INV-29018 · ₹12,400",
});
copy({ kind: "json", value: row, pretty: true });
copy({ kind: "image", blob: () => chartToPngBlob() });
copy({
  kind: "multi",
  items: [
    { mimeType: "text/plain", data: "INV-29018" },
    { mimeType: "text/html", data: "<b>INV-29018</b>" },
  ],
});
copy(() => editor.getValue()); // resolved at click time, always the latest value
```

### Copying an image, including a piece of your UI

Pass a **function** that produces the Blob. It is called synchronously inside the click,
and its promise is handed straight to `ClipboardItem`, which is what Safari needs to allow
asynchronous image generation.

```tsx
import { domToBlob } from "modern-screenshot"; // your choice of rasteriser

<CopyField.Root
  label="Invoice preview"
  value={{
    kind: "image",
    blob: () => domToBlob(ref.current!, { type: "image/png" }),
  }}
>
  <CopyField.Trigger>Copy as image</CopyField.Trigger>
</CopyField.Root>;
```

Rasterisers have real limits (cross-origin images taint the canvas, web fonts must be
loaded, `<video>` and `<iframe>` rarely render). When one fails you get a
`blob-generation-failed` error, so you can offer a text fallback instead.

## States

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
| any                                | `reset()`      | `idle`; an in-flight result is discarded               |
| any                                | unmount        | timers cleared; in-flight result and callbacks dropped |

## Errors

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
| `unknown`                | Anything unclassified                                                           | Yes       |

`error.message` is for developers. For users, call `describeCopyError(error)` or map
`error.type` through your own translations.

## Options

```ts
useCopy({
  resetAfterMs: 2000, // false or Infinity keeps "copied" until the next action
  maxRetries: 3,
  onCopy: (payload) => {}, // inline functions are fine; the latest one is always used
  onError: (error, payload) => {},
  adapter: myAdapter, // swap the clipboard backend (tests, Electron, native bridges)
});
```

## CopyField API

| Part                | Renders                | Notes                                                                                                                                             |
| ------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CopyField.Root`    | `div`                  | Props: `value`, `label`, `copyOptions`, `messages`, `alwaysVisible`, `announce`, `pendingDelayMs`, `minPendingMs`. Forwards ref and all div props |
| `CopyField.Label`   | `span`                 | Defaults to `label`                                                                                                                               |
| `CopyField.Value`   | `span`                 | Defaults to the text value; pass children for anything else                                                                                       |
| `CopyField.Trigger` | `button type="button"` | Children can be a node or `({ status, displayStatus, state, revealed, canRetry }) => node`                                                        |
| `useCopyField()`    | —                      | Full context, for building your own parts                                                                                                         |

Styling hooks on Root and Trigger: `data-display-state="idle | copying | copied | error"`
(style with this one), `data-state` (the raw state), and `data-revealed` while the trigger
should be visible.

### Translations

```tsx
<CopyField.Root
  label="ईमेल"
  value={email}
  messages={{
    copied: "कॉपी हो गया",
    error: (e) => t(`copy.errors.${e.type}`),
    triggerLabel: (label) => `${label} कॉपी करें`,
  }}
/>
```

## Accessibility

- The trigger is always a real button, reachable with Tab and activated with Enter or Space.
- Hidden actions stay in the DOM and the tab order. Hide them with opacity keyed off
  `data-revealed`, never `display: none`, or keyboard users can't reach them.
- Keyboard focus (`:focus-visible`) pins the reveal; a mouse click doesn't.
- The trigger is never `disabled` while copying, because disabling a focused button
  throws keyboard focus back to the page.
- A live region is mounted before its first message, so the first announcement is not missed.
- The trigger's accessible name stays stable ("Copy Email"); the result is announced
  separately, so screen readers don't re-read the button.
- Motion is yours to add; respect `prefers-reduced-motion` in your CSS.

## Next.js and SSR

The React entry ships with `"use client"`, so import it directly from Server Components.
Nothing touches `window` during render: the server and the first client render are both
`idle` and not revealed, so there are no hydration mismatches.

`react-smart-copy/core` is framework-agnostic and safe to import anywhere.

## Without React

```ts
import { createCopyMachine } from "react-smart-copy/core";

const machine = createCopyMachine({ resetAfterMs: 1500 });
machine.subscribe(() => render(machine.getSnapshot()));
button.addEventListener("click", () => void machine.copy(input.value));
```

## Custom adapters

```ts
import {
  CopyFailure,
  createCopyError,
  type ClipboardAdapter,
} from "react-smart-copy/core";

const electronAdapter: ClipboardAdapter = {
  write: async (payload) => {
    if (payload.kind !== "text")
      throw new CopyFailure(createCopyError("unsupported-format", "Text only"));
    window.electron.clipboard.writeText(payload.value);
  },
};
```

Start the platform write before any `await`, or browsers drop the user gesture.

## Browser support

Plain text works wherever `navigator.clipboard.writeText` exists: Chromium 66+, Firefox 63+,
Safari 13.1+. Rich HTML, PNG images and multi-format need `ClipboardItem`: Chromium 86+,
Safari 13.1+, Firefox 127+. Check MDN for embedded webviews. Where a capability is missing
you get a typed error, never a silent success.

## Roadmap

- **0.2** `usePaste` (text and pasted OS screenshots) and an optional DOM-capture adapter
- **0.3** Coordinated state across many fields (only one shows "Copied" at a time)
- **1.0** Frozen API, full external accessibility audit

## Development

```bash
npm install
npm run verify      # lint, types, 90 tests, build, publint + attw, size budgets
npm run changeset   # describe your change for the changelog
npm run site:preview  # docs site at http://localhost:3000
```

Releases are automated: merging the "chore: release" PR publishes to npm through
trusted publishing with provenance. No long-lived npm token is stored in the repo.

## License

MIT
