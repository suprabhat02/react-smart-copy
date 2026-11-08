---
'react-smart-copy': patch
---

`CopyField` and `PasteField` now use the clipboard of the window they are rendered in. In a pop-out window (`window.open` plus a React portal), they used the opener's clipboard, which only works while the opener's document has focus, and the click happened in the pop-out. An adapter you pass in `copyOptions` or `pasteOptions` still wins. The docs show how to do the same with `useCopy` and `usePaste`. Also tested: drag-to-copy registered on a web component's host works for drags that start inside its shadow root.
