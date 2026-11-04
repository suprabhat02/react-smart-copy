import { expectAccessible } from './helpers';
import { expect, test } from './test';

const read = '[data-perm-state="read"]';
const write = '[data-perm-state="write"]';

test.describe('clipboard permission', () => {
  test.beforeEach(async ({ page, context }) => {
    // The suite's Chromium project grants the clipboard for every test: start from the browser's default.
    await context.clearPermissions();
    await page.goto('paste/clipboard-permission/');
  });

  test('says what the browser says, and unsupported where it cannot tell', async ({ page, browserName }) => {
    if (browserName === 'chromium') {
      // Chromium answers for both. A fresh context has neither granted.
      await expect(page.locator(read)).toHaveText('prompt');
      await expect(page.locator(write)).toHaveText(/^(prompt|granted)$/); // write is often granted to a focused page
    } else {
      // Firefox and WebKit have no clipboard permission to query: honest, and not a refusal.
      await expect(page.locator(read)).toHaveText('unsupported');
      await expect(page.locator(write)).toHaveText('unsupported');
      await expect(page.locator('[data-perm-hint="read"]')).toContainText('not a refusal');
    }
  });

  test('follows a change the user makes where the browser can change it', async ({ page, context, browserName }) => {
    if (browserName !== 'chromium') {
      // Nothing to change in Firefox or WebKit: the state stays honest about that.
      await expect(page.locator(read)).toHaveText('unsupported');
      return;
    }
    await expect(page.locator(read)).toHaveText('prompt');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await expect(page.locator(read)).toHaveText('granted');
    await expect(page.locator(write)).toHaveText('granted');
    await context.clearPermissions();
    await expect(page.locator(read)).toHaveText('prompt');
  });

  test('is accessible, and states are announced politely', async ({ page }) => {
    await expectAccessible(page, '[data-demo="permission"]');
    await expect(page.locator(read)).toHaveAttribute('aria-live', 'polite');
  });
});
