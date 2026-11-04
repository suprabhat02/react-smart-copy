---
'react-smart-copy': minor
---

Clipboard permission: `readClipboardPermission`, `watchClipboardPermission` (in `react-smart-copy/core`) and the `useClipboardPermission` hook tell you whether the browser will let the page read or write the clipboard, so a blocked paste button can say what to do instead of failing. The state is `granted`, `prompt`, `denied` or `unsupported`; Firefox and Safari have no such permission to query and say `unsupported`, which is not a refusal. It never reads the clipboard and never shows a prompt.
