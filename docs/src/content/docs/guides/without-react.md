---
title: "Without React"
description: "The framework-agnostic core and every opt-in entry point work without React."
---

Everything under the hooks is framework-agnostic and lives in `react-smart-copy/core`: use it from Vue, Svelte, Solid, web components or plain scripts.

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
