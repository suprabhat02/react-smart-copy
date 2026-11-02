import type { Page } from '@playwright/test';
import { expect, test } from './test';

/**
 * Real key presses, not dispatched events: the browser itself decides what a cut deletes
 * and what a copy puts on the clipboard, and that differs per engine. A listener added
 * after the library's records what the page left on the event's own `DataTransfer`, so no
 * clipboard permission is needed.
 */
interface Seen {
  readonly type: string;
  readonly prevented: boolean;
  readonly text: string;
  readonly html: string;
}

async function watchClipboardEvents(page: Page): Promise<void> {
  await page.evaluate(() => {
    const seen: Seen[] = [];
    (window as unknown as { __seen: Seen[] }).__seen = seen;
    for (const type of ['copy', 'cut']) {
      document.addEventListener(type, (event) => {
        const data = (event as ClipboardEvent).clipboardData;
        seen.push({
          type,
          prevented: event.defaultPrevented,
          text: data?.getData('text/plain') ?? '',
          html: data?.getData('text/html') ?? '',
        });
      });
    }
  });
}

async function lastSeen(page: Page): Promise<Seen | undefined> {
  return page.evaluate(() => (window as unknown as { __seen: Seen[] }).__seen.at(-1));
}

test.describe('native copy and cut, with real key presses', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('copy/native-copy/');
    await watchClipboardEvents(page);
  });

  test('Ctrl/⌘+C in an attribution scope adds the source line', async ({ page }) => {
    await page.locator('[data-ix-zone="attribution"] .ix-text').click({ clickCount: 3 });
    await page.keyboard.press('ControlOrMeta+c');
    const seen = await lastSeen(page);
    expect(seen?.type).toBe('copy');
    expect(seen?.prevented).toBe(true);
    expect(seen?.text).toContain('react-smart-copy is a headless clipboard library');
    expect(seen?.text).toMatch(/\n\nSource: https:\/\/suprabhat02\.github\.io\/react-smart-copy\/$/);
  });

  test('Ctrl/⌘+X in a redaction field copies a mask and still removes the text', async ({ page }) => {
    const field = page.locator('[data-redact-field]');
    await field.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('ControlOrMeta+x');
    const seen = await lastSeen(page);
    expect(seen?.type).toBe('cut');
    expect(seen?.prevented).toBe(true);
    expect(seen?.text).toBe('[redacted]');
    expect(seen?.text).not.toContain('demo-restricted');
    // A cut that is rewritten is still a cut: the secret leaves the field.
    await expect(field).toHaveValue('');
  });

  test('Ctrl/⌘+C on part of a field never leaks the secret either', async ({ page }) => {
    const field = page.locator('[data-redact-field]');
    await field.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('ControlOrMeta+c');
    const seen = await lastSeen(page);
    expect(seen?.text).toBe('[redacted]');
    // A copy never deletes.
    await expect(field).toHaveValue('demo-restricted-31be7c');
  });

  test('a no-copy zone writes nothing', async ({ page }) => {
    await page.locator('[data-ix-zone="blocked"] .ix-text').click({ clickCount: 3 });
    await page.keyboard.press('ControlOrMeta+c');
    const seen = await lastSeen(page);
    expect(seen?.type).toBe('copy');
    expect(seen?.prevented).toBe(true);
    expect(seen?.text).toBe('');
    expect(seen?.html).toBe('');
  });

  test('with interception off, the browser copies as it always did', async ({ page }) => {
    await page.locator('[data-intercept-toggle]').uncheck();
    await page.locator('[data-ix-zone="attribution"] .ix-text').click({ clickCount: 3 });
    await page.keyboard.press('ControlOrMeta+c');
    const seen = await lastSeen(page);
    expect(seen?.prevented).toBe(false);
    expect(seen?.text).not.toContain('Source:');
  });
});
