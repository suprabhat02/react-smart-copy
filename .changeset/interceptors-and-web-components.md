---
'react-smart-copy': patch
---

Copy interceptors now work with web components. A scope registered around a component (Shoelace, Ionic, Lightning and similar build their cards and inputs in shadow DOM) used to miss text selected inside it and, worse, an input inside it: a redaction scope around a component's API-key field silently let the key through. The interceptor now follows the copy event's composed path to the real field, matches scopes through shadow roots, and reads selections that Safari and Chromium fold onto the component's host through `getComposedRanges`, nested components included. Closed shadow roots stay private, and a selection that starts outside a component and ends inside it is left to the browser. `useCopyInterceptor` grows by about 0.25 kB.
