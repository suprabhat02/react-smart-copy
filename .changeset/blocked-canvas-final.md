---
'react-smart-copy': patch
---

Capture and image: when an image from another site blocks the canvas (the browser's `SecurityError`), the failure now says so (CORS), and it is no longer reported as retryable. Trying again cannot change what the other site's server says, so a "Try again" button for it could never work. The error type is still `blob-generation-failed`, so nothing that switches on it breaks.
