# react-smart-copy

[![npm](https://img.shields.io/npm/v/react-smart-copy)](https://www.npmjs.com/package/react-smart-copy)
[![npm downloads](https://img.shields.io/npm/dm/react-smart-copy)](https://www.npmjs.com/package/react-smart-copy)
[![CI](https://github.com/suprabhat02/react-smart-copy/actions/workflows/ci.yml/badge.svg)](https://github.com/suprabhat02/react-smart-copy/actions/workflows/ci.yml)
[![CodeQL](https://github.com/suprabhat02/react-smart-copy/actions/workflows/codeql.yml/badge.svg)](https://github.com/suprabhat02/react-smart-copy/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/suprabhat02/react-smart-copy/badge)](https://scorecard.dev/viewer/?uri=github.com/suprabhat02/react-smart-copy)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![React 18+](https://img.shields.io/badge/React-18%2B-61dafb)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)](https://www.typescriptlang.org)
[![GitHub stars](https://img.shields.io/github/stars/suprabhat02/react-smart-copy?style=social)](https://github.com/suprabhat02/react-smart-copy)

**[Live demo and docs](https://suprabhat02.github.io/react-smart-copy/)**

Headless, type-safe **clipboard interactions** for React. Not just a clipboard call: the
whole interaction around it — copying, copied, failed, retry, pasting — with honest errors,
hover/focus/touch reveal, and screen-reader announcements built in.

```
Email   shubh@example.com   [Copy]      →   Copied ✓
Phone   +91 98xxx xxxxx     [Copy]
ID      PLT-29018           [Copy]
```

- **~3.5 kB** for `useCopy`, **~5.6 kB** for everything copy (min + brotli), zero runtime dependencies
- Copy text, rich HTML (with plain-text fallback), PNG images, JSON, multi-format
- **Paste** text, HTML and screenshots with `usePaste`: a Paste button or Ctrl/⌘+V, no permission prompt for keyboard paste
- **`<CopyGroup>`**: only one row shows "Copied" at a time
- **`useCopyInterceptor`**: control what Ctrl/⌘+C copies from your page — attribution, redaction, Excel-ready tables, no-copy zones
- **`react-smart-copy/table`**: copy rows that paste into Excel and Google Sheets as cells, and read pasted ranges back as typed records. Works with AG Grid, TanStack Table and any `<table>`
- **`react-smart-copy/structured`**: copy your own objects and paste them back as the same typed, validated objects in another tab or app, the way design tools do. Versioned, with migrations, and works with Zod, Valibot or ArkType
- **`react-smart-copy/markdown`**: paste from Google Docs, Word, Notion or any web page into a Markdown field and get clean Markdown, with undo intact: `<textarea onPaste={pasteAsMarkdown} />`
- **`react-smart-copy/code`**: copy code blocks the way developers expect (a terminal session copies as its commands, gutters and prompts stay behind, colours survive in Docs and Slack), paste code cleaned and indented, and catch Trojan Source, invisible identifiers and lookalike letters
- **`react-smart-copy/image`**: get pasted photos and screenshots ready to upload. It removes GPS location, camera data and hidden thumbnails without touching a pixel, and fits size and byte limits, re-encoding only when it has to
- **`react-smart-copy/files`**: take pasted and dropped files and whole folders safely. Types come from each file's content, so a program named `invoice.pdf.exe` or a web page named `report.pdf` is turned away with a reason, names are made safe for every operating system, and limits cap count, size and depth
- **`react-smart-copy/secrets`**: keep API keys, tokens, private keys, passwords, card numbers and IBANs out of pastes and copies. Paste guards for chat boxes and forms, and redaction of what people copy from logs and consoles. Every pattern runs in linear time, and no finding holds the secret
- **`react-smart-copy/otp`** and **`useOtpField`**: one-time code fields that typing, pasting a whole SMS, SMS autofill and WebOTP fill, with an accessible name on every box, and `extractOtp` to read the code in a message while leaving prices, dates, phone numbers and order numbers alone
- **`react-smart-copy/number`**: read the numbers and amounts people paste, in any locale's format (`1.234,50 €`, `$1,234.50`, `(1,234.00)`, lakh grouping, any script's digits), exactly, as a decimal string as well as a `number`. Paste them into number fields with `pasteAsNumber`, and write them back for any locale with `formatNumber`
- **`react-smart-copy/link`**: "Copy link" buttons that paste as a titled link in Slack, Docs and Notion and as the URL in editors, links that scroll to a highlighted passage, tracking parameters removed, and pasting a URL over selected text to make a link
- **`react-smart-copy/rich`**: copy styled content so it pastes as it looks in Gmail, Outlook, Apple Mail, Google Docs, Word, Notion and Slack: sanitized HTML with inline styles, email-safe colours and absolute links, plus readable plain text. Works for buttons and for Ctrl/⌘+C. And the other way: paste from Docs, Word and mail into a rich-text editor (TipTap, Lexical, `contenteditable`) as clean, semantic HTML
- **`react-smart-copy/color`**: copy colours in any CSS format (hex to `oklch()` and Display P3) with a swatch for Docs and Slack, paste any format into a colour field, and check WCAG contrast. Wide-gamut colours are mapped the way CSS specifies, never clipped to a wrong hue
- **`react-smart-copy/share`**: one "Share" button that opens the share sheet on phones and copies a titled link on desktop, with honest states: a closed share sheet is never an error
- **`react-smart-copy/capture`**: copy an `<svg>` or any piece of your UI as a PNG
- Every failure is a typed, classified error. Nothing silently no-ops
- Unstyled. Works with Tailwind, CSS modules, CSS-in-JS, shadcn, MUI, Ant Design
- SSR / Next.js App Router safe, React 18 and 19, StrictMode-proof
- Tested in real browser engines on every change: Chromium, Firefox and WebKit (Safari's engine)

## What it can and cannot copy

This package only promises what browsers actually support.

| Content                          | Supported             | Notes                                                                                                                                       |
| -------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Plain text                       | ✅                    | Everywhere with the async Clipboard API                                                                                                     |
| Rich HTML                        | ✅                    | Always paired with a required plain-text fallback. Degrades to text when `ClipboardItem` is missing                                         |
| Images                           | ✅ PNG only           | `image/png` is the only format with reliable cross-browser write support. Convert with `canvas.toBlob(cb, 'image/png')`                     |
| JSON                             | ✅                    | Serialised to text. JSON is not a native clipboard format                                                                                   |
| Tables (Excel, Sheets, Docs)     | ✅                    | `react-smart-copy/table`: an HTML table plus tab-separated text in one entry. Pasting reads both back                                     |
| Several formats at once          | ✅                    | `kind: 'multi'`; each MIME type is checked with `ClipboardItem.supports()` first                                                            |
| Your app's own data (typed)      | ✅                    | `react-smart-copy/structured`: a web custom format, a custom type and an HTML envelope, so every browser and paste path gets one               |
| Rich text as Markdown            | ✅ paste              | `react-smart-copy/markdown`: CommonMark + GFM from Docs, Word, web pages and mail; plain-text pastes stay untouched                          |
| Code (blocks, sessions, diffs)   | ✅                    | `react-smart-copy/code`: plain text plus monospaced, highlighted HTML; commands without prompts or output; Trojan Source checks on paste |
| Pasted images, made safe         | ✅ paste              | `react-smart-copy/image`: removes location and camera metadata losslessly; resizes and compresses under a byte budget |
| Links (titled, to a passage)     | ✅                    | `react-smart-copy/link`: a titled `<a>` plus the URL; `text/uri-list` when dragged; text fragment links; never `javascript:` |
| Styled content, portable         | ✅                    | `react-smart-copy/rich`: sanitized HTML with inline styles and email-safe colours, plus plain text; for buttons and Ctrl/⌘+C |
| Rich text pasted into an editor  | ✅                    | `react-smart-copy/rich`: Docs, Word and mail into TipTap, Lexical or `contenteditable` as clean, semantic HTML |
| Colours (every CSS format)       | ✅                    | `react-smart-copy/color`: the value as text, plus a swatch for rich-text apps; any CSS colour read back on paste |
| Share sheet (Web Share API)      | ✅ with copy fallback | `react-smart-copy/share`: the share sheet on phones and tablets, a titled link copied elsewhere; files where the share sheet takes them |
| SVG (icons, charts, logos)       | ✅ as PNG             | `svgToPngBlob()` from `react-smart-copy/capture` rasterises natively, no dependency. Raw SVG is not a clipboard image format                 |
| A section of your UI as an image | ✅ bring a rasteriser | Browsers have no "screenshot this element" API. `captureElement()` wraps one you choose (e.g. `modern-screenshot`) with limits and checks  |
| Files (PDF, DOCX, ZIP)           | ❌                    | Not writable to the system clipboard by any browser API                                                                                     |
| Anything over plain HTTP         | ❌                    | The Clipboard API requires HTTPS or `localhost`. You get an `insecure-context` error, not a silent failure                                  |

## Install

```bash
npm install react-smart-copy
```

Works with React 18 and 19 and TypeScript 5.0 or later (the published types are checked on 5.0, 6 and 7 in CI).
React is an optional peer: every entry point except the main one runs without it, in browsers and in Node.js 18 or later.

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

A `multi` item can be marked `optional: true`: it is written only when `ClipboardItem.supports()`
confirms its type, and skipped otherwise instead of failing the copy. That is how a web custom
format (`"web application/vnd.acme.rows+json"`, Chromium) rides along with HTML and text that
every browser writes. Copy and drag events skip web custom formats, which only the async
Clipboard API can write.

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

## Controlling native copy (Ctrl/⌘+C)

Everything above copies from a button. `useCopyInterceptor` handles the other way people
copy: selecting text and pressing Ctrl/⌘+C, Ctrl/⌘+X or using the context menu. Inside the
element you attach it to, you decide what reaches the clipboard.

```tsx
import { useCopyInterceptor } from "react-smart-copy";

function Article({ children }: { children: React.ReactNode }) {
  const { ref } = useCopyInterceptor<HTMLElement>({
    transform: ({ text }) => `${text}\n\nSource: ${location.href}`,
  });
  return <article ref={ref}>{children}</article>;
}
```

The transform receives the selection (`text`, `html`, a detached `fragment` you may
mutate, the `field` for inputs, and whether it was a `copy` or `cut`) and returns:

| Return                                   | Effect                                                         |
| ---------------------------------------- | -------------------------------------------------------------- |
| a string or a text/HTML/JSON/multi payload | written instead of the selection                               |
| `false`                                  | nothing is copied; a blocked cut deletes nothing                |
| `null` / `undefined`                     | the browser's normal copy, untouched                            |

It writes through the copy event itself, so there is no permission prompt, it works over
plain HTTP, and in every browser. The trade-off: only strings can be written, so the types
reject image payloads and `async` transforms (the clipboard closes when the event returns).
Use `useCopy` for images.

**Redaction.** Mutate the fragment and return HTML with a text fallback:

```tsx
const { ref } = useCopyInterceptor<HTMLDivElement>({
  priority: 10, // see "Overlapping scopes"
  transform: ({ fragment, text }) => {
    if (!fragment) return text.replace(/sk-live-\w+/g, "••••"); // inside an <input>
    fragment.querySelectorAll("[data-redact]").forEach((node) => (node.textContent = "••••"));
    const box = document.createElement("div");
    box.append(fragment);
    return { kind: "html", html: box.innerHTML, text: box.textContent };
  },
});
```

**Tables to Excel.** Return a `multi` payload with tab-separated `text/plain` and an HTML
`<table>`; spreadsheets paste either into cells.

**Cuts** in inputs and `contenteditable` still remove the selection after your content is
written, through the browser's own editing path: undo works and React sees an `input` event.
`outcome.deleted` tells you whether that happened.

**Failures fail closed.** If the transform throws or returns something unwritable, nothing
is copied and `onError` fires. That is the safe default for redaction; pass
`failureMode: "native"` to let the original copy through instead (e.g. for attribution).

**Overlapping scopes.** One selection can touch several intercepted elements. Exactly one
handles it: the highest `priority`, then the innermost, then the first in the document. The
winner receives the whole selection, so give redaction scopes a higher priority than
attribution scopes and copying across both is still masked. A React `onCopy` handler that
calls `preventDefault()` always wins.

Other options: `events` (`["copy"]`, `["cut"]` or both, the default), `enabled`, and
`onIntercept(outcome)` for telemetry. Without React, call `registerCopyInterceptor(element,
options)` from `react-smart-copy/core`; it returns an unsubscribe function. For a single
element's own `onCopy` handler, `interceptCopyEvent(event, { transform })` applies a
transform to one event.

> This guards against accidents, not adversaries. Anyone can still screenshot, open dev
> tools or disable JavaScript. Never send data to the page that the user must not see.

## Drag-to-copy

`useDragCopy` makes any element draggable and populates its `DataTransfer` with structured
data when the user starts dragging it. No Clipboard API, no permission prompt — it works
in every browser that supports HTML5 drag-and-drop.

```tsx
import { useDragCopy } from "react-smart-copy";
import { linkPayload } from "react-smart-copy/link";

function DraggableCard({ title, url }: { title: string; url: string }) {
  const { ref, status } = useDragCopy({
    // Escaped, scheme-checked, and with text/uri-list so it drops into the address bar too.
    source: () => linkPayload({ url, title }, { target: "drag" }),
    effectAllowed: "copy",
  });
  return (
    <div ref={ref} style={{ opacity: status === "dragging" ? 0.5 : 1 }}>
      {title}
    </div>
  );
}
```

The `source` callback is called synchronously on `dragstart` and must return synchronously
(the `DataTransfer` closes when the event handler returns). Return:

| Return value                         | Effect                                              |
| ------------------------------------ | --------------------------------------------------- |
| a string                             | written as `text/plain`                             |
| a text / HTML / JSON / multi payload | written according to its `kind`                     |
| `false`                              | `preventDefault()` is called; the drag is cancelled |
| `null` / `undefined`                 | the browser's default drag data, untouched          |

The same payload shapes as `useCopy` are accepted (`kind: "text"`, `kind: "html"`,
`kind: "json"`, `kind: "multi"`), minus images — `DataTransfer` accepts strings only.

```tsx
// Plain text
source: () => `${title}\n${url}`

// HTML + text fallback (e.g. for dropping into a rich-text editor)
source: () => ({ kind: "html", html: `<b>${title}</b>`, text: title })

// JSON (serialised as text/plain)
source: () => ({ kind: "json", value: { id, title }, pretty: true })

// Multiple MIME types (e.g. custom application type for your own drop targets)
source: () => ({
  kind: "multi",
  items: [
    { mimeType: "text/plain",          data: title },
    { mimeType: "application/x-my-id", data: String(id) },
  ],
})
```

**`effectAllowed`** controls the drag cursor and the effects drop targets may request.
Defaults to `"copy"`; pass `"move"` to signal that the source will be removed after a
successful drop (your app must do the actual removal in `dragend` or on the server).

**Always-fresh source.** The `source` callback reads the latest props and state on every
drag. You never need to list it in a dependency array or wrap it in a ref yourself.

**`enabled`** removes `draggable` and the listener without unmounting the component.
Status resets to `idle` while disabled.

```tsx
const { ref, status, outcome } = useDragCopy({
  source: () => text,
  enabled: !isLocked,
  effectAllowed: "copyMove",
  onDrag: (state) => {
    if (state.status === "done") analytics.track("drag_complete");
  },
  onError: (err) => console.error("drag source failed", err),
});
```

| Return value | Type                          | Description                                        |
| ------------ | ----------------------------- | -------------------------------------------------- |
| `ref`        | `RefCallback<T>`              | Attach to the element you want to make draggable   |
| `status`     | `'idle' \| 'dragging' \| 'done'` | Current drag state                              |
| `outcome`    | `DragCopyOutcome \| null`     | Result of the last `dragstart`; `null` before any drag |
| `onDragStart`| `(event) => void`             | For wiring via React's `onDragStart` prop if needed |

**`onDragStart` prop path.** The hook attaches its own native listener through `ref`, so you
rarely need `onDragStart`. It is there for render-prop components or controlled drag
libraries that require a React prop:

```tsx
const { ref, onDragStart } = useDragCopy({ source: () => "data" });
return (
  <SortableItem
    ref={ref}
    onDragStart={(e) =>
      onDragStart({
        type: "dragstart",
        dataTransfer: e.dataTransfer,
        defaultPrevented: e.defaultPrevented,
        preventDefault: () => e.preventDefault(),
      })
    }
  />
);
```

**SSR-safe.** `draggable` is never set during server rendering; the ref callback runs only
in the browser.

**Without React.** `applyDragCopy` and `registerDragCopy` are exported from
`react-smart-copy/core` for framework-agnostic use:

```ts
import { registerDragCopy } from "react-smart-copy/core";

const { unsubscribe } = registerDragCopy(element, () => ({
  source: () => `${title}\n${url}`,
  effectAllowed: "copy",
}));
// later: unsubscribe();
```

> **Drag vs. copy.** `useCopy` writes to the clipboard when the user clicks a button.
> `useDragCopy` writes to the `DataTransfer` when the user drags an element. Use them
> together if your UI supports both flows.

## Tables: Excel, Google Sheets, AG Grid, TanStack

`react-smart-copy/table` copies rows so they land as cells in Excel, Google Sheets, Numbers
and LibreOffice, and as a real table in Docs, Word, Notion and mail. It also reads ranges
pasted from those apps back into rows and typed records. It has no dependencies, works
without React, and tree-shakes to what you use (about 1.9 kB for copying).

```tsx
import { useCopy } from "react-smart-copy";
import { fromRows, tablePayload } from "react-smart-copy/table";

function CopyInvoices({ invoices }: { invoices: Invoice[] }) {
  const { copy, status } = useCopy();
  return (
    <button
      type="button"
      onClick={() =>
        void copy(() =>
          tablePayload(
            fromRows(invoices, [
              { header: "Invoice", value: "id" },
              { header: "Amount", value: "amount" }, // stays a number in Excel
              { header: "Due", value: (row) => row.due.toLocaleDateString() },
            ]),
          ),
        )
      }
    >
      {status === "copied" ? "Copied" : "Copy as table"}
    </button>
  );
}
```

`tablePayload` returns an ordinary `html` payload: an HTML `<table>` with tab-separated text
as its fallback. That means it works everywhere a payload does: `copy()`, `useCopyInterceptor`
transforms and `useDragCopy` sources. Where rich copy is unavailable, the plain-text fallback
still pastes into cells.

**What survives the trip.** Cells keep their types. Numbers, bigints, booleans and dates stay
values the spreadsheet can calculate with, while strings are marked as text so Excel keeps
`00123`, `1/2` and `1E5` as written (`preserveText`). Tabs, quotes and line breaks inside cells
are quoted the way Excel quotes them. A one-column table ending in an empty cell keeps that
row. Use `formatCell` for your own number or date formats.

**Formula injection is off by default.** A text cell starting with `=`, `+`, `-`, `@`, a tab or
a line break (or their full-width forms) would run as a formula when pasted. Following OWASP's
CSV Injection guidance, such cells get a leading `'`, which spreadsheets read as "this is text".
Typed numbers are never touched, so `-5` passed as a number stays a number. Rich editors show
that apostrophe, so pass `formulaGuard: false` only for data you trust.

### From your grid

```tsx
import { fromAgGrid, fromTanStackTable, fromTableElement } from "react-smart-copy/table";

// AG Grid v31+ (Community or Enterprise): selected rows in on-screen order.
copy(() => tablePayload(fromAgGrid(gridRef.current!.api, { rows: "selected" })));

// TanStack Table v8 or v9, in any framework adapter, and libraries built on it
// such as Material React Table and Mantine React Table.
copy(() => tablePayload(fromTanStackTable(table, { rows: "selected" })));

// Any library that renders a real <table>.
copy(() => tablePayload(fromTableElement(containerRef.current!)));
```

| Adapter             | Rows                                                                 | Columns and values                                                                                                    |
| ------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `fromAgGrid`        | `displayed` (default), `selected`, `filtered`, `all`, or row nodes   | Displayed columns minus the selection and row-number columns. `values: "auto"` keeps numbers raw and formats the rest |
| `fromTanStackTable` | `visible` (default: what `getRowModel()` renders), `selected`, or rows | Visible columns that hold data; display columns such as checkboxes are skipped. `header` and `value` overrides       |
| `fromTableElement`  | Every visible row of the first table                                 | Merged cells, `<br>` line breaks, hidden rows and cells handled                                                       |
| `fromRows`          | Your objects                                                         | You choose: a property (type-checked to hold a cell) or a function                                                    |

AG Grid ships clipboard support only in Enterprise. This gives Community grids Excel-ready
copy; for Ctrl/⌘+C, call it from `onCellKeyDown`:

```tsx
onCellKeyDown={(event) => {
  const key = event.event as KeyboardEvent | null;
  if (!key || !(key.ctrlKey || key.metaKey) || key.key.toLowerCase() !== "c") return;
  const selected = event.api.getSelectedNodes().length > 0;
  void copy(() => tablePayload(fromAgGrid(event.api, selected ? { rows: "selected" } : { rows: [event.node] })));
}}
```

### Pasting a range from Excel or Google Sheets

```tsx
import { usePaste } from "react-smart-copy";
import { parseTable, toRecords } from "react-smart-copy/table";

const { targetProps } = usePaste<HTMLDivElement>({
  accept: ["html", "text"], // the HTML flavour keeps merged cells and line breaks exact
  onPaste: (result) => {
    const table = parseTable(result, { headers: true });
    if (!table) return;
    const { records, missing, errors } = toRecords(table, {
      email: { header: ["Email", "E-mail"], required: true },
      seats: { header: "Seats", parse: (text) => Number.parseInt(text, 10) },
    });
    // records: { email: string | undefined; seats: number | undefined }[]
  },
});
```

`parseTable` reads the HTML flavour when it holds a table (Excel, Google Sheets, Word and web
pages all write one) and falls back to tab-separated text, which is also what it uses on the
server. Pasted HTML is parsed in an inert document: scripts never run and nothing is fetched.
Every limit is explicit: `maxRows` (100,000), `maxColumns` (16,384, Excel's own), `maxCells`
(1,000,000) and `maxLength` (32 MiB). Content beyond them sets `truncated: true` instead of
being dropped silently, and merged cells are counted too, so a tiny document can't claim
millions of cells. `toRecords` matches headers ignoring case, spacing and full-width forms,
reports `missing` required columns and every cell whose `parse` threw, and never stops at the
first bad row.

## Structured data: copy objects, paste typed objects

`react-smart-copy/structured` puts your app's own data on the clipboard: invoice rows, a
dashboard widget, a form's configuration, a set of shapes. Paste it in another tab, another
window or another of your apps and you get the same typed objects back, validated against
your schema. Text editors, chat and mail get readable text and HTML instead. No dependencies,
about 1.9 kB for the copy side.

```tsx
import { z } from "zod"; // or Valibot, ArkType, any Standard Schema, or a plain function
import { useCopy, usePaste } from "react-smart-copy";
import { clipAccept, clipPayload, defineClipFormat, readClip } from "react-smart-copy/structured";

// Define each format once and share it between the copying and the pasting code.
export const InvoiceRows = defineClipFormat({
  id: "acme.invoice-rows", // namespaced, stable: it names the clipboard type
  version: 2,
  schema: z.array(z.object({ id: z.string(), amount: z.number(), issued: z.coerce.date() })),
  migrate: { 1: (rows) => upgradeFromV1(rows) }, // data from older deployments still pastes
  text: (rows) => rows.map((row) => `${row.id}\t${row.amount}`).join("\n"),
});

function CopyRows({ rows }: { rows: Invoice[] }) {
  const { copy } = useCopy();
  return <button onClick={() => void copy(() => clipPayload(InvoiceRows, rows))}>Copy rows</button>;
}

function PasteRows({ onRows }: { onRows: (rows: Invoice[]) => void }) {
  const { paste, targetProps } = usePaste<HTMLDivElement>({
    accept: [...clipAccept(InvoiceRows), "text"],
    onPaste: async (result) => {
      const clip = await readClip(result, InvoiceRows);
      switch (clip.status) {
        case "ok": return onRows(clip.value); // typed, validated, migrated
        case "invalid": return report(clip.issues); // [{ message, path }]
        case "unsupported-version": return askToReload(); // written by a newer deployment
        case "absent": return; // not ours: handle result.text if you like
      }
    },
  });
  return <div {...targetProps} tabIndex={0}>Paste rows here <button onClick={() => void paste()}>Paste</button></div>;
}
```

`clipPayload` works everywhere a payload does: `copy()`, a `useCopyInterceptor` transform (so
Ctrl/⌘+C on selected rows copies the objects) and a `useDragCopy` source. `readClip` reads from a
`PasteResult` (paste button, Ctrl/⌘+V, drops, `PasteField`), a raw `DataTransfer` or a payload.
Use `readClipSync` when you need the answer synchronously and your schema is synchronous.

**Why three carriers.** No single clipboard entry survives every path in every browser, so each
copy writes three and `readClip` takes the first that holds this format:

| Carrier | Written by | Read back by |
| ------- | ---------- | ------------ |
| `web application/vnd.<id>+json` | `copy()` in Chromium | the paste button (`clipboard.read()`), also across origins. Hidden from paste events |
| `application/vnd.<id>+json` | copy interceptor, drag | Ctrl/⌘+V and drops. Hidden from `clipboard.read()` |
| hidden envelope in `text/html` | every path | every path, every browser, including Safari and Firefox |

**Security.** The clipboard is untrusted input: any page or app can put any format on it, so
the data is never trusted, only checked.

- Each carrier is size-checked (`maxBytes`, default 8 MiB) before it is parsed or decoded
- Own `__proto__` keys are dropped while parsing, so merging pasted data can't swap a prototype
- Migrations run on untrusted data, then the schema validates the result; nothing unvalidated reaches `clip.value`
- The HTML carrier is found with a strict token match on a closed alphabet (`id;base64url`): no HTML parsing, no DOM
- Reading never throws for clipboard content: every outcome is a result
- The data is **not authenticated**. Validate it as you would a form submission, and check permissions server-side
- The HTML envelope travels wherever the HTML is pasted (a mail, a document), hidden but readable. Copy only what the user may share, or set `embedInHtml: false` (keyboard paste in Chromium and drops still work through the custom type)

**Copying is strict too.** The data must survive `JSON.stringify` unchanged: `NaN`, `Infinity`,
`BigInt`, `Map`, `Set`, functions and symbols throw an `invalid-payload` error naming the key
instead of turning silently into `null` or `{}`. Dates become ISO strings, so read them back with a
coercing schema (`z.coerce.date()`), or convert in `encode`.

## Paste as Markdown

`react-smart-copy/markdown` turns what people paste into comment boxes, editors and CMS
fields into clean Markdown: headings, bold and italic, links, lists (nested and task
lists), tables, code blocks and quotes, from Google Docs, Word, Notion, GitHub, web pages
and mail. No dependencies, about 7.6 kB.

```tsx
import { pasteAsMarkdown } from "react-smart-copy/markdown";

<textarea value={body} onChange={(event) => setBody(event.target.value)} onPaste={pasteAsMarkdown} />
```

That one handler:

- converts rich pastes (the HTML flavour) and inserts the Markdown at the cursor, replacing the selection
- keeps the browser's **undo** (Ctrl/⌘+Z undoes the paste), fires `input` so React state follows, respects `maxlength`
- leaves **plain-text pastes alone**, because plain text pasted into a Markdown field is usually Markdown already, and leaves code from editors (VS Code, JetBrains) as plain code
- in a single-line `<input>`, joins the result into one line

Pass options with `onPaste={(event) => pasteAsMarkdown(event, { images: "keep" })}`.
For other flows, the pieces are separate:

```ts
import { escapeMarkdown, htmlToMarkdown, insertText, pasteToMarkdown } from "react-smart-copy/markdown";

// With usePaste or PasteField: Markdown for a paste result (plain text stays as it is).
const pasted = pasteToMarkdown(result); // { markdown, source: "html" | "text", truncated } | null
if (pasted) insertText(textarea, pasted.markdown);

// Copy a rendered article as Markdown (a DOM node is converted in place, not re-parsed).
copy(() => htmlToMarkdown(articleRef.current).markdown);

// Any text, rendered literally by any Markdown renderer.
escapeMarkdown("1. *Not* a list <b>"); // "1\\. \\*Not\\* a list \\<b>"
```

**What real clipboards look like, handled.** Google Docs sets bold and italic with CSS on
spans, wraps everything in a non-bold `<b>`, nests lists as siblings and wraps links in
`google.com/url?q=` redirects. Word writes lists as `mso-list` paragraphs with hidden
markers. Mail clients use `<div>` per line and layout tables. Spreadsheets and Docs tables
become GFM tables, merged cells included.

**Correct by construction.** Every delimiter the converter writes is checked with
CommonMark's own pairing algorithm before it is kept, so text always renders as the same
text: where CommonMark can't express a style (`x**[y]**z`), the style is dropped, never the
text, and asterisks never leak into the output. Property tests render thousands of random
documents with a CommonMark parser and compare the result character by character.

**Security.** Pasted HTML is untrusted, so:

- it is parsed in an inert document: scripts never run and nothing is fetched, not even images
- the output never contains raw HTML: any `<` in the text is escaped
- links keep only `http:`, `https:` and `mailto:` (`linkProtocols`); `javascript:`, `data:` and relative links keep only their text
- images default to their alt text (`images: "alt"`), so rendering the Markdown loads no tracking pixels. `"keep"` writes `![alt](url)` for `https:`/`http:` images, `"drop"` removes them
- `maxLength` (16 MiB), `maxNodes` (200,000) and `maxDepth` (200) bound the work; content left out sets `truncated: true`, and merged-cell expansion is capped

| Option | Default | Notes |
| ------ | ------- | - |
| `images` | `"alt"` | `"alt"`, `"keep"` or `"drop"` |
| `links` | `"keep"` | `"text"` keeps only the link text |
| `linkProtocols` / `imageProtocols` | `http(s)`, `mailto` / `https`, `http` | allowed URL schemes |
| `baseUrl` | none | resolves relative links and images |
| `bullet` | `"-"` | `"*"` or `"+"` |
| `hardBreak` | `"backslash"` | `"spaces"` for two trailing spaces |
| `codeAsText` (paste) | `true` | `false` turns code-only pastes into fenced code blocks |

## Copy and paste code

`react-smart-copy/code` is for the copy button on every code block and for fields people
paste code into. It also catches code that reads differently from how it runs. No
dependencies, about 7.4 kB (`inspectCode` alone is about 2.5 kB).

```tsx
import { useCopy } from "react-smart-copy";
import { codePayload } from "react-smart-copy/code";

const { copy, status } = useCopy();
<pre ref={preRef}>…</pre>
<button onClick={() => copy(() => codePayload(preRef.current!, { language: "tsx" }))}>Copy</button>
```

What gets copied is the code the reader means to run:

- **A terminal or REPL session copies as its commands.** `$ npm test` followed by its output copies as `npm test`. Prompts from `bash`/`zsh` (`$`, `user@host:~$`, `(venv) $`), PowerShell, `cmd`, Python, IPython and Node are recognised. Continued commands stay whole: a trailing `\`, a heredoc or an open quote. `prompt: "auto"` (the default) only acts when the first line starts with a prompt
- **A highlighted block copies without its chrome.** Line-number gutters (Prism, highlight.js, Rouge, react-syntax-highlighter and others), `user-select: none` and `aria-hidden` parts, hidden parts, buttons and anything with `data-copy-ignore` are left out. `ignore` takes a CSS selector for more
- **It pastes well everywhere.** Plain text for editors and terminals, plus monospaced HTML with the block's syntax colours for Google Docs, Word, Slack, Teams and mail. Both flavours always hold the same code
- **Diffs, line numbers, indentation.** `diff: "after"` (or `"before"`) copies one side of a unified diff. `lineNumbers: true` removes typed line numbers when they count up on every line. Shared indentation, trailing whitespace and blank edges are removed, and line endings are normalised (`lineEnding: "crlf"` for Windows)

For a code field, `pasteAsCode` is a ready paste handler:

```tsx
import { pasteAsCode } from "react-smart-copy/code";

<textarea onPaste={pasteAsCode} />
<textarea onPaste={(event) => pasteAsCode(event, { onPaste: (r) => !r.danger || confirm("Paste anyway?") })} />
```

It fixes what chat apps and word processors do to code (curly quotes, `—` for `--`,
no-break spaces, zero-width characters) and dedents the paste. Each line after the first is
indented to the cursor line, as code editors do. The paste is one step on the browser's
undo stack. `onPaste` sees every finding first and can cancel. For CodeMirror, Monaco or
`usePaste`, `pasteToCode(result)` returns the same `{ code, findings, fixed, remaining, danger }`.

**Security: code that runs differently from how it reads.** `inspectCode` reports, with
line, column and a label such as `U+202E RIGHT-TO-LEFT OVERRIDE`:

| Kind | Severity | What it catches |
| ---- | -------- | --------------- |
| `bidi-control` | danger | Trojan Source ([CVE-2021-42574](https://trojansource.codes/)): overrides and isolates that reorder how code is shown. Implicit marks are a warning |
| `invisible` | danger / warning | Hangul fillers that make invisible identifiers, and tag characters that hide ASCII (including hidden instructions in prompts) are danger. Zero-width spaces, joiners outside words and emoji, and runs of variation selectors that smuggle data are warnings |
| `mixed-script` | danger / warning | A Cyrillic or Greek letter inside a Latin word (`аdmin` with a Cyrillic `а`). A Latin lookalike is danger; another letter is a warning |
| `control` | warning | Control characters other than tab, line feed, carriage return and form feed, and Unicode line separators |
| `unusual-space` | warning | No-break, em, ideographic and similar spaces |
| `confusable-punctuation` | warning | Curly quotes, dashes, `…`, the Greek question mark that looks like `;`, full-width punctuation outside CJK text |

Joiners inside Arabic, Persian or Indic words and emoji, a single emoji variation
selector, and full-width punctuation in CJK comments are left alone. `cleanCode` applies
the safe replacement of every finding. It runs until nothing fixable is left, because
removing a zero-width space can expose a mixed word. It never guesses a letter that has no
Latin lookalike; those stay in `remaining`. Copying doesn't clean by default
(`clean: true` turns it on). Pasting does (`clean: false` turns it off).

```ts
import { cleanCode, inspectCode, normalizeCode } from "react-smart-copy/code";

inspectCode(source).danger;              // true for Trojan Source, lookalikes, invisible identifiers
cleanCode("const s = “hi”;").code;      // 'const s = "hi";'
normalizeCode("$ npm i\nadded 1 package"); // "npm i" (also works on the server)
```

Pasted code is never cut: past `maxLength` (2,000,000 characters) `pasteToCode` throws a
`too-large` error, and `pasteAsCode` leaves the paste to the browser. HTML is parsed
inertly and only its text is used.

| Option | Default | Notes |
| ------ | ------- | - |
| `prompt` | `"auto"` copy, `false` paste | a style (`"shell"`, `"powershell"`, `"cmd"`, `"python"`, `"ipython"`, `"node"`), `{ command, continuation }` regexes, or `false` |
| `diff` | `false` | `"after"` or `"before"` |
| `lineNumbers` | `false` | remove typed line numbers that count up |
| `dedent` / `trimTrailingWhitespace` / `trimBlankLines` | `true` | |
| `lineEnding` / `finalNewline` | `"lf"` / `false` | |
| `clean` | `false` copy, `true` paste | `true`, `false` or a list of kinds |
| `html` / `language` (copy) | `true` / none | add the HTML flavour; `class="language-…"` on `<code>` |
| `indentToCursor` / `onPaste` (`pasteAsCode`) | `true` / none | |

## Pasted images: private and small

`react-smart-copy/image` gets pasted and dropped images ready to upload. A photo from a
phone usually carries the exact location it was taken, the device and its serial number,
and an embedded preview that can show what was cropped out. This module removes that
data, and makes the image fit your size and byte limits. No dependencies, about 7.3 kB
(about 4.8 kB for the server-safe `stripMetadata` and `readImageInfo`).

```ts
import { usePaste } from "react-smart-copy";
import { prepareImage } from "react-smart-copy/image";

usePaste({
  accept: ["image"],
  onPaste: async ({ imageFiles }) => {
    const image = await prepareImage(imageFiles[0], { maxWidth: 2048, maxBytes: 1_000_000 });
    upload(image.file); // a File named like the original, metadata removed
    if (image.original.info.metadata.includes("gps")) notice("Location removed from the photo.");
  },
});
```

**Lossless whenever it can be.** When only the metadata has to go, nothing is
re-encoded. JPEG, PNG, WebP and GIF are rewritten without their metadata, and every
pixel stays the same, so screenshots stay sharp and photos lose no quality. The image is
decoded and encoded again only when it has to change: to fit `maxWidth`, `maxHeight`,
`maxPixels` or `maxBytes`, to change its format, or because it is AVIF or HEIC.

**What is removed:** Exif (camera, lens, dates, serial numbers), the GPS location, embedded
thumbnails, XMP (edit history, authors), IPTC (captions, credits), comments, PNG text chunks,
multi-picture and depth images (MPF), content credentials (C2PA), and data appended after
the image (motion-photo videos). The colour profile is kept (`keepColorProfile: false`
removes it). The orientation is kept in a 26-byte Exif block holding nothing else, so a
photo still displays the right way up (`keepOrientation: false` removes it).

**Fits a byte budget.** For `maxBytes`, JPEG and WebP search for the highest quality that
fits (down to `minQuality`, 0.5 by default), and only then reduce the size. A screenshot
stays PNG when it fits. When it doesn't, `type: "auto"` turns it into WebP, or JPEG where
the browser can't encode WebP. If the limit can't be met, you get a `too-large` error,
never a file that is still too big. Large reductions are drawn in halving steps, so text
and edges stay clean.

**Safe with hostile files.** The format is read from the bytes, never from the file name
or the claimed type. Sizes come from the header and are checked against
`maxInputPixels` (100 million) *before* decoding, which stops decompression bombs. Every
parser read is bounded by its own box or chunk. Fuzz tests feed random and mutated files
to every parser. Animations keep every frame by default (`animated: "keep"`): a resize
they would need is a `too-large` error, `"first-frame"` makes a still image, and
`"reject"` refuses them. Every failure is a typed error: `too-large`,
`unsupported-format`, `unsupported` (re-encoding outside a browser), `timeout` or
`aborted` (`signal`).

```ts
import { readImageInfo, stripMetadata } from "react-smart-copy/image";

// Anywhere, including the server (Node 18+): no decoding, no canvas.
const info = await readImageInfo(file);
// { format: "jpeg", width: 4032, height: 3024, orientation: 6, animated: false,
//   metadata: ["exif", "gps", "thumbnail", "icc", "other"] }

const { blob, removed } = await stripMetadata(file); // bit-for-bit the same picture
```

| Option (`prepareImage`) | Default | Notes |
| ----------------------- | ------- | - |
| `maxWidth` / `maxHeight` | none | only ever makes images smaller |
| `maxPixels` | 16,777,216 | Safari's canvas limit |
| `maxBytes` | none | quality first, then size; `too-large` when it can't |
| `type` | `"auto"` | `"image/jpeg"`, `"image/png"` or `"image/webp"` |
| `quality` / `minQuality` | 0.85 / 0.5 | JPEG and WebP |
| `background` | `"#fff"` | under transparent pixels in JPEG |
| `animated` | `"keep"` | `"first-frame"` or `"reject"` |
| `keepColorProfile` | `true` | re-encoded images are written in sRGB |
| `maxInputPixels` / `maxInputBytes` | 100,000,000 / 100 MiB | checked before decoding |
| `timeoutMs` / `signal` | 30 s / none | |
| `environment` | the browser | your own decoder (e.g. WebAssembly HEIC) or a test double |

`width` and `height` in the result are the displayed size. Browsers turn JPEG and PNG by
their orientation, and Chromium doesn't turn WebP. `removed` is read back from the
output, not assumed, because some browsers' encoders add their own colour profile.

## Pasted and dropped files: safe by content

`react-smart-copy/files` takes the files people paste or drop, whole folders included, and
decides for each one whether it is safe and wanted. The type comes from the file's content,
never from its name or the type the browser claims. So an HTML page named `invoice.pdf`, a
program named `invoice.pdf.exe`, or a name that hides its real extension behind a
right-to-left character is turned away, with a reason you can show. No dependencies, about
6.9 kB (about 2.3 kB for `safeFileName` alone). It works the same on a server.

```tsx
import { acceptFiles } from "react-smart-copy/files";

<div
  onDragOver={(event) => event.preventDefault()}
  onDrop={(event) => {
    event.preventDefault();
    // Call it in the handler, before any await: the browser empties the drop when the event ends.
    void acceptFiles(event, { accept: ".pdf,image/*", maxFileBytes: 20_000_000, digest: true }).then(({ accepted, rejected }) => {
      for (const file of accepted) upload(file.upload, file.path); // safe name, real type
      for (const file of rejected) toast(file.message); // "invoice.pdf.exe is a program or script, which can't be added."
    });
  }}
/>
```

It takes a drop or paste event (DOM or React), its `DataTransfer`, the `FileList` of an
`<input type="file">`, or any list of files. With `usePaste` and `PasteField`, pass the
result's `files`.

**Known by content.** The first 8 KB of each file is read, and more than 50 formats are
recognised by their signatures: PDF; images (JPEG, PNG, GIF, WebP, AVIF, HEIC, TIFF, BMP,
ICO, PSD, SVG); audio and video; Office and OpenDocument files, told apart inside their
ZIP; archives; fonts; SQLite; HTML, XML, JSON and other text; and programs (Windows, Linux
and macOS executables, WebAssembly, Java and Android archives, shortcuts and scripts). Each
accepted file's `type` is the detected one, never the claimed one: `upload` is the same
bytes as a `File` with that type and the safe name.

**Risky files are rejected by default.** Each file is checked for these risks, and by
default any of them rejects it. Pass `block` to choose which ones do.

| Risk | What it catches |
| --- | --- |
| `executable` | Programs and scripts, by content or by a name the system runs (`.exe`, `.bat`, `.ps1`, `.js`, `.jar`, `.iso`, `.lnk`, ...) |
| `active-content` | HTML and SVG, and XML with XHTML or scripts: they run script when opened from your site |
| `macros` | Office files that can hold macros (`.docm`, `.xlsm`, or a `vbaProject.bin` inside) |
| `type-mismatch` | The content is not what the extension says: `report.pdf` holding HTML |
| `double-extension` | `invoice.pdf.exe`, or `invoice.pdf          .exe` |
| `hidden-characters` | Bidirectional controls and invisible characters in the name: `photo\u202Egpj.exe` shows as `photoexe.jpg` |
| `empty` | No bytes: often a folder dropped where folders aren't read |

**Folders, within limits.** Dropped folders are walked depth-first, and each file's
`path` keeps where it was (`photos/2024/a.jpg`). `maxFiles` (100), `maxFileBytes`
(100 MiB), `maxTotalBytes` (1 GiB) and `maxDepth` (8) bound the walk, so a dropped home
folder can't hang the page. With `digest: true`, each file's SHA-256 is computed and a
repeated file is rejected as a `duplicate`.

**Names safe everywhere.** `safeFileName` keeps only the last path segment (no `../`),
removes hidden and control characters, replaces the characters Windows, macOS and Linux
reject, prefixes Windows device names (`CON`, `NUL`, `COM1`), and fits the name to 255
UTF-8 bytes, keeping its extension.

```ts
import { inspectFile, safeFileName } from "react-smart-copy/files";

// In the browser or on a server (Node 18+), for a file you already have.
const inspection = await inspectFile(file);
// { name: "invoice.pdf", safeName: "invoice.pdf", extension: "pdf", type: "text/html",
//   detected: { mime: "text/html", family: "text", ... }, mismatch: true,
//   risks: ["active-content", "type-mismatch"], ... }

safeFileName("../../uploads/CON.txt"); // "_CON.txt"
```

| Option (`acceptFiles`) | Default | Notes |
| --- | --- | --- |
| `accept` | any | as in `<input accept>`: `".pdf,image/*"`, judged by content |
| `block` | every risk | `[]` accepts risky files; their `inspection.risks` still say |
| `maxFiles` | 100 | the walk stops at the next file, and `truncated` is `true` |
| `maxFileBytes` / `maxTotalBytes` | 100 MiB / 1 GiB | |
| `folders` / `maxDepth` | `true` / 8 | |
| `digest` | `false` | SHA-256 for each file, and `duplicate` rejections; needs Web Crypto (a secure page, or Node.js 20+) |
| `names` | | `maxBytes`, `replacement` and `fallback` for `safeFileName` |
| `signal` | none | aborts with an `aborted` CopyFailure |

Each rejection has a `reason` (`blocked`, `not-accepted`, `too-large`, `total-too-large`,
`too-many`, `too-deep`, `unreadable` or `duplicate`), the file's `risks`, and a `message`
that names the file by its safe name. Checking files in the browser is for the people
using your app: check them again on your server, where `inspectFile` works the same, and
serve uploads with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`.

## Secrets: keep keys out of pastes and copies

`react-smart-copy/secrets` keeps secrets from travelling through the clipboard. It finds API
keys, tokens, private keys, passwords, card numbers and IBANs in text people paste or copy,
and redacts or blocks them: in a chat box, a support ticket, or a log someone copies from
your app. No dependencies, about 4.1 kB (about 3.3 kB for `scanSecrets` alone), and it works
the same on a server.

```tsx
import { pasteWithoutSecrets } from "react-smart-copy/secrets";

<textarea
  onPaste={(event) =>
    pasteWithoutSecrets(event, {
      // "redact" (the default) inserts the paste with each secret replaced; "block" inserts nothing.
      action: "redact",
      onSecrets: (found) => toast(`Removed a ${found[0].label} from your message.`),
    })
  }
/>
```

**What it finds.** Each finding has a kind, a confidence, and a masked preview.

- **Service keys and tokens, by their documented formats:** AWS access key IDs, GitHub
  (classic and fine-grained), GitLab, Slack tokens and webhooks, Stripe live keys, Google API
  keys, npm, PyPI, SendGrid, Twilio, Azure storage keys, and JSON Web Tokens (whose
  header must decode).
- **Private keys** (PEM and OpenSSH), from their `BEGIN` line to their `END` line.
- **Passwords inside other text:** in URLs (`postgres://app:password@db`) and in connection
  strings (`;Password=...`).
- **Card numbers and IBANs, by checksum:** Luhn plus the card brand's ranges and lengths,
  and mod-97 plus the country's IBAN length.
- **Random-looking values assigned to secret names:** `API_KEY="..."`, `"password": "..."`,
  `client_secret: ...`, including an AWS secret key next to its name. Placeholders
  (`changeme`, `<token>`, `${TOKEN}`) and references (`process.env.TOKEN`) are left alone.

**Safe to run on anything.** Every pattern runs in linear time: no nested quantifiers, no
lookbehind. Hostile text of hundreds of kilobytes is scanned in milliseconds. A finding never
holds the secret: it holds where the secret is (`start`, `end`), its `kind` and `label`, a
`confidence`, and `masked`. `masked` keeps at most a known prefix and the last 4 characters
(`ghp_` and the last 4, or `•••• 4242` for a card), and nothing at all for passwords. Text
past `maxLength` (1,000,000 characters) is not scanned, and `redactSecrets` drops it rather
than pass it on unchecked.

```ts
import { redactSecrets, scanSecrets, secretRedactor } from "react-smart-copy/secrets";

const { findings } = scanSecrets(text, { minConfidence: "high" });
// [{ kind: "github-token", label: "GitHub token", confidence: "high", start: 13, end: 53, masked: "ghp_…a1B2" }]

redactSecrets("token=ghp_…").text; // "token=[redacted GitHub token]"

// Mask secrets in what people copy from a log viewer or an admin console.
useCopyInterceptor(logRef, { transform: secretRedactor() });
```

| Option | Default | Notes |
| --- | --- | --- |
| `kinds` | every kind | the kinds to look for |
| `minConfidence` | `"medium"` | `"high"` leaves out values that only look like secrets |
| `maxLength` | 1,000,000 | characters scanned |
| `replace` | `[redacted <label>]` | `redactSecrets`, `pasteWithoutSecrets` and `secretRedactor` |
| `action` | `"redact"` | `pasteWithoutSecrets`: `"block"` inserts nothing |
| `onSecrets` | | `pasteWithoutSecrets`: called with the findings and what was done |

A paste is redacted in a `<textarea>` or text `<input>`, with undo intact; anywhere else, a
paste with secrets is blocked. Scanning in the browser protects the people using your app.
Scan again on your server before you store or forward text, because `scanSecrets` works the
same there.

## One-time codes

`react-smart-copy/otp` handles the one-time codes people copy from an SMS or an e-mail.
`extractOtp` finds the code in a message, and leaves prices, dates, times, phone numbers and
order numbers alone. `useOtpField` (in the React entry) wires a row of single-character
boxes: typing moves on, Backspace goes back, and pasting a whole message into any box fills
them all. No dependencies, about 3.6 kB (about 2 kB for `extractOtp` alone).

```tsx
import { useOtpField } from "react-smart-copy";

const otp = useOtpField({ length: 6, onComplete: verify });

<div role="group" aria-label="Verification code">
  {Array.from({ length: 6 }, (_, index) => (
    <input key={index} {...otp.getInputProps(index)} />
  ))}
</div>
```

- **SMS autofill** on iOS and Android (`autocomplete="one-time-code"` on the first box), and
  the **WebOTP API** with `webOtp: true`, cancelled when the boxes unmount or the code is typed.
- **Every box is named** (`Digit 1 of 6`), numeric codes get the numeric keyboard, and the
  arrow keys, Home, End, Backspace and Delete work as people expect.
- **`extractOtp`** reads codes on their own (`482 913`), origin-bound lines
  (`@example.com #482913`, refused for another `domain`), and numbers next to a word that
  names them in twenty languages, with digits of any script. Linear time, first 100,000
  characters.

```ts
import { extractOtp } from "react-smart-copy/otp";

extractOtp("Your verification code is 482913. It expires in 10 minutes.");
// { code: "482913", source: "keyword", confidence: "high", domain: null }
extractOtp("Your order 48291 of $1,249.00 ships on 24/10."); // null
```

## Numbers and amounts

`react-smart-copy/number` reads the numbers people paste: `1.234,50 €` from a bank statement,
`$1,234.50` from an invoice, `(1,234.00)` from a spreadsheet, `₹ 12,34,567` in lakh grouping.
It gives the number exactly, as a decimal string as well as a `number`, and turns away dates,
phone numbers and wrongly grouped text. No dependencies, about 3.5 kB.

```tsx
import { parseNumber, pasteAsNumber } from "react-smart-copy/number";

parseNumber("1.234,50 €");
// { value: 1234.5, exact: "1234.50", kind: "number", currency: { symbol: "€", code: "EUR" }, ambiguous: false }

<input type="number" step="any" onPaste={(event) => pasteAsNumber(event, { locale: "de-DE" })} />
```

- **Every grouping and decimal style:** `,` `.` `'` and spaces, groups of three and lakh
  grouping. Text that can be read only one way is read that way everywhere; a lone `1,234` is
  settled by `locale`, and flagged `ambiguous`.
- **Signs, currencies and percent:** `−`, trailing minus, accounting brackets, symbols and ISO
  codes before or after, `%` and `‰`, scientific notation.
- **`pasteAsNumber`** puts `exact` in `<input type="number">` and the locale's format in text
  fields, with undo intact, and turns away pastes that are not numbers.
- **`formatNumber` and `numberPayload`** write a number, bigint or exact string for any locale,
  grouped or not, rounded to `fractionDigits` without float error.

## Copy links

`react-smart-copy/link` is for "Copy link" and "Share" buttons, and for fields people
paste links into. No dependencies, about 4 kB (`linkPayload` alone is about 1.8 kB).

```tsx
import { useCopy } from "react-smart-copy";
import { linkPayload } from "react-smart-copy/link";

const { copy, status } = useCopy();
<button onClick={() => copy(() => linkPayload({ url: issue.url, title: issue.title }, { clean: true }))}>Copy link</button>
```

**It pastes as the right thing everywhere.** The clipboard gets a titled link (`<a href>`)
and the URL. Slack, Google Docs, Notion, Teams, Word and mail paste the title as a link;
editors, terminals and the address bar paste the URL. `text: "markdown"` makes the plain
text `[title](url)` for Markdown fields, `"title-and-url"` puts both on two lines. Dragged
with `useDragCopy` (`{ target: "drag" }`), it also carries `text/uri-list` and Firefox's
`text/x-moz-url`, so it drops into tabs, bookmarks and other apps as a link.

**Safe by default.** Every URL is resolved to an absolute one and checked: only `https:`,
`http:`, `mailto:` and `tel:` are allowed (`protocols` changes that), so `javascript:` and
`data:` links are never copied or pasted. User names and passwords in a URL are always
removed. International domains are written in punycode, so a lookalike domain shows as
one. Titles are cleaned of hidden and reordering characters and capped at 300 characters
(`maxTitleLength`), and all HTML is escaped. Invalid input is a typed `invalid-payload` error.

**Tracking parameters removed.** `clean: true` (or `cleanLinkUrl(url)`) removes `utm_*`,
`fbclid`, `gclid`, `msclkid` and other click trackers, and keeps every other parameter and
the `#section`. `clean: { params, keep }` sets your own list.

```ts
import { cleanLinkUrl, linkPayload, resolveLink } from "react-smart-copy/link";

cleanLinkUrl("https://shop.example/p/42?utm_source=news&color=red#reviews");
// "https://shop.example/p/42?color=red#reviews"

linkPayload(anchorElement); // an <a>: its resolved href and its text
```

**Links to a passage.** `textFragmentUrl` makes a link that scrolls to a passage and
highlights it (`#:~:text=`), in Chrome, Edge, Safari and Firefox. Other browsers open the
page as usual. `selectionLink()` links to what the reader has selected, with the page title
and the quote, ready for `linkPayload`. Passing a function to `copy` turns an invalid link into an
`invalid-payload` error state rather than an exception:

```tsx
import { linkPayload, selectionLink, textFragmentUrl } from "react-smart-copy/link";

<button onClick={() => { const link = selectionLink(); if (link) void copy(() => linkPayload(link)); }}>Copy link to selection</button>

textFragmentUrl("https://example.com/docs#install", "npm install react-smart-copy");
// "https://example.com/docs#install:~:text=npm%20install%20react%2Dsmart%2Dcopy"
```

Long passages link by their first and last words, each taken from within one paragraph,
as the syntax requires. When the passage appears more than once on the page, the words
around it are added so the link finds the right one.

**Pasting links.** `pasteAsLink` turns selected text into a link when a URL is pasted over
it, as GitHub, Slack and Notion do. It writes `[selection](url)` by default (`format`
changes that) and keeps the browser's undo. Every other paste is left alone.
`readLink(result)` reads the one link a paste or drop holds, with its title, from
`text/uri-list`, a single `<a>` or a single URL, or returns `null`.

```tsx
import { pasteAsLink, readLink } from "react-smart-copy/link";

<textarea onPaste={pasteAsLink} />

usePaste({ accept: ["text", "html", "text/uri-list"], onPaste: (result) => {
  const link = readLink(result);
  if (link) addBookmark(link.url, link.title);
} });
```

| Option | Default | Notes |
| ------ | ------- | - |
| `text` | `"url"` | plain text: `"url"`, `"title"`, `"title-and-url"` or `"markdown"` |
| `target` | clipboard | `"drag"` adds `text/uri-list` and `text/x-moz-url` |
| `clean` | `false` | `true`, or `{ params, keep }` |
| `protocols` | `https:`, `http:`, `mailto:`, `tel:` | allowed schemes |
| `base` | the page's address | resolves relative links; needed on the server |
| `maxTitleLength` | 300 | |
| `maxWords` / `contextWords` | 10 / 4 | text fragments |

## Copy styled content: paste it as it looks

Copy a card, a note, a report or a table from your app and paste it into Gmail, Outlook
or Google Docs, and it usually comes out wrong. The classes and stylesheets it depended on
don't travel. Modern CSS colours like Tailwind's `oklch()` mean nothing to mail clients.
Light text from a dark theme turns invisible on a white page. Relative links and images
break. And the browser's own copy fills the paste with layout CSS and page chrome.
`react-smart-copy/rich` copies what the reader sees, in HTML that every destination keeps.

```tsx
import { useCopy, useCopyInterceptor } from "react-smart-copy";
import { richPayload, richTransform } from "react-smart-copy/rich";

const { copy } = useCopy();
<button onClick={() => copy(() => richPayload(cardRef.current))}>Copy for email</button>

// Ctrl/⌘+C of any selection inside the article is portable too:
useCopyInterceptor(articleRef, { transform: richTransform() });
```

**What it writes:**

- **Only what's safe and widely supported.** Text, headings, lists, tables, links, images,
  quotes and code. Scripts, event handlers, embeds, SVG, media, forms and controls are left
  out. So are hidden content and anything marked `data-copy-ignore` or `aria-hidden`. Every
  attribute is checked against an allowlist.
- **Styles inline, from what the reader sees.** For content on the page, the computed
  styles are read: colours, fonts, sizes, weight, alignment, borders, padding, list markers.
  They are written only where they change, so the HTML stays small. Layout CSS (`flex`,
  `grid`, `position`) is never copied, because no destination keeps it.
- **Colours every mail client understands.** Every colour, from `oklch()`, `color()`,
  `rgb(… / 50%)` or a CSS variable, becomes an opaque hex value drawn over its background.
  With `colors: "readable"` (the default), text that would fall under 3:1 contrast where
  it lands, like light text from a dark theme, takes the destination's own colour.
  `"keep"` copies every colour, and `"none"` copies none.
- **Absolute, safe URLs.** Links resolve against the page and keep only `https:`,
  `http:`, `mailto:` and `tel:` (`protocols` changes this). Images keep `https:` and `http:`
  sources with their displayed size as attributes, which Outlook needs. `data:` images
  need `dataImages: true`, because many mail clients block them. `images: "alt"` writes
  their alt text instead, and `images: "drop"` leaves them out.
- **Structure that survives the paste.** Rows sit in table bodies. A block inside a
  paragraph is written inline. Nothing is left where an HTML parser would move it.
- **Readable plain text** for editors and plain fields: lists with bullets or numbers,
  table cells separated by tabs, line breaks kept. `text: (root) => htmlToMarkdown(root).markdown`
  gives Markdown instead.

`prepareRich(source, options)` returns `{ html, text, removed, truncated }`. `removed`
lists what was left out and why (`unsafe-element`, `unsafe-link`, `unreadable-color`,
`hidden`, …), for logs and audits. The source can be an element, a selection `Range`, a
fragment or HTML text. HTML text is parsed inertly, and only its `style` attributes are
read. The output is built in a separate, inert document, so nothing is inserted into your
page and no image loads while it is prepared. `maxElements` (10,000) and `maxLength`
(about 1 MB) bound the work.

The output is property-tested against hostile HTML. [DOMPurify](https://github.com/cure53/DOMPurify)
finds nothing to remove from it, and running the output through again changes nothing.
In Chromium, Firefox and WebKit, the computed styles are checked end to end.

| Option | Default | Notes |
| --- | --- | --- |
| `colors` | `"readable"` | `"keep"`, `"none"` |
| `background` | `"#ffffff"` | where it is pasted, for readability |
| `images` / `dataImages` | `"keep"` / `false` | `"alt"`, `"drop"` |
| `styles` | `"computed"` on the page, `"inline"` otherwise | `"none"` |
| `ignore` | none | a CSS selector to leave out |
| `base` / `protocols` | the page / `https:`, `http:`, `mailto:`, `tel:` | links |
| `maxElements` / `maxLength` | 10,000 / 1,000,000 | then `truncated` |
| `text` | readable plain text | your own, such as Markdown |

### Paste into a rich-text editor

The other way round: paste from Google Docs, Word, Outlook, Gmail or a web page into your
editor, and get the content without the mess. Docs marks bold with `font-weight: 700` on
spans inside a `<b>` that isn't bold. Word writes lists as paragraphs with `mso-list`
styles and hides the bullets in spans. Mail wraps everything in layout tables. And every
source brings its fonts, colours and classes, which fight your editor's look.
`pasteToRich` turns all of it into clean, semantic HTML.

```tsx
import { pasteAsRich, pasteToRich } from "react-smart-copy/rich";

// A contenteditable element: inserted with undo intact
<div contentEditable onPaste={pasteAsRich} />

// TipTap / ProseMirror: clean it before the editor parses it
useEditor({ editorProps: { transformPastedHTML: (html) => pasteToRich({ html })?.html ?? html } });

// Lexical: clean, then let Lexical import it
editor.registerCommand(PASTE_COMMAND, (event) => {
  const pasted = pasteToRich({ html: event.clipboardData?.getData("text/html") });
  if (pasted?.source !== "html") return false;
  editor.update(() => $insertNodes($generateNodesFromDOM(editor, new DOMParser().parseFromString(pasted.html, "text/html"))));
  return true;
}, COMMAND_PRIORITY_HIGH);

// A comment box: only what its toolbar has, and all of the text
pasteToRich(result, { formats: ["bold", "italic", "link", "list"] });
```

**What it writes:**

- **Semantic markup only.** Paragraphs, headings, lists, quotes, code blocks, tables, rules,
  links and images, with `<strong>`, `<em>`, `<u>`, `<s>`, `<code>`, `<sup>` and `<sub>`.
  Formatting set by CSS becomes these tags, and CSS wins over tags, as in the browser.
  Every style, class and id is left out, so pasted content takes your editor's look.
- **Real structure from Word and Docs.** Word's list paragraphs become nested lists with
  their numbering. Docs' wrappers, paragraphs inside list items and lists nested beside
  their items are put right. Layout tables from mail become their content; data tables
  keep their sections, merged cells and captions. Code from editors and `<pre>` keeps its
  lines and indentation.
- **Canonical.** The same content always gives the same HTML: links outermost, then formats
  in a fixed order, each over the longest stretch it covers. Whitespace collapses as the
  browser shows it. Cleaning the output again changes nothing.
- **Safe.** The same sanitizer as `prepareRich`: allowlisted elements and attributes, links
  and images with absolute, scheme-checked URLs. Google and Outlook Safe Links redirects
  are unwrapped to their destination. Relative links have no address to resolve against,
  so they keep their text, unless you give `base`. `removed` reports scripts, embeds, unsafe
  links and images left out; it doesn't report what every clipboard document carries (its
  head, Office markup).
- **`formats`** limits the output to what your editor holds. Nothing is lost: a heading
  becomes a bold paragraph, a list item a paragraph after its marker, a table its cells, a
  code block its lines, an image its alt text.

`pasteToRich(source, options)` takes `{ html, text }` (a `PasteResult` from `usePaste`
fits) and returns `{ html, text, removed, truncated, source }`, or `null` when there is
nothing to paste. Plain text becomes paragraphs and line breaks (`source: "text"`), and
needs no DOM, so it works on a server too. `pasteAsRich(event, options)` handles a paste
into a `contenteditable` element and leaves plain-text pastes to the browser; `onPaste`
sees the result first, and returning `false` lets you insert it yourself. `maxNodes`
(200,000), `maxElements` and `maxLength` bound the work, and HTML is read up to 16 MiB.

It is property-tested against generated Docs, Word, mail and hostile HTML. It writes only
allowlisted markup, and DOMPurify finds nothing to remove. Every visible character is kept,
with the bold, italic, underline, strikethrough, code, superscript and subscript it showed.
And cleaning twice changes nothing.

A note for sites that collect Content Security Policy reports. Pasted HTML is parsed in an
inert document, where scripts and handlers never run. Since Chromium 156, though, parsing an
inline handler there (`<img onerror=…>` from a web page) under a policy that blocks inline
handlers sends a `script-src-attr` report, whose target is the document rather than an element.
Every HTML sanitizer that parses in the browser triggers it, and nothing is blocked that would
have run ([w3c/webappsec-csp#824](https://github.com/w3c/webappsec-csp/issues/824)).

## Copy and paste colours

`react-smart-copy/color` is for design-system docs, colour pickers, theme editors and
design tools. It reads and writes every CSS Color 4 notation, without dependencies.
About 6.5 kB in total; `parseColor` with `formatColor` is about 5.3 kB.

```tsx
import { useCopy } from "react-smart-copy";
import { colorPayload, pasteAsColor } from "react-smart-copy/color";

const { copy } = useCopy();
<button onClick={() => copy(() => colorPayload(token.value, { format: "oklch" }))}>Copy</button>
// Text: "oklch(62.31% 0.18801 259.81)". Docs, Notion, Slack and mail also get a swatch.

<input value={hex} onChange={…} onPaste={(event) => pasteAsColor(event, { format: "hex" })} />
// Pasting "rgb(59 130 246)" or "background: #3b82f6;" inserts "#3b82f6".
```

**Every format, both ways.** `parseColor` reads hex (3, 4, 6 and 8 digits), the 148 named
colours and `transparent`, `rgb()` and `hsl()` (both syntaxes), `hwb()`, `lab()`, `lch()`,
`oklab()`, `oklch()`, and `color()` in `srgb`, `srgb-linear`, `display-p3`, `xyz`, `xyz-d65`
and `xyz-d50`, with every angle unit, percentages and `none`. It returns `null` for
anything else and never throws. `formatColor(color, format)` writes `hex`, `rgb`, `hsl`,
`hwb`, `oklch`, `oklab`, `lab`, `lch` or `p3`. Its default precision brings every 8-bit
colour back exactly; this was checked on 836,056 colours.

**Wide gamut done right.** A Display P3 or OKLCH colour outside sRGB stays exact until a
format needs it in sRGB. Then it is gamut-mapped as CSS Color 4 specifies: lightness and
hue are kept and chroma is reduced, so a vivid P3 red becomes the closest sRGB red, not an
orange. `gamut: "clip"` clips each channel instead, as most browsers draw. `inGamut` and
`toGamut` are exported.

**Pasting.** `readColor(text)` reads the one colour in pasted text. That includes a
declaration copied from a stylesheet or developer tools: `color: #3b82f6;`,
`--brand: oklch(…) !important;`. `bareHex: true` also reads `3b82f6`; it is off by default,
because words like "decade" are hex. `pasteAsColor` is a paste handler for colour fields
that keeps the browser's undo.

**Contrast.** `contrastRatio(text, background)` is the WCAG 2 ratio. Translucent colours
are drawn the way a browser draws them, and the ratio is never rounded, so 4.499 fails.
`contrastLevel(ratio, { large })` gives `AAA`, `AA` or `fail`.

```ts
import { contrastLevel, contrastRatio, formatColor, parseColor } from "react-smart-copy/color";

formatColor("color(display-p3 1 0 0)", "hex");  // "#ff0b0c": mapped, not clipped
formatColor("#3b82f6", "hsl", { legacy: true }); // "hsl(217.22, 91.22%, 59.8%)"
contrastLevel(contrastRatio("#767676", "#fff")); // "AA" (4.54)
parseColor("hsl(1turn 100% 50% / 50%)");          // { r: 1, g: 0, b: 0, alpha: 0.5 }
```

| Option (`formatColor`, `colorPayload`) | Default | Notes |
| --- | --- | --- |
| `format` | `"hex"` | `colorPayload` only |
| `gamut` | `"map"` | `"clip"` |
| `legacy` | `false` | comma syntax for `rgb` and `hsl` |
| `uppercase` | `false` | hex digits |
| `precision` | per format | decimal places |
| `swatch` | `true` | `colorPayload` only |

Accuracy is property-tested against [culori](https://culorijs.org) for every notation and
format. In Chromium, Firefox and WebKit, colours are also checked against the browser's
own CSS parser.

## Share, or copy the link

`react-smart-copy/share` is one button that does the right thing on every device: the
share sheet on phones and tablets, where people expect it, and a copied titled link on
desktop. `useShare` comes from `react-smart-copy`; without React, use
`shareOrCopy` from `react-smart-copy/share` (about 4.4 kB).

```tsx
import { useShare } from "react-smart-copy";

function ShareButton({ url, title }: { url: string; title: string }) {
  const { share, status, method } = useShare({ clean: true });
  return (
    <button type="button" onClick={() => void share({ url, title })}>
      {status === "copied" ? "Link copied" : status === "shared" ? "Shared" : method === "native" ? "Share…" : "Copy link"}
    </button>
  );
}
```

**Honest outcomes.** `share()` never rejects. It resolves to `shared`, `copied` (with a
`reason`: `preferred`, `unsupported` or `fallback`), `cancelled` or `error`. Closing the
share sheet is `cancelled`, and the status goes back to `idle`: it is not an error, and it
never triggers a surprise copy. When the share sheet fails for another reason (an iframe
without the `web-share` permission, content it rejects), the link is copied instead.
`fallback: false` reports the error instead. `describeShareError(error, method)` gives a
sentence for each.

**Labelled correctly.** `method` says what the button will do, `"native"` or `"copy"`, so
the label can say "Share…" or "Copy link". It is `"copy"` during server rendering and
hydration, so there is no mismatch. Then it follows the device, including a tablet that
gets a keyboard and a mouse.

| `mode` | What happens |
| ------ | ------------ |
| `"auto"` (default) | the share sheet on touch-first devices (`(hover: none) and (pointer: coarse)`), copy elsewhere |
| `"native"` | the share sheet wherever the browser has one (also desktop Safari, and Edge and Chrome on Windows and macOS) |
| `"copy"` | always copy |

**What is shared.** `url`, `title`, `text` and `files`. The URL is checked like every link
in `react-smart-copy/link`: only safe schemes, with credentials removed, and tracking
parameters removed with `clean: true`. The title is cleaned of hidden characters. Files go
only to a share sheet that accepts them (`navigator.canShare`); otherwise the link is
copied. The copy is a titled link (`linkPayload`), or the text when there is no URL.
`copy` sets your own.

Without React, `shareOrCopy(content, options)` resolves to the same outcomes, and
`shareMethod(options)` says how it would share:

```ts
import { shareOrCopy } from "react-smart-copy/share";

button.addEventListener("click", async () => {
  const outcome = await shareOrCopy({ url: location.href, title: document.title });
  if (outcome.status === "copied") toast("Link copied");
});
```

Call `share()` directly in the click handler. The share sheet needs the click's user
activation, so don't `await` anything before it.

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
- Application data is never matched by a wildcard either: web custom formats (`'web application/vnd.acme.rows+json'`)
  and `+json` types must be listed exactly, and arrive as strings. `clipAccept()` lists them for you
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

`react-smart-copy/core` is framework-agnostic and safe to import anywhere, and so is every other
entry point (`/table`, `/markdown`, `/rich`, ...): only the main entry imports React, and the build
checks that no other entry reaches it.

All entry points share one copy of the core. Using several of them loads it once, and a
`CopyFailure` from any of them is an `instanceof` the one exported by `react-smart-copy` and
`react-smart-copy/core`.

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
Firefox 125+) or `read()` for images (Chromium 86+, Safari 13.1+, Firefox 127+). Web custom formats
(`react-smart-copy/structured`'s first carrier) need Chromium 104+; elsewhere the HTML carrier is used. Check MDN for
embedded webviews. Where a capability is missing you get a typed error, never a silent success.

## Roadmap

- ~~**0.2** `usePaste`, `<CopyGroup>`, SVG/DOM capture~~ shipped
- ~~**1.0** Frozen API, SSR / security / accessibility audit~~ shipped
- ~~**1.1** `PasteField`~~ shipped
- ~~**1.2** Paste `retry()`, cancellation with `AbortSignal`, `PasteField.Preview`~~ shipped
- ~~**1.3** `onReset` / `onCancel` callbacks, UTF-8 `maxBytes` on every paste path, `PasteResult.imageFiles`~~ shipped
- ~~**1.4** Drag-and-drop through the paste pipeline: `dropTargetProps`, `isDragOver`, droppable `PasteField.Zone`~~ shipped
- ~~**1.6** `react-smart-copy/testing` — mock adapters and result builders so consumer tests stay green across releases~~ shipped
- ~~**1.7** `useCopyInterceptor` / `registerCopyInterceptor` — attribution, redaction and no-copy zones for native Ctrl/⌘+C~~ shipped
- ~~**1.8** `useDragCopy` / `registerDragCopy` — populate `DataTransfer` on drag-start; no Clipboard API needed~~ shipped
- ~~**1.9** `react-smart-copy/table` — Excel- and Sheets-ready copy and paste, AG Grid and TanStack Table adapters, typed record import~~ shipped
- ~~**1.10** `react-smart-copy/structured` — typed, versioned, validated application data on the clipboard~~ shipped
- ~~**1.11** `react-smart-copy/markdown` — paste rich content as Markdown, with undo intact~~ shipped
- ~~**1.12** `react-smart-copy/code` — copy code blocks and sessions cleanly, paste code safely, detect Trojan Source and homoglyphs~~ shipped
- ~~**1.13** `react-smart-copy/image` — pasted images without location or camera metadata, fitted to size and byte limits~~ shipped
- ~~**1.14** `react-smart-copy/link` — links that paste well everywhere, links to a passage, tracking parameters removed, paste a URL over text to make a link~~ shipped
- ~~**1.15** `react-smart-copy/share` — the share sheet on phones, a copied titled link everywhere else, with honest outcomes~~ shipped
- ~~**1.16** `react-smart-copy/color` — copy and paste colours in every CSS format, CSS gamut mapping, WCAG contrast~~ shipped
- ~~**1.17** `react-smart-copy/rich` — styled content that pastes as it looks in mail, Docs, Word and Slack, for buttons and Ctrl/⌘+C~~ shipped
- ~~**1.18** One shared copy of the core across entry points: smaller bundles when you use several modules, and one `CopyFailure` class~~ shipped
- ~~**1.19** `react-smart-copy/rich`, paste side: paste from Word, Google Docs and web pages into rich-text editors as clean, safe HTML~~ shipped
- ~~**1.20** `react-smart-copy/files` — take pasted and dropped files and folders safely: types from content, risky files rejected, safe names, limits~~ shipped
- ~~**1.21** `react-smart-copy/secrets` — find and redact API keys, tokens, private keys, passwords, cards and IBANs in pastes and copies~~ shipped
- ~~**1.22** `react-smart-copy/otp` and `useOtpField` — one-time code fields filled by typing, pasting, SMS autofill and WebOTP, and codes read from pasted messages~~ shipped
- ~~**1.23** `react-smart-copy/number` — numbers and amounts pasted and copied exactly in any locale's format, with currencies, percent and accounting negatives~~ shipped

Full history: [CHANGELOG.md](./CHANGELOG.md) or the [Releases page](https://suprabhat02.github.io/react-smart-copy/project/releases/).

## Development

```bash
npm install
npm run verify      # lint, types, tests at 100% coverage, build, publint + attw, consumer types, size budgets
npm run changeset   # describe your change for the changelog
npm run docs:install  # once: the docs site has its own lockfile, in docs/
npm run docs:dev      # the docs, with live demos, at http://localhost:4321/react-smart-copy/
npm run docs:build && npm run test:e2e  # end-to-end tests in Chromium, Firefox and WebKit
```

Releases are automated: merging the "chore: release" PR publishes to npm through
trusted publishing with provenance. No long-lived npm token is stored in the repo.

## Security

Clipboard content is untrusted input, and this package treats it that way: pasted HTML
is parsed inertly, URLs are scheme-checked, hidden characters are reported, and image
metadata is verified as removed. Report vulnerabilities privately as described in
[SECURITY.md](./SECURITY.md). Releases carry npm provenance (`npm audit signatures`
verifies them), and CodeQL and the OpenSSF Scorecard run on every change. Each GitHub release
(from 1.15.0 on) also holds the exact tarball npm serves, with a Sigstore attestation that it was
built by this repository's release workflow:

```bash
v=$(npm view react-smart-copy version)
gh release download "v$v" -R suprabhat02/react-smart-copy -p '*.tgz'
gh attestation verify "react-smart-copy-$v.tgz" -R suprabhat02/react-smart-copy
```

## Support

If react-smart-copy saves you time, [star it on GitHub](https://github.com/suprabhat02/react-smart-copy):
it helps other React developers find it. Bugs and ideas are welcome in
[issues](https://github.com/suprabhat02/react-smart-copy/issues); see [CONTRIBUTING.md](./CONTRIBUTING.md).

## Author

Built and maintained by [Suprabhat Kumar](https://suprabhat-dev.com/), a frontend
engineer working on React, TypeScript and accessible UI.

## License

MIT

---

<p align="center">Made with ❤️ from 🇮🇳</p>
