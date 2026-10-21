---
"react-smart-copy": minor
---

`react-smart-copy/files`: take pasted and dropped files and folders safely.

- `acceptFiles(source, options)` takes a paste or drop event (DOM or React), a `DataTransfer`, a `FileList` or a list of files. It walks dropped folders within `maxFiles`, `maxFileBytes`, `maxTotalBytes` and `maxDepth`, and accepts or rejects each file with a `reason` and a message that names the file by its safe name. With `digest: true`, each file gets a SHA-256 and repeated files are rejected as `duplicate`.
- Types come from content, never from names or claimed types: more than 50 formats are recognised by their signatures, including Office and OpenDocument files told apart inside their ZIP. `accept` works like `<input accept>`, judged by content. Each accepted file's `upload` is the same bytes, with the safe name and the detected type.
- Risky files are rejected by default: programs and scripts, HTML and SVG (active content), Office files with macros, content that contradicts the extension, double extensions (`invoice.pdf.exe`), and hidden characters in names (`photo\u202Egpj.exe`). `block` chooses which risks reject.
- `inspectFile`, `detectFileType`, `safeFileName` and `matchesAccept` are exported as building blocks. Everything works on servers too (Node 18+).
