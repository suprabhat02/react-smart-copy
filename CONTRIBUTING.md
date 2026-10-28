# Contributing

Thank you for helping make `react-smart-copy` better.

## Ways to help

- **Report a bug** with the [bug report form](https://github.com/suprabhat02/react-smart-copy/issues/new?template=bug_report.yml).
  A minimal reproduction (a CodeSandbox, StackBlitz or a few lines of code) and the
  browser you used make a fix much faster. Clipboard behaviour differs between browsers
  and operating systems, so these details matter.
- **Suggest a feature** with the [feature request form](https://github.com/suprabhat02/react-smart-copy/issues/new?template=feature_request.yml).
  Describe the problem first, then the API you have in mind.
- **Report a security issue privately**, as described in [SECURITY.md](./SECURITY.md).
  Never in a public issue.

## Code changes

The code in this repository is written and committed by its maintainer. Every commit
is checked for this in CI. Because of this, pull requests from other people are not
merged. If you have found a fix, open an issue that describes the problem and the
change. The maintainer will implement it, with tests.

## Development

Requirements: Node.js 22 and npm.

```bash
npm ci
npm run verify                          # lint, types, tests at 100% coverage, build, package and docs checks, size limits
npm run bench                           # parser benchmarks on the built package: typical and hostile input
npm run docs:install                    # once: the docs (Astro and Starlight) have their own lockfile
npm run docs:dev                        # the docs, with live demos, at http://localhost:4321/react-smart-copy/
npm run docs:build && npm run test:e2e  # end-to-end tests in Chromium, Firefox and WebKit
PROPERTY_SCALE=20 npm run test:property # property tests with 20 times the cases
PROPERTY_SEED=<seed> npm run test:property # replay a property failure from its printed seed

# React 18, TypeScript 5.0 and TypeScript 7, each pinned by its own lockfile in compat/
npm ci --prefix compat/react18 && npx tsc -p tsconfig.react18.json && REACT_VERSION=18 npm test
npm ci --prefix compat/typescript5 && compat/typescript5/node_modules/.bin/tsc -p consumer/tsconfig.bundler.json
npm ci --prefix compat/typescript7 && compat/typescript7/node_modules/.bin/tsc --noEmit

# The packed package on the current Node.js (CI runs it on 18, 20, 22 and 24)
npm run build && scripts/smoke-node.sh
```

Standards every change meets:

- strict TypeScript, no `any`, and typed errors for every failure
- every export's type written out (`isolatedDeclarations`, checked by `tsconfig.lib.json`)
- every parser caps its input and runs in linear time, with hostile input tested at its limit
- docs that match the package: `scripts/check-docs.mjs` type-checks every import in the README, the docs and the demos, and keeps the README within what npm shows
- 100% test coverage from deterministic tests, plus property tests for parsers and serialisers
- no runtime dependencies, and size budgets checked by `size-limit`
- WCAG 2.2 AA for anything rendered, checked with axe in real browsers
- a changeset (`npx changeset`) describing the change for users
