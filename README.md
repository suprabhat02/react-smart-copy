# react-smart-copy

[![npm](https://img.shields.io/npm/v/react-smart-copy)](https://www.npmjs.com/package/react-smart-copy)
[![npm downloads](https://img.shields.io/npm/dm/react-smart-copy)](https://www.npmjs.com/package/react-smart-copy)
[![CI](https://github.com/suprabhat02/react-smart-copy/actions/workflows/ci.yml/badge.svg)](https://github.com/suprabhat02/react-smart-copy/actions/workflows/ci.yml)
[![CodeQL](https://github.com/suprabhat02/react-smart-copy/actions/workflows/codeql.yml/badge.svg)](https://github.com/suprabhat02/react-smart-copy/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/suprabhat02/react-smart-copy/badge)](https://scorecard.dev/viewer/?uri=github.com/suprabhat02/react-smart-copy)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![React 18+](https://img.shields.io/badge/React-18%2B-61dafb)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)](https://www.typescriptlang.org)

**[Documentation and live demos](https://suprabhat02.github.io/react-smart-copy/)**

Headless, type-safe **clipboard interactions** for React. Not just a clipboard call: the
whole interaction around it (copying, copied, failed, retry, pasting) with honest errors,
hover, focus and touch reveal, and screen-reader announcements built in. Around that core,
opt-in modules handle what people actually copy and paste: spreadsheet ranges, code, rich
text, images, files, secrets, one-time codes, amounts, e-mail recipients, links and colours.

```
Email   shubh@example.com   [Copy]      →   Copied ✓
Phone   +91 98xxx xxxxx     [Copy]
ID      PLT-29018           [Copy]
```

- **Small.** About 3.4 kB for `useCopy` (min + brotli), zero runtime dependencies, and every
  module is a separate entry point that shares one copy of the core.
- **Honest.** Every failure is a typed, classified error. Nothing silently does nothing.
- **Accessible.** Real buttons, accessible names, polite announcements, reduced motion, and
  everything the docs render checked with axe in real browsers.
- **Unstyled.** Works with Tailwind, CSS modules, CSS-in-JS, shadcn, MUI and Ant Design.
- **Safe on servers.** SSR and Next.js App Router safe, React 18 and 19, StrictMode-proof.
- **Safe with hostile input.** Every parser caps its input and runs in linear time.
- **Tested in real engines.** Chromium, Firefox and WebKit on every change, 100% test
  coverage, and property tests for every parser and serialiser.

## Install

```bash
npm install react-smart-copy
```

Works with React 18 and 19 and TypeScript 5.0 or later (the published types are checked on
5.0, 6 and 7 in CI). React is an optional peer: every entry point except the main one runs
without it, in browsers and in Node.js 18 or later.

## Quick start

A copy button, with everything around it:

```tsx
import { CopyField } from "react-smart-copy";

export function ContactRow() {
  return (
    <CopyField.Root value="shubh@example.com" label="Email" className="group flex items-center gap-3">
      <CopyField.Label className="w-20 text-sm text-gray-500" />
      <CopyField.Value className="font-mono" />
      <CopyField.Trigger className="opacity-0 group-data-[revealed]:opacity-100 focus-visible:opacity-100">
        {({ displayStatus }) => (displayStatus === "copied" ? "Copied ✓" : displayStatus === "error" ? "Retry" : "Copy")}
      </CopyField.Trigger>
    </CopyField.Root>
  );
}
```

That one component gives you a real `<button type="button">` named "Copy Email". It is
revealed on mouse hover, keyboard focus and touch, and always visible on devices that can't
hover. It announces "Copied to clipboard" politely to screen readers, ignores double-clicks,
and returns to idle after 2 seconds.

Just the hook:

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

`copy()` never rejects: it resolves to an outcome you can branch on. Pasting is the other
half, with the same honest states, from a button, Ctrl/⌘+V, or a drop:

```tsx
import { describePasteError, usePaste } from "react-smart-copy";

function AvatarDrop() {
  const { paste, state, targetProps, dropTargetProps } = usePaste<HTMLDivElement>({
    accept: ["image"],
    onPaste: (result) => void upload(result.images[0]),
  });
  return (
    <div {...targetProps} {...dropTargetProps} tabIndex={0}>
      Drop an image, press Ctrl/⌘+V, or <button onClick={() => void paste()}>Paste</button>
      {state.status === "error" && <p role="alert">{describePasteError(state.error, state.source)}</p>}
    </div>
  );
}
```

More in the docs: [`useCopy`](https://suprabhat02.github.io/react-smart-copy/copy/use-copy/),
[`CopyField`](https://suprabhat02.github.io/react-smart-copy/copy/copy-field/),
[payloads](https://suprabhat02.github.io/react-smart-copy/copy/payloads/),
[native Ctrl/⌘+C](https://suprabhat02.github.io/react-smart-copy/copy/native-copy/),
[drag to copy](https://suprabhat02.github.io/react-smart-copy/copy/drag-to-copy/),
[`usePaste`](https://suprabhat02.github.io/react-smart-copy/paste/use-paste/) and
[`PasteField`](https://suprabhat02.github.io/react-smart-copy/paste/paste-field/).

## What it can and cannot copy

This package only promises what browsers actually support.

| Content | Supported | Notes |
| --- | --- | --- |
| Plain text | ✅ | Everywhere with the async Clipboard API |
| Rich HTML | ✅ | Always with a plain-text fallback; degrades to text without `ClipboardItem` |
| Images | ✅ PNG only | `image/png` is the only format with reliable cross-browser write support |
| JSON, your own typed data | ✅ | As text, or as a web custom format with `react-smart-copy/structured` |
| Several formats at once | ✅ | `kind: 'multi'`; each type is checked with `ClipboardItem.supports()` first |
| SVG and UI | ✅ as PNG | `react-smart-copy/capture`; for HTML elements, bring a rasteriser |
| Files (PDF, DOCX, ZIP) | ❌ | Not writable to the system clipboard by any browser API |
| Anything over plain HTTP | ❌ | The Clipboard API needs HTTPS or `localhost`: you get an `insecure-context` error |

## Modules

Import only what you use. Each entry point is separate, and they share one copy of the core.
Sizes are minified and brotli-compressed, for everything the entry point exports.

| Entry point | What it is for | Size |
| --- | --- | --- |
| [`react-smart-copy`](https://suprabhat02.github.io/react-smart-copy/start/introduction/) | React hooks and components: `useCopy`, `usePaste`, `CopyField`, `PasteField`, `CopyGroup`, `useCopyInterceptor`, `useDragCopy`, `useShare`, `useOtpField` | from 3.4 kB |
| [`/core`](https://suprabhat02.github.io/react-smart-copy/guides/without-react/) | The framework-agnostic machines and adapters | 8.3 kB |
| [`/capture`](https://suprabhat02.github.io/react-smart-copy/copy/capture/) | Copy an `<svg>` or a piece of your UI as a PNG | 3.4 kB |
| [`/table`](https://suprabhat02.github.io/react-smart-copy/modules/tables/) | Ranges that paste into Excel and Google Sheets as cells, and back as typed records | 5.6 kB |
| [`/structured`](https://suprabhat02.github.io/react-smart-copy/modules/structured/) | Your own typed, versioned, validated objects on the clipboard | 3.5 kB |
| [`/markdown`](https://suprabhat02.github.io/react-smart-copy/modules/markdown/) | Paste from Docs, Word and web pages as clean Markdown | 7.7 kB |
| [`/code`](https://suprabhat02.github.io/react-smart-copy/modules/code/) | Code blocks and sessions copied cleanly; Trojan Source and lookalike checks | 7.5 kB |
| [`/image`](https://suprabhat02.github.io/react-smart-copy/modules/images/) | Pasted photos without location or camera data, within size limits | 7.3 kB |
| [`/files`](https://suprabhat02.github.io/react-smart-copy/modules/files/) | Pasted and dropped files and folders, typed by content, with safe names | 7.0 kB |
| [`/secrets`](https://suprabhat02.github.io/react-smart-copy/modules/secrets/) | Keys, tokens, passwords, cards and IBANs kept out of pastes and copies | 4.1 kB |
| [`/otp`](https://suprabhat02.github.io/react-smart-copy/modules/otp/) | One-time codes from pasted messages, SMS autofill and WebOTP | 3.6 kB |
| [`/number`](https://suprabhat02.github.io/react-smart-copy/modules/numbers/) | Numbers and amounts in any locale's format, read and written exactly | 3.5 kB |
| [`/email`](https://suprabhat02.github.io/react-smart-copy/modules/email/) | Lists of e-mail recipients from Outlook, Gmail and spreadsheets, checked | 2.8 kB |
| [`/link`](https://suprabhat02.github.io/react-smart-copy/modules/links/) | Links that paste titled, links to a passage, tracking removed | 4.1 kB |
| [`/rich`](https://suprabhat02.github.io/react-smart-copy/modules/rich-text/) | Styled content that pastes as it looks in mail and docs, and clean pastes into editors | 16.7 kB |
| [`/color`](https://suprabhat02.github.io/react-smart-copy/modules/colors/) | Colours in every CSS format, with gamut mapping and contrast | 6.6 kB |
| [`/share`](https://suprabhat02.github.io/react-smart-copy/modules/share/) | The share sheet on phones, a copied link everywhere else | 4.8 kB |
| [`/testing`](https://suprabhat02.github.io/react-smart-copy/guides/testing/) | Mock adapters and result builders for your tests | 0.7 kB |

A taste of each:

```tsx
import { fromRows, tablePayload } from "react-smart-copy/table";
copy(() => tablePayload(fromRows(invoices, [{ header: "Invoice", value: "id" }, { header: "Amount", value: "amount" }])));
```

```tsx
import { pasteAsMarkdown } from "react-smart-copy/markdown";
<textarea value={body} onChange={(event) => setBody(event.target.value)} onPaste={pasteAsMarkdown} />;
```

```ts
import { prepareImage } from "react-smart-copy/image";
const image = await prepareImage(file, { maxWidth: 2048, maxBytes: 1_000_000 }); // GPS and camera data removed
```

```tsx
import { pasteWithoutSecrets } from "react-smart-copy/secrets";
<textarea onPaste={(event) => pasteWithoutSecrets(event, { onSecrets: (found) => toast(`Removed a ${found[0].label}.`) })} />;
```

```ts
import { parseNumber } from "react-smart-copy/number";
parseNumber("1.234,50 €"); // { value: 1234.5, exact: "1234.50", currency: { symbol: "€", code: "EUR" }, … }
```

```ts
import { parseAddresses } from "react-smart-copy/email";
parseAddresses('Lima, Ana <ana@example.com>; bo@ex\u0430mple.com'); // two addresses, the second flagged as a lookalike
```

```tsx
import { useOtpField } from "react-smart-copy";
const otp = useOtpField({ length: 6, onComplete: verify });
// {Array.from({ length: 6 }, (_, index) => <input key={index} {...otp.getInputProps(index)} />)}
```

```tsx
import { linkPayload } from "react-smart-copy/link";
copy(() => linkPayload({ url: issue.url, title: issue.title }, { clean: true })); // titled in Slack, Docs and Notion
```

## Production notes

- **Tree-shaking.** The package is ESM and CommonJS, `sideEffects: false`, with one entry
  point per module. A bundler keeps only what you import. Shared code (the copy and paste
  core, `CopyFailure`) is emitted once and shared by every entry point.
- **Client boundary.** Only the React entry is a client module (`"use client"`). Server code
  can import every other entry point, and the parsers (`/number`, `/email`, `/secrets`,
  `/otp`, `/table`, `/markdown`, `/code`) work the same on a server.
- **Types.** Strict TypeScript with `exactOptionalPropertyTypes`, explicit types on every
  export, and declarations checked by consumers on TypeScript 5.0, 6 and 7 with both
  `bundler` and `node16` resolution.
- **Hostile input.** Every parser caps its input and runs in linear time. The limits are listed
  in [Performance and limits](https://suprabhat02.github.io/react-smart-copy/guides/performance/).
- **Supply chain.** No runtime dependencies. Releases are published from CI with npm
  provenance, and each GitHub release carries the signed tarball.

## Guides

- [Next.js and SSR](https://suprabhat02.github.io/react-smart-copy/guides/ssr/)
- [Accessibility](https://suprabhat02.github.io/react-smart-copy/guides/accessibility/)
- [Security](https://suprabhat02.github.io/react-smart-copy/guides/security/)
- [Performance and limits](https://suprabhat02.github.io/react-smart-copy/guides/performance/)
- [Testing your app](https://suprabhat02.github.io/react-smart-copy/guides/testing/)
- [Custom adapters](https://suprabhat02.github.io/react-smart-copy/guides/custom-adapters/)
- [Without React](https://suprabhat02.github.io/react-smart-copy/guides/without-react/)
- [Errors](https://suprabhat02.github.io/react-smart-copy/reference/errors/) and [states](https://suprabhat02.github.io/react-smart-copy/reference/states/)
- [Browser support](https://suprabhat02.github.io/react-smart-copy/start/browser-support/)

## Releases and roadmap

What changed in each version: [CHANGELOG.md](./CHANGELOG.md) or the
[releases page](https://suprabhat02.github.io/react-smart-copy/project/releases/). What comes
next: the [roadmap](https://suprabhat02.github.io/react-smart-copy/project/roadmap/).

## Development

```bash
npm install
npm run verify      # lint, types, tests at 100% coverage, build, package and docs checks, size budgets
npm run bench       # parser benchmarks
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
