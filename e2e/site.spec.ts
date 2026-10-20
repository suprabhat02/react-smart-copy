import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { expect, test } from './test';
import { collectErrors, expectAccessible } from './helpers';

const DIST = 'docs/dist';

/** Every page of the built docs, as a path relative to the site root ('' for the landing page). */
function pages(directory = DIST): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return ['_astro', 'pagefind'].includes(entry.name) ? [] : pages(path);
    if (entry.name !== 'index.html') return [];
    const page = relative(DIST, directory).split(sep).join('/');
    return [page === '' ? '' : `${page}/`];
  });
}

const PAGES = pages().sort();
/** The pages with a live demo, read from the built HTML so a new demo is covered without editing this file. */
const DEMOS = PAGES.filter((page) => readFileSync(join(DIST, page, 'index.html'), 'utf8').includes('class="rsc-demo'));

test('the docs are built, with a page per feature and a live demo on each feature page', () => {
  expect(PAGES.length).toBeGreaterThanOrEqual(30);
  expect(DEMOS.length).toBeGreaterThanOrEqual(16);
});

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`docs, ${colorScheme} theme`, () => {
    test.use({ colorScheme });

    // One test per page: each has its own time budget, and a failure names its page.
    for (const page of PAGES) {
      test(`/${page} loads without errors and passes axe`, async ({ page: tab }) => {
        const errors = collectErrors(tab);
        await tab.goto(page);
        await expect(tab.locator('h1')).toBeVisible();
        if (DEMOS.includes(page)) await expect(tab.locator('.rsc-demo').first()).toBeVisible();
        await expectAccessible(tab, 'body');
        expect(errors).toEqual([]);
      });
    }
  });
}

test('an unknown page gets the 404 page, which links back into the docs', async ({ page }) => {
  const response = await page.goto('no-such-page/');
  expect(response?.status()).toBe(404);
  await expect(page.locator('h1')).toHaveText('This page does not exist');
  await page.getByRole('link', { name: 'Go to the introduction' }).click();
  await expect(page).toHaveURL(/\/start\/introduction\/$/);
});

test.describe('links into the old single-page docs', () => {
  for (const [hash, target] of [
    ['try-tables', 'modules/tables/#try-it'],
    ['try-rich', 'modules/rich-text/#try-it'],
    ['what-it-copies', 'start/introduction/#what-it-can-and-cannot-copy'],
    ['releases', 'project/releases/'],
  ] as const) {
    test(`#${hash} goes to ${target}`, async ({ page, baseURL }) => {
      await page.goto(`#${hash}`);
      await expect(page).toHaveURL(new URL(target, baseURL).href);
    });
  }
});

test('search finds a feature page', async ({ page }) => {
  await page.goto('');
  await page.getByRole('button', { name: 'Search' }).click();
  await page.getByRole('dialog', { name: 'Search' }).getByRole('textbox', { name: 'Search' }).fill('spreadsheet');
  await expect(page.locator('.pagefind-ui__result-link').first()).toBeVisible();
});

test('a demo page has no horizontal overflow on a small phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('modules/images/');
  await page.click('[data-img-sample]');
  await expect(page.locator('[data-img-result]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});
