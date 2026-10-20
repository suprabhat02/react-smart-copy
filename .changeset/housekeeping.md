---
"react-smart-copy": patch
---

- A `CopyFailure` thrown by your own `decode` or `encode` hook in `react-smart-copy/image` is passed on as it is, even when it comes from another entry point (such as `react-smart-copy/core`), which bundles its own copy of the class. It was wrapped in a new error before. `react-smart-copy/code` uses the same brand check. A lint rule now keeps `instanceof CopyFailure` out of the library.
- Support, now checked on every change: TypeScript 5.0 and later (the published types are type-checked on 5.0 and 7), and Node.js 18, 20, 22 and 24 (every entry point of the packed package, through `import` and `require`).
- Each GitHub release now holds the npm tarball and a Sigstore attestation of it (`gh attestation verify`).
- Docs: the README states the supported TypeScript and Node.js versions, and the roadmap marks 1.17 shipped and lists 1.18 and 1.19. The docs site has a canonical URL.
