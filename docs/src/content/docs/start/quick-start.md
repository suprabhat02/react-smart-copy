---
title: "Quick start"
description: "A copy button in a minute, then the component that adds reveal, announcements and retry."
---

A complete copy row in one component. Copy it into your app, then style it with whatever you use.

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
