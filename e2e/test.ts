import { test as base } from '@playwright/test';

/**
 * Tests never touch the network beyond the local server: the site's calls to the
 * GitHub and npm APIs get fixed answers, and anything else external fails the test.
 * Every test also fails on a Content Security Policy violation, so the site's policy
 * is checked against everything the tests exercise.
 */
export const test = base.extend<{ hermetic: undefined }>({
  hermetic: [
    async ({ page }, use) => {
      const unexpected: string[] = [];
      await page.addInitScript(() => {
        const violations: string[] = [];
        (window as unknown as { __csp: string[] }).__csp = violations;
        document.addEventListener('securitypolicyviolation', (event) => {
          violations.push(`${event.effectiveDirective} blocked ${event.blockedURI || 'inline'}`);
        });
      });
      await page.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/, async (route) => {
        const url = route.request().url();
        if (url.startsWith('https://api.github.com/repos/suprabhat02/react-smart-copy')) {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ stargazers_count: 42 }) });
        } else if (url.startsWith('https://registry.npmjs.org/react-smart-copy')) {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ time: {} }) });
        } else {
          unexpected.push(url);
          await route.abort();
        }
      });
      await use(undefined);
      base.expect(unexpected, 'requests outside the local server').toEqual([]);
      const violations = page.isClosed() ? [] : await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);
      base.expect(violations, 'Content Security Policy violations').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';
