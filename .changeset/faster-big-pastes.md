---
'react-smart-copy': patch
---

Faster with large inputs, measured in real browsers. Pasting a 10,000-row table from Google Sheets is about 40% faster (in Chromium, 410 ms to 235 ms): cells holding one text node, nearly all of a spreadsheet's, are read without the general walk, and the table parser no longer strips event handler attributes from a document whose nodes never leave it. Copying on plain HTTP no longer lays out the whole payload: a megabyte goes from about 107 ms to 4 ms. Results are unchanged; a property test checks the fast path against the general one.
