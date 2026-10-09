---
"react-smart-copy": patch
---

Copy interception: `selection.text` now matches what the browser itself would copy

`CopySelection.text` was built from `Range#toString()`, which returns raw DOM text. In real
browsers that meant source indentation, line breaks from your markup and visually hidden text
leaked into rewritten copies, so an attribution transform produced messier text than a plain
Ctrl/⌘+C. It is now read from `Selection#toString()`, which follows the rendered layout. `html`
and `fragment` are unchanged.
