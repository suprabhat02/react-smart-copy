---
title: "Contributing"
description: "How changes are made, tested and released."
---

Bug reports and feature requests are welcome as
[GitHub issues](https://github.com/suprabhat02/react-smart-copy/issues). Report security issues
privately, as described in the [security policy](https://github.com/suprabhat02/react-smart-copy/blob/main/SECURITY.md).

The code is written and committed by the maintainer, so pull requests from other people are not
merged: if you have found a fix, open an issue that describes the problem and the change. The full
guide, with every command, is in
[CONTRIBUTING.md](https://github.com/suprabhat02/react-smart-copy/blob/main/CONTRIBUTING.md).

## Standards every change meets

- Strict TypeScript, no `any`, and a typed error for every failure.
- 100% test coverage from deterministic tests, plus property tests for every parser and serialiser.
- No runtime dependencies, and size budgets checked by `size-limit`.
- WCAG 2.2 AA for anything rendered, checked with axe in Chromium, Firefox and WebKit.
- A changeset describing the change for users.

## Develop

```bash
npm ci
npm run docs:install    # once: the docs have their own lockfile, in docs/
npm run verify          # lint, types, tests at 100% coverage, build, package checks, size limits
npm run docs:dev        # these docs, with live demos, at http://localhost:4321/react-smart-copy/
npm run docs:build && npm run test:e2e  # end-to-end tests in Chromium, Firefox and WebKit
```
