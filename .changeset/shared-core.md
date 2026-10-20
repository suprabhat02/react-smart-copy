---
"react-smart-copy": minor
---

One shared core for every entry point. Before, each entry point (`react-smart-copy`, `/core`, `/rich`, `/markdown`, ...) bundled its own copy of the copy and paste core. Now that code ships once, in `dist/chunks/`, and each entry point imports it.

- **Smaller apps:** an app that uses several entry points loads the core once. An app using five of them is 24.6 kB instead of 25.5 kB (minified and brotlied). The minified JavaScript is 18% smaller, and the npm package shrinks from 4.2 MB to 3.0 MB unpacked.
- **One `CopyFailure` class:** a failure from any entry point is an `instanceof` the `CopyFailure` exported by `react-smart-copy` and `react-smart-copy/core`. Before, each entry point had its own class, so `instanceof` failed across them (`isCopyFailure()` always worked, and still does).
- **Nothing to change in your code:** the entry points, their exports and their types are the same, and each entry point alone is the same size as before. Only the React entry is a client module (`"use client"`); the build now checks that no other entry point reaches React, so server code can import them.
