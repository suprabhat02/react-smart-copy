---
"react-smart-copy": patch
---

`react-smart-copy/image`: every metadata check now reads only its own segment, chunk or Exif block. Before this, an empty JPEG APP2 segment could be classified from the bytes after it, so a malformed file kept a segment on the first strip and dropped it on the second. Fuzz tests found it. They now run five times as many cases in CI, and the case is a regression test.
