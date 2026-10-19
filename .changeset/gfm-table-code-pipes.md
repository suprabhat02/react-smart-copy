---
"react-smart-copy": patch
---

`react-smart-copy/markdown`: inline code in a table cell that holds a backslash before a pipe (such as `a\|b`) no longer breaks the table on GitHub and other GFM renderers. GFM splits table cells before it reads code spans, so a pipe after an odd number of backslashes cannot be written inside one code span. The code is now split around such a pipe, and the cell keeps its exact text. Every other pipe stays inside the code. Table output is now tested against micromark, the reference GFM parser, as well as markdown-it.
