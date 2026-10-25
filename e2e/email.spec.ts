import { expect, test } from './test';
import { collectErrors, expectAccessible, lastWrite, paste, recordClipboard } from './helpers';

test.beforeEach(async ({ page }) => {
  await recordClipboard(page);
  await page.goto('modules/email/');
});

const chips = '[data-em-chips] li';

test.describe('the e-mail demo', () => {
  test('a pasted Outlook list becomes recipients, names and all', async ({ page }) => {
    const errors = collectErrors(page);
    expect(await paste(page, '[data-em-input]', { 'text/plain': 'Lima, Ana <ana.lima@example.com>; "Diaz, Bo" <bo.diaz@example.org>; cy.ng@example.net' })).toBe(true);
    await expect(page.locator(`${chips} > span:first-child`)).toHaveText(['Lima, Ana <ana.lima@example.com>', 'Diaz, Bo <bo.diaz@example.org>', 'cy.ng@example.net']);
    await expect(page.locator('[data-em-status]')).toHaveText('Added 3 recipients.');
    await expect(page.locator('[data-em-input]')).toHaveValue('');
    await expectAccessible(page, '[data-demo="email"]');
    expect(errors).toEqual([]);
  });

  test('spreadsheet rows and duplicates', async ({ page }) => {
    await paste(page, '[data-em-input]', { 'text/plain': 'Name\tEmail\nAna Lima\tana.lima@example.com\nDee Rao\tdee.rao@example.io\nAna Lima\tana.lima@example.com' });
    await expect(page.locator(`${chips} > span:first-child`)).toHaveText(['Ana Lima <ana.lima@example.com>', 'Dee Rao <dee.rao@example.io>']);
    await expect(page.locator('[data-em-status]')).toHaveText('Added 2 recipients, 1 duplicate left out, 2 entries to correct.');
    await expect(page.locator('[data-em-input]')).toHaveValue('Name, Email');
  });

  test('lookalike domains are flagged, and hidden characters and bad domains turned away', async ({ page }) => {
    await paste(page, '[data-em-input]', { 'text/plain': 'Ana <ana@ex\u0430mple.com>, eve@exam\u200Bple.com, mailto:fay@example.com?subject=Hi, not an address, gus@localhost' });
    await expect(page.locator('.em-warn')).toHaveCount(1);
    await expect(page.locator('.em-warn .em-note')).toHaveText('lookalike domain');
    await expect(page.locator(`${chips} > span:first-child`)).toHaveText(['Ana <ana@ex\u0430mple.com>', 'fay@example.com']);
    await expect(page.locator('[data-em-problems] .fl-detail')).toHaveText(['hides invisible characters', 'not an address', 'no such domain can exist']);
    await expect(page.locator('[data-em-status]')).toHaveText('Added 2 recipients, 3 entries to correct, 1 lookalike domain to check.');
    await expectAccessible(page, '[data-demo="email"]');
  });

  test('typing an address and Enter adds it; chips can be removed', async ({ page }) => {
    await page.fill('[data-em-input]', 'Ana Lima <ana@example.com>');
    await page.press('[data-em-input]', 'Enter');
    await expect(page.locator(chips)).toHaveCount(1);
    await page.fill('[data-em-input]', 'oops');
    await page.press('[data-em-input]', ',');
    await expect(page.locator('[data-em-input]')).toHaveValue('oops');
    await page.click('button[aria-label="Remove Ana Lima"]');
    await expect(page.locator(chips)).toHaveCount(0);
    await expect(page.locator('[data-em-status]')).toHaveText('Removed Ana Lima.');
    await expect(page.locator('[data-em-input]')).toBeFocused();
    await expect(page.locator('[data-em-copy-all]')).toBeDisabled();
  });

  test('copies the recipients so they paste into any To field', async ({ page }) => {
    await paste(page, '[data-em-input]', { 'text/plain': 'Lima, Ana <ana@example.com>; bo@example.org' });
    await page.click('[data-em-copy-all]');
    const write = await lastWrite(page);
    expect(write?.ok).toBe(true);
    expect(write?.text ?? write?.items[0]?.['text/plain']).toBe('"Lima, Ana" <ana@example.com>, bo@example.org');
    await page.click('[data-em-clear]');
    await expect(page.locator(chips)).toHaveCount(0);
    await expect(page.locator('[data-em-status]')).toHaveText('No recipients yet.');
  });

  test('the sample buttons copy through the real clipboard', async ({ page }) => {
    await page.click('[data-em-copy="outlook"]');
    const write = await lastWrite(page);
    expect(write?.ok).toBe(true);
    expect(write?.text ?? write?.items[0]?.['text/plain']).toContain('Lima, Ana <ana.lima@example.com>');
  });
});
