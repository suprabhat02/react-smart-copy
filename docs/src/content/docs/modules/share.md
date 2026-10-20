---
title: "Share"
description: "One Share button: the share sheet on phones, a copied titled link everywhere else."
---

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
