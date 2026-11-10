import { expect, test } from './test';
import { expectAccessible, lastWrite, recordClipboard } from './helpers';

/**
 * The docs' own "Copy page as Markdown" button: the library's Markdown converter run on a real
 * Starlight page, written in a real click, in each engine.
 */
test.beforeEach(async ({ page }) => {
  await recordClipboard(page);
});

test.describe('copy page as Markdown', () => {
  test('copies the title and body, without permalinks or live demos', async ({ page }) => {
    await page.goto('copy/use-copy/');
    await page.click('[data-copy-page-button]');
    const write = await lastWrite(page);
    expect(write?.ok).toBe(true);
    const markdown = write?.text ?? write?.items[0]?.['text/plain'] ?? '';
    expect(markdown.startsWith('# useCopy\n\n`useCopy` is the hook under every copy button.')).toBe(true);
    expect(markdown).toContain('\n## Options\n');
    expect(markdown).toContain('```tsx\nimport { useCopy } from "react-smart-copy";');
    // Starlight's permalink text, and the demo's rows, are not part of the page's text.
    expect(markdown).not.toContain('Section titled');
    expect(markdown).not.toContain('Hover a row');
    await expect(page.locator('[data-copy-page-button]')).toHaveText('Copied');
    await expect(page.locator('[data-copy-page-status]')).toHaveText('Page copied as Markdown');
    await expect(page.locator('[data-copy-page-button]')).toHaveText('Copy page as Markdown', { timeout: 5000 });
    await expect(page.locator('[data-copy-page-status]')).toHaveText('');
  });

  test('a table stays a table, and links become absolute', async ({ page, baseURL }) => {
    await page.goto('start/migrating/');
    await page.click('[data-copy-page-button]');
    const write = await lastWrite(page);
    const markdown = write?.text ?? write?.items[0]?.['text/plain'] ?? '';
    expect(markdown).toMatch(/\n\| .+ \|\n\| --- \|/);
    expect(markdown).not.toContain('](/react-smart-copy/');
    expect(markdown).toContain(`](${new URL('/react-smart-copy/start/introduction/#the-parts', baseURL).href})`);
  });

  test('is a labelled button that passes axe', async ({ page }) => {
    await page.goto('copy/use-copy/');
    await expect(page.getByRole('button', { name: 'Copy page as Markdown' })).toBeVisible();
    await expectAccessible(page, '[data-copy-page]');
  });
});
