---
'react-smart-copy': patch
---

Native copy: a selection that only reaches the edge of a scope no longer gives that scope the copy. Triple-clicking a paragraph ends at the start of the next block, so a higher-priority scope right below (a redaction zone, say) used to take the copy and the paragraph lost its attribution. A scope now takes a selection only when it selects something of it: text, or an image or other embedded element. Redaction is not weakened: selecting even one character of a scope still gives it the copy.
