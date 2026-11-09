---
title: "Accessibility"
description: "Announcements, focus, reveal and keyboard support built in, and what is left to you."
---

Accessibility is built in, not added on. Here is what you get without writing any of it:

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

## With your own button

`CopyField` does all of the above. With `useCopy` and your own button, the announcement is
yours: render a `LiveRegion` (it is always mounted, visually hidden, `role="status"`) and give
it a message for the outcome. Keep the button's own label stable.

```tsx
import { describeCopyError, LiveRegion, useCopy } from "react-smart-copy";

function CopyInvoice({ invoiceId }: { invoiceId: string }) {
  const { copy, status, error } = useCopy();
  const message = status === "copied" ? "Invoice number copied" : error ? describeCopyError(error) : "";
  return (
    <>
      <button type="button" onClick={() => void copy(invoiceId)}>
        Copy invoice number
      </button>
      <LiveRegion message={message} />
    </>
  );
}
```

The message is empty while idle and while copying, so a second copy is announced again.
`describeCopyError` gives a sentence a user can act on for every
[error type](/react-smart-copy/reference/errors/). This snippet is a test in the repository
(`test/docs-snippets.test.tsx`).

