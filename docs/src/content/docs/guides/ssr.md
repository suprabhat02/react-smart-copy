---
title: "Next.js and SSR"
description: "Use the React entry from Server Components, with no hydration mismatches."
---

The React entry ships with `"use client"`, so import it directly from Server Components.
Nothing touches `window` during render: the server and the first client render are both
`idle` and not revealed, so there are no hydration mismatches.

`react-smart-copy/core` is framework-agnostic and safe to import anywhere, and so is every other
entry point (`/table`, `/markdown`, `/rich`, ...): only the main entry imports React, and the build
checks that no other entry reaches it.

All entry points share one copy of the core. Using several of them loads it once, and a
`CopyFailure` from any of them is an `instanceof` the one exported by `react-smart-copy` and
`react-smart-copy/core`.
