import { readFileSync } from 'node:fs';
import { expect, test } from './test';
import { collectErrors, expectAccessible } from './helpers';

/** The playground's tabs, read from the page itself so a new tab is covered without editing this file. */
const TABS = [...readFileSync('site/index.html', 'utf8').matchAll(/<[^>]*\brole="tab"[^>]*>/g)].map((match) => /\bid="([^"]+)"/.exec(match[0])?.[1] ?? '');

test('the playground lists its tabs', () => {
  expect(TABS.length).toBeGreaterThanOrEqual(15);
  expect(TABS).not.toContain('');
});

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`docs site, ${colorScheme} theme`, () => {
    test.use({ colorScheme });

    test('loads without errors, and the whole page passes axe', async ({ page }) => {
      const errors = collectErrors(page);
      await page.goto('/');
      await expect(page.locator('h1')).toBeVisible();
      expect(await page.locator('[role="tab"]').evaluateAll((elements) => elements.map((element) => element.id))).toEqual(TABS);
      await expectAccessible(page, 'main');
      expect(errors).toEqual([]);
    });

    // One test per panel: each has its own time budget, and a failure names its panel.
    for (const id of TABS) {
      test(`the ${id.replace(/^tab-/, '')} panel opens without errors and passes axe`, async ({ page }) => {
        const errors = collectErrors(page);
        await page.goto('/');
        await page.click(`#${id}`);
        const panel = (await page.getAttribute(`#${id}`, 'aria-controls')) as string;
        await expect(page.locator(`#${panel}`)).toBeVisible();
        await expectAccessible(page, `#${panel}`);
        expect(errors).toEqual([]);
      });
    }
  });
}

test('the playground has no horizontal overflow on a small phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/#try-images');
  await page.click('[data-img-sample]');
  await expect(page.locator('[data-img-result]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});
