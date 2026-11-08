---
'react-smart-copy': minor
---

Copy works in embedded apps. A Microsoft Teams tab, a SharePoint web part, a Storybook canvas or any app in a cross-origin iframe without `allow="clipboard-write"` has its async clipboard writes refused by Chromium (`NotAllowedError`), so copy buttons there failed with `permission-denied`. When that happens, the default adapter now copies text, HTML and JSON through the browser's `copy` command while the click is still fresh, as it already does on plain HTTP. When the command cannot help (an image, `legacyFallback: false`, an aborted copy), the browser's own error stands, classified as before. No size change for `useCopy`.
