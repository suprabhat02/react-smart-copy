## What and why

<!-- What changes for users, and why. Link the issue it closes. -->

## Checklist

- [ ] `npm run verify` passes: lint, types, 100% coverage, build, package checks, size limits
- [ ] Tests cover the change, including failure paths (and property tests for parsers)
- [ ] Browser behaviour checked in Chromium, Firefox and WebKit (`npm run test:e2e`) if the change touches the DOM or the clipboard
- [ ] Anything rendered passes axe (WCAG 2.2 AA)
- [ ] README, site docs and the playground are updated where users will look
- [ ] A changeset describes the change (`npx changeset`), or this needs none
