# react-smart-copy

[![npm](https://img.shields.io/npm/v/react-smart-copy)](https://www.npmjs.com/package/react-smart-copy)
[![npm downloads](https://img.shields.io/npm/dm/react-smart-copy)](https://www.npmjs.com/package/react-smart-copy)
[![CI](https://github.com/suprabhat02/react-smart-copy/actions/workflows/ci.yml/badge.svg)](https://github.com/suprabhat02/react-smart-copy/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![React 18+](https://img.shields.io/badge/React-18%2B-61dafb)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)](https://www.typescriptlang.org)

**[Live demo and docs](https://suprabhat02.github.io/react-smart-copy/)**

Headless, type-safe **clipboard interactions** for React. Not just a clipboard call: the
whole interaction around it — copying, copied, failed, retry, pasting — with honest errors,
hover/focus/touch reveal, and screen-reader announcements built in.

```
Email   shubh@example.com   [Copy]      →   Copied ✓
Phone   +91 98xxx xxxxx     [Copy]
ID      PLT-29018           [Copy]
```

- **~3.2 kB** for `useCopy`, **~5.4 kB** for everything copy (min + brotli), zero runtime dependencies
- Copy text, rich HTML (with plain-text fallback), PNG images, JSON, multi-format
- **Paste** text, HTML and screenshots with `usePaste`: a Paste button or Ctrl/⌘+V, no permission prompt for keyboard paste
- **`<CopyGroup>`**: only one row shows "Copied" at a time
- **`react-smart-copy/capture`**: copy an `<svg>` or any piece of your UI as a PNG
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
| SVG (icons, charts, logos)       | ✅ as PNG             | `svgToPngBlob()` from `react-smart-copy/capture` rasterises natively, no dependency. Raw SVG is not a clipboard image format                 |
| A section of your UI as an image | ✅ bring a rasteriser | Browsers have no "screenshot this element" API. `captureElement()` wraps one you choose (e.g. `modern-screenshot`) with limits and checks  |
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
asynchronous image generation. The `react-smart-copy/capture` entry does this for you.

## Copying SVG and UI as images

`react-smart-copy/capture` is a separate, opt-in entry (~3.3 kB, no dependencies). It never
ships in your bundle unless you import it.

```tsx
import { captureImage, svgToPngBlob } from "react-smart-copy/capture";
import { domToBlob } from "modern-screenshot"; // any rasteriser you like, for HTML

// Any <svg> (chart, logo, icon): rasterised natively, no rasteriser needed.
<CopyField.Root label="Chart" value={captureImage(() => chartRef.current)}>
  <CopyField.Trigger>Copy chart</CopyField.Trigger>
</CopyField.Root>;

// Any HTML element (invoice card, receipt): bring the rasteriser.
<CopyField.Root
  label="Invoice"
  value={captureImage(() => invoiceRef.current, {
    rasterize: (node, { scale }) => domToBlob(node, { scale }),
    background: "#ffffff",
  })}
>
  <CopyField.Trigger>Copy as image</CopyField.Trigger>
</CopyField.Root>;

// Or by hand, e.g. from SVG markup:
const png = await svgToPngBlob('<svg viewBox="0 0 24 24">…</svg>', { width: 256 });
```

What you get beyond calling a rasteriser yourself:

- **Always a real PNG.** Output is verified from its bytes; JPEG/WebP/canvas/data-URL outputs are re-encoded, anything else is refused
- **Size limits.** `maxPixels` (default 4096 × 4096, Safari's canvas limit) is checked _before_ rendering and again on the output; SVG markup is capped at `maxLength`
- **Deadlines.** `timeoutMs` (default 15 s) and an optional `signal: AbortSignal`; the rasteriser receives a signal it can honour
- **Safe SVG handling.** SVG is decoded as an image, where browsers disable scripts and external loads, and it is never inserted into your page. Network URLs from a rasteriser are never fetched
- **Crisp by default.** `scale: 2`; pass `window.devicePixelRatio` or anything up to 10

Failures are classified like everything else: `invalid-payload` (no element / unknown size),
`unsupported`, `too-large`, `timeout`, `aborted`, `blob-generation-failed`. Rasterisers have
real limits (cross-origin images taint the canvas, web fonts must be loaded, `<video>` and
`<iframe>` rarely render), so offer a text fallback when capture fails.

## Only one "Copied" at a time

Wrap a table or list in `<CopyGroup>`. A new successful copy returns the previously copied
row to idle, because the clipboard no longer holds its value. A failed copy releases nothing.

```tsx
import { CopyField, CopyGroup } from "react-smart-copy";

<CopyGroup>
  {rows.map((row) => (
    <CopyField.Root key={row.id} value={row.email} label="Email">
      <CopyField.Value />
      <CopyField.Trigger />
    </CopyField.Root>
  ))}
</CopyGroup>;
```

It works for `useCopy()` too. Opt one field out with `copyOptions={{ coordinator: null }}`.
To share one group across React roots or with vanilla code, create it yourself:
`const coordinator = createCopyCoordinator()`, then `<CopyGroup coordinator={coordinator}>`
and `createCopyMachine({ coordinator })`.

## Pasting

`usePaste` is the other half: read what the user pasted, with the same honest states.

```tsx
import { describePasteError, usePaste } from "react-smart-copy";

function AvatarDrop() {
  const { paste, state, targetProps, dropTargetProps, isDragOver } = usePaste<HTMLDivElement>({
    accept: ["image"],
    onPaste: (result) => {
      const [image] = result.images;
      if (image) void upload(image);
    },
  });

  return (
    <div {...targetProps} {...dropTargetProps} tabIndex={0} data-over={isDragOver || undefined}>
      Drop an image, press Ctrl/⌘+V to paste a screenshot, or
      <button onClick={() => void paste()}>Paste from clipboard</button>
      {state.status === "error" && <p role="alert">{describePasteError(state.error, state.source)}</p>}
    </div>
  );
}
```

Three ways in, one state machine:

| Path | How | Permission prompt |
| ---- | --- | ----------------- |
| Keyboard paste | Spread `targetProps` on an element, or `listenOnDocument: true` for the whole page | **None**: the data is in the event |
| Drag and drop | Spread `dropTargetProps` on one element | **None**: the data is in the event |
| Paste button | Call `paste()` from a click | Browser may ask the user once |

Paste events without accepted content are left alone, so normal typing and pasting into your
inputs keeps working. Paste events with accepted content are `preventDefault()`-ed (opt out with
`preventDefault: false`).

**Drops** go through the same `accept`, limits and image checks, with `result.source === "drop"`.
While dragging, browsers only reveal the kinds and types of what is dragged, so `canAcceptDrag`
decides from those: accepted drags get the copy cursor (or the effect the drag source allows) and
`isDragOver`, which stays steady as the pointer crosses child elements. Other drags are cancelled
with `dropEffect: "none"`, so a rejected file is never opened by the browser in place of your page.
A file whose type the browser hides until the drop (Safari does this) counts as a maybe and is
checked when it lands. Drags aimed at an `<input>`, `<textarea>` or editable region inside the
target keep their native behaviour, and drops are separate from `targetProps`, so a textarea that
only spreads `targetProps` keeps its native text drop. Drop failures can't be retried (`retry()`
returns `not-retryable`); pass `state.source` to `describePasteError` to word them as drops.

**Result.** `result.text`, `result.html`, `result.images` (verified raster images),
`result.files` (files copied in the OS file manager), `result.imageFiles` (the files that are
verified images, with their names kept, ready for `FormData`), and `result.items` with everything.

```ts
onPaste: ({ imageFiles }) => {
  const form = new FormData();
  for (const file of imageFiles) form.append("attachments", file, file.name);
  void fetch("/api/attachments", { method: "POST", body: form });
};
```

A screenshot read with the paste button arrives as an unnamed `Blob` in `images` only; files
pasted from the OS file manager arrive in `files`, and the verified ones also in `imageFiles`.
Custom adapters resolve without `imageFiles` (`PasteReadResult`); the machine derives it.

**Security.** Everything pasted is untrusted input, and the defaults are strict:

- `accept` defaults to `['text']`. Ask for `'html'`, `'image'`, exact types like `'application/pdf'`, or `'image/*'` explicitly
- Images are verified from their bytes (PNG, JPEG, GIF, WebP, AVIF, BMP); a "PNG" that isn't one is dropped
- SVG is never matched by a wildcard, it must be listed exactly as `'image/svg+xml'` (it is scriptable XML)
- `maxBytes` (default 32 MiB) and `maxItems` (default 32) are enforced before anything is decoded.
  `maxBytes` counts UTF-8 bytes on every path, so `'日本'` costs 6 bytes whether it arrives
  from a paste event, `readText()` or `read()`
- **Never render `result.html` without a sanitiser** such as DOMPurify

States: `idle` → `reading` → `read` | `error`. `paste()` is ignored while reading; a keyboard
paste or a drop supersedes an in-flight read. Results persist until `reset()` unless you set `resetAfterMs`.

**Retry.** After a retryable failure of the Paste button (permission denied, page not focused),
`retry()` reads the clipboard again, up to `maxRetries` (default 3), and `canRetry` tells you
whether it can help. Call it from a click, like `paste()`. Keyboard-paste failures can't be
retried: the event's data is gone once it has been handled, so ask the user to paste again.

```tsx
const { paste, retry, canRetry, error } = usePaste({ accept: ["image"] });
// ...
{error && (canRetry
  ? <button onClick={() => void retry()}>Allow clipboard access and try again</button>
  : <p role="alert">{describePasteError(error)}</p>)}
```

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
| any                                | `reset()`      | `idle`; in-flight work is aborted and its result discarded |
| any                                | unmount        | timers cleared; in-flight work aborted, its result and callbacks dropped |

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
| `no-content`             | Paste: nothing on the clipboard matches `accept`                                | No        |
| `too-large`              | Over `maxBytes`, `maxItems`, `maxPixels` or `maxLength`                         | No        |
| `timeout`                | Capture did not finish within `timeoutMs`                                       | Yes       |
| `aborted`                | Your `AbortSignal` fired, or the operation was reset, superseded or unmounted   | No        |
| `unknown`                | Anything unclassified                                                           | Yes       |

`error.message` is for developers. For users, call `describeCopyError(error)` /
`describePasteError(error)` or map `error.type` through your own translations.

## Options

```ts
useCopy({
  resetAfterMs: 2000, // false or Infinity keeps "copied" until the next action
  maxRetries: 3,
  onCopy: (payload) => {}, // inline functions are fine; the latest one is always used
  onError: (error, payload) => {},
  onReset: () => {}, // reset() left a non-idle state (not the automatic reset)
  onCancel: (reason) => {}, // "reset" | "disconnect": a copy in flight was cancelled
  adapter: myAdapter, // swap the clipboard backend (tests, Electron, native bridges)
  coordinator: null, // opt out of the surrounding <CopyGroup>
});
```

## Cancellation

Every copy and paste gets an `AbortSignal`. It fires when the operation is superseded, when you
call `reset()`, or when the component unmounts. The state machine already ignores late results;
the signal lets the *work* stop too, so a slow screenshot or a large clipboard decode doesn't keep
running (and holding memory) after nobody needs it.

- **Image sources** receive it: `copy({ kind: "image", blob: (context) => render(context?.signal) })`
- **`captureSource` / `captureImage`** wire it up for you, combined with any `signal` you pass
- **Custom adapters** receive it as their last argument: `write(payload, { signal })`, `read(options, { signal })`

The signal never fires after an operation has finished. If a cancelled operation fails anyway,
the promise you awaited resolves `{ status: "ignored", reason: "cancelled" }` rather than an
error, and `onError` is not called, so you never toast a failure for work the user walked away
from. Adapters and sources written before 1.2 keep working: the argument is optional.

To observe cancellations (for analytics, or to clean up your own work), pass `onCancel`. It
receives why the operation stopped: `"reset"`, `"disconnect"` (the component unmounted) or, for
paste only, `"superseded"` (a paste event replaced a Clipboard API read). It fires once per
cancelled operation and never for one the library has already settled, so React Strict Mode's
extra mount/unmount does not trigger it. (If the clipboard resolves in the same tick as the
cancellation, the awaited promise may still report the result; state is not updated.) When
`reset()` cancels work, `onCancel("reset")` runs first, then `onReset()`.

```ts
usePaste({
  onCancel: (reason) => analytics.track("paste_cancelled", { reason }),
  onReset: () => setDraft(""),
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

## PasteField

The paste-side companion to `CopyField`. Drop it wherever you need a labelled, accessible paste target — a Zone that accepts keyboard paste and drop, a Trigger button that calls the Clipboard API, and a Status indicator that reflects the current state.

```tsx
import { PasteField } from "react-smart-copy";

export function NotesPasteField() {
  return (
    <PasteField.Root
      label="Notes"
      pasteOptions={{ accept: ["text", "image"], onPaste: (result) => setNotes(result.text ?? "") }}
    >
      <PasteField.Label />
      <PasteField.Status />   {/* "Ready" → "Reading…" → "Pasted" → "Error" */}
      <PasteField.Zone />     {/* focusable paste target; accepts Ctrl/⌘+V and drops */}
      <PasteField.Trigger />  {/* "Paste" → "Pasting…" → "Pasted" → "Retry" */}
      <PasteField.Preview placeholder="Nothing pasted yet" /> {/* text, thumbnails, file names */}
    </PasteField.Root>
  );
}
```

| Part                 | Renders                | Notes                                                                                                                                  |
| -------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `PasteField.Root`    | `div`                  | Props: `label`, `pasteOptions`, `messages`, `alwaysVisible`, `announce`, `pendingDelayMs`, `minPendingMs`. Forwards ref and all div props |
| `PasteField.Label`   | `span`                 | Defaults to `label`                                                                                                                    |
| `PasteField.Status`  | `span`                 | Text label per status. Defaults: `idle → "Ready"`, `reading → "Reading…"`, `read → "Pasted"`, `error → "Error"`. Custom `labels` prop |
| `PasteField.Zone`    | `div role="region"`    | Focusable paste target (`tabIndex=0`); handles Ctrl/⌘+V itself. Named "Paste area for {label}" via `aria-label` (override with `aria-label`, `aria-labelledby` or `messages.zoneLabel`). Sets `aria-keyshortcuts="Control+V Meta+V"`. `focusable={false}` removes tabIndex. Accepts drag-and-drop and sets `data-drag-over` while an accepted drag is over it; `droppable={false}` turns drops off. Announces `messages.dropped`, or your own `pasted` message if you only translated that one. Your own `onDrag*` / `onDrop` handlers run first, and calling `preventDefault()` in one takes over |
| `PasteField.Trigger` | `button type="button"` | Children can be a node or `({ status, displayStatus, state, revealed, canRetry }) => node`. `aria-busy` while reading; never `disabled`, so focus stays put |
| `PasteField.Preview` | `div`                  | What was pasted: text (truncated at `maxTextLength`, default 2000), image thumbnails (`imageAlt` for alt text) and non-image file names. **Never renders pasted HTML.** Shows `placeholder` until there is a result. Object URLs are revoked on change and unmount. Pass `({ result, imageUrls }) => node` to render it yourself |
| `usePasteField()`    | —                      | Full context, for building your own parts inside `PasteField.Root`                                                                     |

Styling hooks on Root, Zone and Trigger: `data-display-state="idle | reading | read | error"`
(style with this one), `data-state` (the raw state), and `data-revealed` while the trigger should be visible.
The Zone also has `data-drag-over`:

```css
[data-zone][data-drag-over] { outline: 2px dashed currentColor; }
```

### PasteField messages

```tsx
<PasteField.Root
  label="Resume"
  messages={{
    pasted: (result) => `Got ${result.text?.length ?? 0} characters`,
    dropped: (result) => `Added ${result.files.length} dropped files`,
    error: (e, source) => t(`${source === "drop" ? "drop" : "paste"}.errors.${e.type}`),
    triggerLabel: (label) => `Paste ${label}`,
    zoneLabel: (label) => `Drop zone for ${label}`,
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
- The default trigger's crossfade animation is disabled when `prefers-reduced-motion` is set. Respect it in your own CSS too.

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

Paste and drop work the same way with `createPasteMachine`:

```ts
import { canAcceptDrag, createPasteMachine, resolvePasteReadOptions } from "react-smart-copy/core";

const options = { accept: ["image"] } as const;
const paster = createPasteMachine(options);
zone.addEventListener("paste", (event) => void paster.pasteEvent(event));
zone.addEventListener("dragover", (event) => {
  if (!event.dataTransfer) return;
  event.preventDefault(); // claim it, then cancel drops you don't accept
  event.dataTransfer.dropEffect = canAcceptDrag(event.dataTransfer, resolvePasteReadOptions(options)) ? "copy" : "none";
});
zone.addEventListener("drop", (event) => void paster.dropEvent(event));
```

## Testing

`react-smart-copy/testing` ships utilities that keep consumer test suites
green across library upgrades. Every `PasteResult` field added in v1.3 and
v1.4 required updating hand-written result literals — these helpers absorb
future additions at the library level.

### `createPasteResult(init?)`

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

### `createMockPasteAdapter()`

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

### `createMockClipboardAdapter()`

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

## Custom adapters

```ts
import {
  CopyFailure,
  createCopyError,
  type ClipboardAdapter,
} from "react-smart-copy/core";

const electronAdapter: ClipboardAdapter = {
  write: async (payload, context) => {
    if (payload.kind !== "text")
      throw new CopyFailure(createCopyError("unsupported-format", "Text only"));
    window.electron.clipboard.writeText(payload.value);
    // context?.signal aborts on reset / unmount: check it before any slow follow-up work.
  },
};
```

Start the platform write before any `await`, or browsers drop the user gesture.

## Browser support

Plain text works wherever `navigator.clipboard.writeText` exists: Chromium 66+, Firefox 63+,
Safari 13.1+. Rich HTML, PNG images and multi-format need `ClipboardItem`: Chromium 86+,
Safari 13.1+, Firefox 127+. Keyboard paste (`targetProps`, `listenOnDocument`) and drag-and-drop
(`dropTargetProps`, `PasteField.Zone`) work in every modern browser. The Paste button needs `navigator.clipboard.readText` (Chromium 66+, Safari 13.1+,
Firefox 125+) or `read()` for images (Chromium 86+, Safari 13.1+, Firefox 127+). Check MDN for
embedded webviews. Where a capability is missing you get a typed error, never a silent success.

## Roadmap

- ~~**0.2** `usePaste`, `<CopyGroup>`, SVG/DOM capture~~ shipped
- ~~**1.0** Frozen API, SSR / security / accessibility audit~~ shipped
- ~~**1.1** `PasteField`~~ shipped
- ~~**1.2** Paste `retry()`, cancellation with `AbortSignal`, `PasteField.Preview`~~ shipped
- ~~**1.3** `onReset` / `onCancel` callbacks, UTF-8 `maxBytes` on every paste path, `PasteResult.imageFiles`~~ shipped
- ~~**1.4** Drag-and-drop through the paste pipeline: `dropTargetProps`, `isDragOver`, droppable `PasteField.Zone`~~ shipped
- ~~**1.5** `react-smart-copy/testing` — mock adapters and result builders so consumer tests stay green across releases~~ shipped

Full history: [CHANGELOG.md](./CHANGELOG.md) or the [Releases page](https://suprabhat02.github.io/react-smart-copy/#releases).

## Development

```bash
npm install
npm run verify      # lint, types, 495 tests at 100% coverage, build, publint + attw, size budgets
npm run changeset   # describe your change for the changelog
npm run site:preview  # docs site at http://localhost:3000
```

Releases are automated: merging the "chore: release" PR publishes to npm through
trusted publishing with provenance. No long-lived npm token is stored in the repo.

## License

MIT
