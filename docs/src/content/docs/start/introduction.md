---
title: "Introduction"
description: "Headless, type-safe clipboard interactions for React: the whole moment around copy and paste, not just the clipboard call."
---

`react-smart-copy` handles the whole interaction around the clipboard, not just the call to it:
copying, copied, failed, retry and pasting, with honest errors, hover, focus and touch reveal,
and screen-reader announcements built in. It is headless, so it fits any design system.

```
Email   shubh@example.com   [Copy]      ->   Copied
Phone   +91 98xxx xxxxx     [Copy]
ID      PLT-29018           [Copy]
```

## Why it exists

`navigator.clipboard.writeText()` is one line. Everything around it is not. A button has to show
that it copied, and then go back. A failed copy needs a reason the person can act on, not a silent
no-op. A screen reader has to hear "Copied". Rich content needs a plain-text fallback. Pasted HTML
from Word or Google Docs is a mess, and pasted photos carry the location they were taken at.
`react-smart-copy` does all of it, and does it the same way in every browser.

## What you get

- **Small.** About 3.5 kB for `useCopy` and 5.6 kB for everything copy (min + brotli). No runtime
  dependencies, and every opt-in entry point costs nothing until you import it.
- **Typed, honest errors.** Every failure is a classified, typed error. Nothing silently no-ops.
- **Accessible.** Announcements, focus handling and keyboard support built in; WCAG 2.2 AA for
  everything the docs render, checked with axe in real browsers.
- **Unstyled.** Works with Tailwind, CSS modules, CSS-in-JS, shadcn, MUI and Ant Design.
- **Safe on servers.** SSR and Next.js App Router safe, React 18 and 19, StrictMode-proof.
- **Tested in real engines.** Chromium, Firefox and WebKit on every change, plus 100% test
  coverage and property tests for every parser and serialiser.

## The parts

| You want to | Use |
| --- | --- |
| Copy text, HTML, images or JSON from a button | [`useCopy`](/react-smart-copy/copy/use-copy/), [`CopyField`](/react-smart-copy/copy/copy-field/) |
| Paste text, HTML or screenshots | [`usePaste`](/react-smart-copy/paste/use-paste/), [`PasteField`](/react-smart-copy/paste/paste-field/) |
| Decide what Ctrl/Cmd+C copies from your page | [`useCopyInterceptor`](/react-smart-copy/copy/native-copy/) |
| Fill the data when people drag content out | [`useDragCopy`](/react-smart-copy/copy/drag-to-copy/) |
| Copy an SVG or part of your UI as a PNG | [`react-smart-copy/capture`](/react-smart-copy/copy/capture/) |
| Copy and paste spreadsheet ranges | [`react-smart-copy/table`](/react-smart-copy/modules/tables/) |
| Copy your own typed objects | [`react-smart-copy/structured`](/react-smart-copy/modules/structured/) |
| Paste rich content as Markdown | [`react-smart-copy/markdown`](/react-smart-copy/modules/markdown/) |
| Copy and paste code safely | [`react-smart-copy/code`](/react-smart-copy/modules/code/) |
| Make pasted images private and small | [`react-smart-copy/image`](/react-smart-copy/modules/images/) |
| Take pasted and dropped files and folders safely | [`react-smart-copy/files`](/react-smart-copy/modules/files/) |
| Keep keys and passwords out of pastes and copies | [`react-smart-copy/secrets`](/react-smart-copy/modules/secrets/) |
| Read pasted one-time codes, and build a code field | [`react-smart-copy/otp`](/react-smart-copy/modules/otp/), `useOtpField` |
| Copy links that paste well | [`react-smart-copy/link`](/react-smart-copy/modules/links/) |
| Copy styled content, or paste into an editor | [`react-smart-copy/rich`](/react-smart-copy/modules/rich-text/) |
| Copy and paste colours | [`react-smart-copy/color`](/react-smart-copy/modules/colors/) |
| A Share button that falls back to copy | [`react-smart-copy/share`](/react-smart-copy/modules/share/) |

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

Next: [install it](/react-smart-copy/start/installation/), then follow the [quick start](/react-smart-copy/start/quick-start/).
