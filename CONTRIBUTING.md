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
npm run verify                          # lint, types, tests at 100% coverage, build, package checks, size limits
npm run site:preview                    # docs site and playground at http://localhost:3000
npm run site:build && npm run test:e2e  # end-to-end tests in Chromium, Firefox and WebKit
```

Standards every change meets:

- strict TypeScript, no `any`, and typed errors for every failure
- 100% test coverage, plus property tests for parsers and serialisers
- no runtime dependencies, and size budgets checked by `size-limit`
- WCAG 2.2 AA for anything rendered, checked with axe in real browsers
- a changeset (`npx changeset`) describing the change for users
