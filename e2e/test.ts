import { test as base } from '@playwright/test';

/**
 * Tests never touch the network beyond the local server: the site's calls to the
 * GitHub and npm APIs get fixed answers, and anything else external fails the test.
 * Every test also fails on a Content Security Policy violation, so the site's policy
 * is checked against everything the tests exercise.
 *
 * One kind is not a violation by the page: since Chromium 156, parsing markup with an
 * inline event handler into an inert document (DOMParser, as every paste of HTML does)
 * reports `script-src-attr` with the Document as its target, though the handler never
 * runs (w3c/webappsec-csp#824). A handler refused in the page itself names its element,
 * so it still fails the test, and so does any other directive.
 */
export const test = base.extend<{ hermetic: undefined }>({
  hermetic: [
    async ({ page }, use) => {
      const unexpected: string[] = [];
      // Nothing pasted, dropped or copied may ever run: a dialog would mean a script did.
      const dialogs: string[] = [];
      page.on('dialog', (dialog) => {
        dialogs.push(dialog.message());
        void dialog.dismiss();
      });
      await page.addInitScript(() => {
        const violations: string[] = [];
        (window as unknown as { __csp: string[] }).__csp = violations;
        document.addEventListener('securitypolicyviolation', (event) => {
          const inertParse = event.effectiveDirective === 'script-src-attr' && !(event.target instanceof Element);
          if (!inertParse) violations.push(`${event.effectiveDirective} blocked ${event.blockedURI || 'inline'}`);
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
      base.expect(dialogs, 'dialogs opened by the page').toEqual([]);
      const violations = page.isClosed() ? [] : await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);
      base.expect(violations, 'Content Security Policy violations').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';
