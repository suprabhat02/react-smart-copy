import { expect, test } from './test';
import { collectErrors, expectAccessible, lastWrite, paste, recordClipboard } from './helpers';

test.beforeEach(async ({ page }) => {
  await recordClipboard(page);
  await page.goto('modules/numbers/');
});

test.describe('the number demo', () => {
  test('reads each sample amount, and the demo is accessible', async ({ page }) => {
    const errors = collectErrors(page);
    const status = page.locator('[data-nm-status]');
    await page.click('[data-nm-sample="1.234,50 \u20AC"]');
    await expect(status).toHaveText('Read as 1234.50.');
    await expect(page.locator('[data-nm-currency]')).toHaveText('\u20AC (EUR)');
    await expect(page.locator('[data-nm-written]')).toHaveText('1,234.50');
    await page.click('[data-nm-sample="(1,234.00)"]');
    await expect(page.locator('[data-nm-exact]')).toHaveText('-1234.00');
    await page.click('[data-nm-sample="\u20B9 12,34,567"]');
    await expect(page.locator('[data-nm-exact]')).toHaveText('1234567');
    await page.click('[data-nm-sample="12/10/2026"]');
    await expect(status).toHaveText('Not a number: it holds something else, or its grouping is wrong.');
    await expect(page.locator('[data-nm-result]')).toBeHidden();
    await expectAccessible(page, '[data-demo="number"]');
    expect(errors).toEqual([]);
  });

  test('the locale settles an ambiguous amount', async ({ page }) => {
    const status = page.locator('[data-nm-status]');
    await page.click('[data-nm-sample="1,234"]');
    await expect(status).toHaveText('Read as 1234: the separator could go either way, and English (US) settled it.');
    await page.selectOption('[data-nm-locale]', 'de-DE');
    await expect(status).toHaveText('Read as 1.234: the separator could go either way, and German (Germany) settled it.');
    await expect(page.locator('[data-nm-written]')).toHaveText('1,234');
    await page.fill('[data-nm-input]', '');
    await expect(status).toHaveText('Nothing read yet.');
  });

  test('a number field takes a pasted amount in any format, and turns away the rest', async ({ page }) => {
    const field = page.locator('[data-nm-field]');
    const status = page.locator('[data-nm-field-status]');
    expect(await paste(page, '[data-nm-field]', { 'text/plain': '1.234,50 \u20AC' })).toBe(true);
    await expect(field).toHaveValue('1234.50');
    await expect(status).toHaveText('Pasted 1234.50.');
    expect(await paste(page, '[data-nm-field]', { 'text/plain': '$ (2,500.75)' })).toBe(true);
    await expect(field).toHaveValue('-2500.75');
    expect(await paste(page, '[data-nm-field]', { 'text/plain': 'call 555-0102' })).toBe(true);
    await expect(field).toHaveValue('-2500.75');
    await expect(status).toHaveText('That paste is not a number: the field was left as it was.');
  });

  test('typing an amount in French style reads it', async ({ page }) => {
    await page.selectOption('[data-nm-locale]', 'fr-FR');
    await page.fill('[data-nm-input]', '1\u202F234,5 \u20AC');
    await expect(page.locator('[data-nm-exact]')).toHaveText('1234.5');
    await expect(page.locator('[data-nm-written]')).toHaveText('1\u202F234,5');
  });

  test('the copy buttons copy through the real clipboard', async ({ page }) => {
    await page.click('[data-nm-copy="$ (2,500.75)"]');
    const write = await lastWrite(page);
    expect(write?.ok).toBe(true);
    expect(write?.text ?? write?.items[0]?.['text/plain']).toBe('$ (2,500.75)');
  });
});
