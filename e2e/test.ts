import { test as base } from '@playwright/test';

/**
 * Tests never touch the network beyond the local server: the site's calls to the
 * GitHub and npm APIs get fixed answers, and anything else external fails the test.
 */
export const test = base.extend<{ hermetic: undefined }>({
  hermetic: [
    async ({ page }, use) => {
      const unexpected: string[] = [];
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
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';
