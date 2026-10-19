---
"react-smart-copy": minor
---

Add `react-smart-copy/link`: copy links that paste well everywhere and link to a passage of a page.

- `linkPayload` copies a titled `<a>` link and the URL, so Slack, Google Docs, Notion, Teams and mail paste the title as a link and editors paste the URL. Plain text can be the URL, the title, both, or Markdown. `{ target: "drag" }` adds `text/uri-list` and `text/x-moz-url` for `useDragCopy`.
- Every URL is resolved and checked: only `https:`, `http:`, `mailto:` and `tel:` by default (never `javascript:` or `data:`), user names and passwords removed, international domains in punycode. Titles are cleaned of hidden and reordering characters, capped, and escaped.
- `cleanLinkUrl` and `clean: true` remove tracking parameters (`utm_*`, `fbclid`, `gclid`, `msclkid` and more) and keep everything else.
- `textFragmentUrl` and `selectionLink` make links that scroll to and highlight a passage (`#:~:text=`), with each term inside one block and context added when the passage repeats.
- `readLink` reads the one link a paste or drop holds, with its title. `pasteAsLink` turns selected text into a link when a URL is pasted over it, keeping the browser's undo.
- No dependencies, about 4 kB; `linkPayload` alone is about 1.8 kB. Works on the server with a `base`.

The README's drag-to-copy example now uses `linkPayload`, which escapes the title and checks the URL.
