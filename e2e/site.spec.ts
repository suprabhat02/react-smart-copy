import { expect, test } from './test';
import { collectErrors, expectAccessible } from './helpers';

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`docs site, ${colorScheme} theme`, () => {
    test.use({ colorScheme });

    test('loads without errors, and every playground panel passes axe', async ({ page }) => {
      const errors = collectErrors(page);
      await page.goto('/');
      await expect(page.locator('h1')).toBeVisible();
      const tabs = await page.locator('[role="tab"]').evaluateAll((elements) => elements.map((element) => element.id));
      expect(tabs.length).toBeGreaterThanOrEqual(12);
      for (const id of tabs) {
        await page.click(`#${id}`);
        const panel = (await page.getAttribute(`#${id}`, 'aria-controls')) as string;
        await expect(page.locator(`#${panel}`)).toBeVisible();
        await expectAccessible(page, `#${panel}`);
      }
      await expectAccessible(page, 'main');
      expect(errors).toEqual([]);
    });
  });
}

test('the playground has no horizontal overflow on a small phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/#try-images');
  await page.click('[data-img-sample]');
  await expect(page.locator('[data-img-result]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});
