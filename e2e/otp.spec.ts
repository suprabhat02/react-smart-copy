import type { Page } from '@playwright/test';
import { expect, test } from './test';
import { collectErrors, expectAccessible, lastWrite, paste, recordClipboard } from './helpers';

const boxes = '[data-otp-box]';

test.beforeEach(async ({ page }) => {
  await recordClipboard(page);
  await page.goto('modules/otp/');
});

const valueOf = async (page: Page): Promise<string> =>
  (await page.locator(boxes).evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value || '.'))).join('');

test.describe('the one-time code demo', () => {
  test('every box is named and ready for codes, and the demo is accessible', async ({ page }) => {
    const errors = collectErrors(page);
    const first = page.locator(boxes).first();
    await expect(first).toHaveAttribute('autocomplete', 'one-time-code');
    await expect(first).toHaveAttribute('inputmode', 'numeric');
    await expect(page.locator(boxes).nth(1)).toHaveAttribute('autocomplete', 'off');
    await expect(page.getByRole('group', { name: 'Enter a code' }).getByRole('textbox')).toHaveCount(6);
    await expect(page.getByRole('textbox', { name: 'Digit 6 of 6' })).toBeVisible();
    await expectAccessible(page, '[data-demo="otp"]');
    expect(errors).toEqual([]);
  });

  test('typing moves on, Backspace and the arrow keys move back', async ({ page }) => {
    await page.locator(boxes).first().click();
    await page.keyboard.type('4829');
    expect(await valueOf(page)).toBe('4829..');
    await expect(page.locator(boxes).nth(4)).toBeFocused();
    await expect(page.locator('[data-otp-status]')).toHaveText('2 digits to go.');

    // Letters are not digits: nothing changes.
    await page.keyboard.type('x');
    expect(await valueOf(page)).toBe('4829..');

    await page.keyboard.press('Backspace');
    expect(await valueOf(page)).toBe('482...');
    await expect(page.locator(boxes).nth(3)).toBeFocused();

    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator(boxes).nth(1)).toBeFocused();
    await page.keyboard.type('7');
    expect(await valueOf(page)).toBe('472...');

    await page.keyboard.press('End');
    await page.keyboard.type('913');
    expect(await valueOf(page)).toBe('472913');
    await expect(page.locator('[data-otp-status]')).toHaveText('Code 472913 entered.');
  });

  test('pasting a whole SMS into any box fills them all', async ({ page }) => {
    expect(await paste(page, '[data-otp-box]:nth-of-type(4)', { 'text/plain': 'Your Example verification code is 582047. Do not share it.' })).toBe(true);
    expect(await valueOf(page)).toBe('582047');
    await expect(page.locator('[data-otp-status]')).toHaveText('Code 582047 entered.');
    await expect(page.locator(boxes).last()).toBeFocused();

    // A paste with no code changes nothing.
    await page.click('[data-otp-clear]');
    await expect(page.locator(boxes).first()).toBeFocused();
    expect(await paste(page, '[data-otp-box]:nth-of-type(1)', { 'text/plain': 'Call +1 555 010 2048' })).toBe(true);
    expect(await valueOf(page)).toBe('......');
  });

  test('an SMS autofill into the first box fills every box', async ({ page }) => {
    // What iOS and Android keyboards do: the whole code arrives as one input in the first box.
    await page.locator(boxes).first().fill('318406');
    expect(await valueOf(page)).toBe('318406');
    await expect(page.locator('[data-otp-status]')).toHaveText('Code 318406 entered.');
  });

  test('the sample SMS copies through the real clipboard', async ({ page }) => {
    await page.click('[data-otp-copy-sms]');
    const write = await lastWrite(page);
    expect(write?.ok).toBe(true);
    expect(write?.text ?? write?.items[0]?.['text/plain']).toContain('verification code is 582047');
  });

  test('reads the code in each sample message, and none in an order message', async ({ page }) => {
    const status = page.locator('[data-otp-read-status]');
    await page.click('[data-otp-sample="sms"]');
    await expect(status).toHaveText('Code 582047, high confidence: next to a word that names it.');
    await page.click('[data-otp-sample="bound"]');
    await expect(status).toHaveText('Code 731964, high confidence: bound to its site, as WebOTP reads it.');
    await page.click('[data-otp-sample="mail"]');
    await expect(status).toHaveText('Code 409613, high confidence: next to a word that names it.');
    await page.click('[data-otp-sample="none"]');
    await expect(status).toHaveText('No code: no number here reads as one.');
    await page.fill('[data-otp-message]', '');
    await expect(status).toHaveText('Nothing read yet.');
    await page.fill('[data-otp-message]', '\u0661\u0662\u0663\u0664');
    await expect(status).toHaveText('Code 1234, high confidence: the message is the code.');
  });
});
