---
title: "Performance and limits"
description: "Bundle cost, tree-shaking, and the input limits and linear-time guarantees of every parser in react-smart-copy."
---

Clipboard content comes from anywhere: a 40 MB spreadsheet range, a page of HTML from a mail
client, or text built to make a parser slow. Every part of this package that reads such
content caps how much it reads and runs in linear time. A paste can't freeze your page, and
a server that parses what people send can't be stalled by it.

## Bundle cost

Each module is a separate entry point, and the package is `sideEffects: false`, so a bundler
keeps only what you import. Code the entry points share (the copy and paste core,
`CopyFailure`, the text-field helpers) is emitted once, in shared chunks, so an app that
uses several modules loads the core once.

| You import | Size (min + brotli) |
| --- | --- |
| `useCopy` | 3.4 kB |
| `CopyField` and `CopyGroup` | 5.5 kB |
| `usePaste` | 4.3 kB |
| `PasteField` | 7.0 kB |
| `parseNumber` | 2.2 kB |
| `parseAddresses` | 1.9 kB |
| `extractOtp` | 2.1 kB |
| `scanSecrets` | 3.3 kB |
| `parseTable` and `toRecords` | 2.8 kB |
| Five entry points together (React, rich, markdown, link, color) | 24.6 kB |

Every entry point has a size budget checked on every change, so these numbers can't grow
unnoticed. [Installation](/react-smart-copy/start/installation/) lists every entry point's
full size.

**Load only when needed.** The heavier modules are only needed when something is pasted, so
they can load then:

```tsx
<textarea
  onPaste={async (event) => {
    // React's event outlives the handler; read the data before the first await.
    const html = event.clipboardData.getData("text/html");
    if (html === "") return;
    event.preventDefault();
    const { htmlToMarkdown } = await import("react-smart-copy/markdown");
    insert(htmlToMarkdown(html).markdown);
  }}
/>
```

## Input limits

Each limit has a default you can lower (or raise, where noted) through the module's options.
What goes past a limit is left out and reported, never read slowly.

| Module | What is read | Default limit | Past the limit |
| --- | --- | --- | --- |
| `usePaste`, `PasteField` | A paste or a drop | 32 MiB, 32 items (`maxBytes`, `maxItems`) | `too-large` error |
| `/table` | A pasted range | 32 MiB of text, 100,000 rows, 16,384 columns, 1,000,000 cells | `truncated` |
| `/table` | A copied table | 1,000,000 cells | `too-large` error |
| `/structured` | Your own data | 8 MiB per format (`maxBytes`) | `too-large` error on copy; an invalid clip on paste |
| `/markdown` | Pasted HTML | 16 MiB, 200,000 nodes, depth 200 | `truncated` |
| `/rich` | Pasted HTML | 200,000 nodes | `truncated` |
| `/rich` | Copied HTML | 10,000 elements, about 1,000,000 characters | `truncated` |
| `/code` | Pasted code | 2,000,000 characters; 1,000 findings | `truncated` |
| `/image` | A pasted image | 100 MiB, 100,000,000 pixels before decoding; 30 s | an error, before decoding |
| `/files` | Dropped files | 100 files, 100 MiB each, 1 GiB in all, 8 folder levels | `rejected`, with a reason |
| `/secrets` | Text to scan | 1,000,000 characters | `truncated` |
| `/otp` | A message | 100,000 characters (`OTP_SCAN_LENGTH`) | the rest is not read |
| `/number` | A pasted number | 256 characters (`NUMBER_MAX_LENGTH`) | `null` |
| `/email` | A list of recipients | 100,000 characters, 1,000 entries (`maxAddresses`) | `truncated` |
| `/capture` | SVG markup; output | 10,000,000 characters; 16,777,216 pixels | an error |

## Linear time

Regular expressions are where parsers usually go wrong: a pattern with nested repetition can
take seconds, or hours, on a few kilobytes of text built for it. Every pattern in this
package is written to avoid that. There is no nested or overlapping repetition, and where a
pattern can't be made safe, a plain scan does the work. Each parser's tests include
hostile input at its full limit (long runs of separators, quotes, brackets, `@` signs and
digits) that must be read within a time budget. Property tests feed every parser random
text.

## Measuring

The repository has benchmarks for the parsers people call most:

```bash
git clone https://github.com/suprabhat02/react-smart-copy && cd react-smart-copy
npm install
npm run bench
```

Each benchmark reads typical input and hostile input at the module's limit, so you can see
both the everyday cost and the worst case on your own hardware.
