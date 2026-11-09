---
'react-smart-copy': patch
---

Line breaks marked `aria-hidden` are kept. Slack marks every line break that way, and pasting a Slack message with `pasteToRich` (or copying one with `prepareRich` or `codeFromElement`) joined its lines: `…/runs/42npm run build`. `aria-hidden` keeps a decoration from screen readers; on a `<br>` it hides nothing on screen, so the lines now stay apart. Other `aria-hidden` content is still left out.
