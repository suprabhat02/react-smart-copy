---
"react-smart-copy": minor
---

Add `react-smart-copy/image`: get pasted and dropped images ready to upload, private and small.

- `prepareImage(file, options?)`: removes metadata and fits the image to `maxWidth`, `maxHeight`, `maxPixels` and `maxBytes`. It re-encodes only when it has to. When only the metadata goes, every pixel stays the same. For a byte budget it searches for the highest JPEG or WebP quality that fits (down to `minQuality`), then reduces the size. `type: 'auto'` keeps PNG screenshots lossless while they fit, then moves to WebP or JPEG. When a limit can't be met, it is a `too-large` error, never an oversized file. Large reductions are drawn in halving steps.
- `stripMetadata(file, options?)`: lossless metadata removal for JPEG, PNG, WebP and GIF. It removes Exif (camera, dates, serial numbers), the GPS location, embedded thumbnails, XMP, IPTC, comments, PNG text, multi-picture and depth images (MPF), content credentials (C2PA) and data appended after the image (motion photos). It keeps the colour profile, and the orientation in a 26-byte Exif block, so photos stay upright. Works on the server.
- `readImageInfo(file)`: format, size, orientation, animation and the metadata a file carries, read from its bytes. This includes AVIF and HEIC, whose Exif and GPS are found through their item tables. It never decodes the picture and never trusts the file name or the claimed type.
- Safe with hostile files: sizes are checked against `maxInputPixels` before decoding (decompression bombs), every parser read is bounded by its own box or chunk, and fuzz tests feed random and mutated files to every parser. Animations keep every frame by default (`animated: 'keep' | 'first-frame' | 'reject'`). Every failure is a typed error, and `signal` and `timeoutMs` cancel the work.
- `removed` is read back from the output, not assumed (some encoders add their own colour profile), and an injectable `environment` takes a custom decoder or a test double.

Also: the published `react-smart-copy/code` bundle no longer contains its lookalike table as raw Cyrillic and Greek letters (the build had turned the escapes into characters), so security scanners don't flag the package itself. Every release is now checked by the package's own `inspectCode` for hidden, reordering, control and lookalike characters before it is published.
