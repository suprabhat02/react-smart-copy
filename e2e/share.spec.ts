import type { Page } from '@playwright/test';
import { expect, test } from './test';
import { clipboardWrites, recordClipboard } from './helpers';

/** Makes the page a phone with a share sheet that resolves, or rejects with `fail`. */
async function phone(page: Page, fail?: string): Promise<void> {
  await page.addInitScript((failWith) => {
    const shares: unknown[] = [];
    (window as unknown as { __shares: unknown[] }).__shares = shares;
    const real = window.matchMedia.bind(window);
    const touch = (query: string) =>
      ({ matches: true, media: query, onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false }) as unknown as MediaQueryList;
    window.matchMedia = (query: string) => (query.includes('pointer: coarse') ? touch(query) : real(query));
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: (data: ShareData) => {
        shares.push({ url: data.url, title: data.title, text: data.text });
        return failWith === null ? Promise.resolve() : Promise.reject(new DOMException(failWith, failWith));
      },
    });
  }, fail ?? null);
}

const shares = (page: Page) => page.evaluate(() => (window as unknown as { __shares: { url: string; title: string; text: string }[] }).__shares);

test.beforeEach(async ({ page }) => {
  await recordClipboard(page);
});

test.describe('share', () => {
  test('on a computer, Share copies the titled link', async ({ page, baseURL }) => {
    await page.goto('/#try-links');
    const button = page.locator('[data-ln-share]');
    await expect(button).toHaveText('Share');
    await button.click();
    await expect(page.locator('[data-ln-share-status]')).toHaveText('Link copied: this device copies instead of sharing.');
    const write = (await clipboardWrites(page)).at(-1);
    expect(write?.ok).toBe(true);
    expect(write?.items[0]?.['text/plain']).toBe(new URL('/?tab=links#try-links', baseURL).href);
  });

  test('on a phone, Share opens the share sheet with the clean link', async ({ page, baseURL }) => {
    await phone(page);
    await page.goto('/#try-links');
    const button = page.locator('[data-ln-share]');
    await expect(button).toHaveText('Share…');
    await button.click();
    await expect(page.locator('[data-ln-share-status]')).toHaveText('Shared.');
    expect(await shares(page)).toEqual([
      { url: new URL('/?tab=links#try-links', baseURL).href, title: 'Paste drops the colour profile in Safari 18', text: 'A link from the react-smart-copy playground' },
    ]);
    expect(await clipboardWrites(page)).toEqual([]);
  });

  test('closing the share sheet is not an error, and copies nothing', async ({ page }) => {
    await phone(page, 'AbortError');
    await page.goto('/#try-links');
    await page.click('[data-ln-share]');
    await expect(page.locator('[data-ln-share-status]')).toHaveText('Share sheet closed. Nothing was shared.');
    await expect(page.locator('[data-ln-share-status]')).not.toHaveAttribute('data-state', 'error');
    expect(await clipboardWrites(page)).toEqual([]);
  });

  test('when the share sheet fails, the link is copied instead', async ({ page }) => {
    await phone(page, 'NotAllowedError');
    await page.goto('/#try-links');
    await page.click('[data-ln-share]');
    const status = page.locator('[data-ln-share-status]');
    await expect(status).toHaveText(/^Link copied: the share sheet failed\.$|^Clipboard access was blocked/);
    const writes = await clipboardWrites(page);
    expect(writes).toHaveLength(1);
  });
});
