---
title: "shadcn/ui components"
description: "Copy button, copy field and copy-page button for shadcn/ui, installed with the shadcn CLI: your code, built on react-smart-copy."
---

Three components for [shadcn/ui](https://ui.shadcn.com) projects, installed into your code with the
shadcn CLI. They are built on this library, so the hard parts are done (Safari, plain HTTP,
embedded apps, screen readers, typed errors), and the rest is yours to restyle.

```bash
npx shadcn@latest add https://suprabhat02.github.io/react-smart-copy/r/copy-button.json
```

Or name the registry once in `components.json`, and add by name:

```json
{
  "registries": {
    "@react-smart-copy": "https://suprabhat02.github.io/react-smart-copy/r/{name}.json"
  }
}
```

```bash
npx shadcn@latest add @react-smart-copy/copy-button @react-smart-copy/copy-field @react-smart-copy/copy-page-button
```

The CLI adds `react-smart-copy` to your dependencies, shadcn's `button` (and `input` for the
field) if you do not have them, and the components to `components/`. They need no icon library:
their icons are inline.

**Tested as you will use them.** On every change, CI creates a fresh shadcn project for each
base (Radix, Base UI and React Aria), installs these items with the shadcn CLI, and runs the
project's own type check, lint and build. It then clicks through every component in a real
browser and runs axe (WCAG 2.2 AA). When they were written, every base was also run in Firefox
and WebKit.

## Copy button

```tsx
import { CopyButton } from "@/components/copy-button"

<CopyButton value={invoiceId} label="Copy invoice number" />
<CopyButton value={{ kind: "html", html: summaryHtml, text: summaryText }}>Copy summary</CopyButton>
```

| Prop | Default | What it does |
| --- | --- | --- |
| `value` | required | Text, a payload (HTML, JSON, an image), or a function returning one, run during the click |
| `label` | `"Copy"` | The name of an icon-only button. With visible text, the text is the name and this is the tooltip |
| `copiedMessage` | `"Copied"` | Announced to screen readers after a copy |
| `resetAfterMs` | `2000` | How long the check mark shows |
| `onCopied`, `onCopyError` | | The payload written; the [typed error](/react-smart-copy/reference/errors/) |
| everything else | | Passed to your `Button` (`variant` defaults to `"ghost"`, `size` to `"icon"` without text) |

When a copy fails, the icon becomes a warning, its tooltip says why ("Clipboard access was
blocked…"), and the same sentence is announced. The button's name never changes, so screen
reader and speech-input users always find it by the same name.

## Copy field

```tsx
import { CopyField } from "@/components/copy-field"

<CopyField label="Invite link" value={inviteUrl} description="Anyone with the link can join." />
<CopyField label="API key" value={apiKey} secret />
```

| Prop | Default | What it does |
| --- | --- | --- |
| `label`, `value` | required | The field's name (also in its buttons: "Copy API key"), and what is shown and copied |
| `secret` | `false` | Shown as dots until revealed with the eye button (`aria-pressed`) |
| `hideLabel` | `false` | Keeps the label for screen readers only |
| `description` | | A line under the field, linked with `aria-describedby` |
| `onCopied`, `onCopyError`, `className` | | |

A secret field is kept away from password managers and autofill (`autocomplete="off"` and the
1Password, LastPass and Bitwarden opt-outs): an API key is not a password for your site. Copying
always copies the real value, hidden or not, and focusing a hidden value selects nothing.

## Copy page as Markdown

```tsx
import { CopyPageButton } from "@/components/copy-page-button"

<CopyPageButton ignore=".feedback, .ads" />
```

| Prop | Default | What it does |
| --- | --- | --- |
| `selector` | the page's `<article>`, else its `<main>` | The element to copy. One you give is used alone: if it is not on the page, nothing is copied and the button says so |
| `ignore` | | Elements to leave out, as a CSS selector; `[data-copy-ignore]` always is |
| `title` | the page's `<h1>` | Written as the first heading, unless the copied element has its own `<h1>` |
| everything else | | As for the copy button (`children` defaults to "Copy page") |

Heading permalinks, buttons, forms and hidden elements are left out, and relative links become
absolute. See [Copy a page as Markdown](/react-smart-copy/modules/markdown/#copy-a-page-as-markdown)
for what the conversion does.

## They are your code

Once added, the files are yours: change the icons, the tooltip (for example to shadcn's `Tooltip`),
or the layout. The behaviour lives in the library (`useCopy`, `htmlToMarkdown`), so updating
`react-smart-copy` brings fixes without touching your copies.
