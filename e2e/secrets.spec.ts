import { expect, test } from './test';
import { collectErrors, expectAccessible, lastWrite, paste, recordClipboard } from './helpers';

test.beforeEach(async ({ page }) => {
  await recordClipboard(page);
  await page.goto('modules/secrets/');
});

test.describe('the secrets demo', () => {
  test('scans the sample: each secret found, masked, and redacted', async ({ page }) => {
    const errors = collectErrors(page);
    await page.click('[data-sc-sample]');
    await expect(page.locator('[data-sc-status]')).toHaveText('7 secrets found.');
    await expect(page.locator('[data-sc-findings] .fl-detail')).toHaveText([
      'AWS access key ID, high confidence',
      'GitHub token, high confidence',
      'password in a URL, high confidence',
      'Stripe live key, high confidence',
      'secret, medium confidence',
      'card number, high confidence',
      'JSON Web Token, high confidence',
    ]);
    const redacted = await page.locator('[data-sc-redacted]').textContent();
    expect(redacted).toContain('GITHUB_TOKEN=[redacted GitHub token]');
    expect(redacted).toContain('postgres://app:[redacted password in a URL]@db.internal:5432/app');
    expect(redacted).not.toMatch(/gh[p]_[A-Za-z0-9]{36}/);
    await expectAccessible(page, '[data-demo="secrets"]');
    expect(errors).toEqual([]);
  });

  test('a paste with a token is redacted, or blocked', async ({ page }) => {
    const token = ['gh', 'p_', 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8'].join('');
    expect(await paste(page, '[data-sc-chat]', { 'text/plain': `my token is ${token}` })).toBe(true);
    await expect(page.locator('[data-sc-chat]')).toHaveValue('my token is [redacted GitHub token]');
    await expect(page.locator('[data-sc-chat-status]')).toHaveText('Pasted with a GitHub token removed.');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.locator('[data-sc-chat]')).toHaveValue('');

    await page.selectOption('[data-sc-action]', 'block');
    expect(await paste(page, '[data-sc-chat]', { 'text/plain': token })).toBe(true);
    await expect(page.locator('[data-sc-chat]')).toHaveValue('');
    await expect(page.locator('[data-sc-chat-status]')).toHaveText('Paste blocked: it held a GitHub token.');

    expect(await paste(page, '[data-sc-chat]', { 'text/plain': 'hello' })).toBe(false);
    await expect(page.locator('[data-sc-chat-status]')).toHaveText('No secrets: pasted as it was.');
  });

  test('copying a log line redacts its secrets', async ({ page }) => {
    const copied = await page.evaluate(() => {
      const log = document.querySelector('[data-sc-log]') as HTMLElement;
      const range = document.createRange();
      range.selectNodeContents(log);
      const selection = document.getSelection() as Selection;
      selection.removeAllRanges();
      selection.addRange(range);
      // Firefox gives a constructed ClipboardEvent a read-only DataTransfer: record what is written instead.
      const written: Record<string, string> = {};
      const event = new Event('copy', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clipboardData', {
        value: {
          setData: (type: string, value: string) => {
            written[type] = value;
          },
          getData: (type: string) => written[type] ?? '',
          clearData: () => undefined,
        },
      });
      log.dispatchEvent(event);
      return { prevented: event.defaultPrevented, text: written['text/plain'] ?? '' };
    });
    expect(copied.prevented).toBe(true);
    expect(copied.text).toContain('auth header Bearer [redacted JSON Web Token]');
    expect(copied.text).toContain('using key [redacted AWS access key ID]');
    await expect(page.locator('[data-sc-log-status]')).toHaveText('Copied with its secrets redacted: paste it anywhere to see.');
  });

  test('the fake token button copies through the real clipboard', async ({ page }) => {
    await page.click('[data-sc-copy-token]');
    const write = await lastWrite(page);
    expect(write?.ok).toBe(true);
    expect(write?.text ?? write?.items[0]?.['text/plain']).toMatch(/^Can you check this\? My token is gh[p]_[A-Za-z0-9]{36}$/);
  });
});
