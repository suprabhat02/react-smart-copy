---
'react-smart-copy': patch
---

Long numbered lists no longer freeze the page. The plain text written alongside rich HTML (by `pasteToRich`, `prepareRich` and `react-smart-copy/compat`) found each numbered item's place by scanning its whole list again, so a list of n items cost n²: an 8,000-item Word list took 7 seconds in Chrome, and 20,000 items over three minutes in tests. Each list is now numbered once, in linear time (116 ms for those 8,000 items).

The numbers are also the ones a browser shows, checked against Chromium: an item after `<li value="9">` is 10 (it was counted from the list's start), `<ol reversed>` counts down, and a `start` or `value` that is not a number is ignored, where it wrote "NaN.".
