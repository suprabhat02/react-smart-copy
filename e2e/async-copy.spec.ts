import type { Page } from '@playwright/test';
import type * as Core from '../src/core';
import { expect, test } from './test';

/**
 * "Copy share link": the link only exists once the server has made it, half a second after
 * the click. Safari drops the user's gesture at the first `await`; the copy must still reach
 * the system clipboard in every engine, with the default adapter and no options.
 */
async function install(page: Page): Promise<void> {
  await page.goto('start/quick-start/');
  await page.evaluate(async () => {
    const core = (await import(new URL('/lib/core.js', location.href).href)) as typeof Core;
    const copier = core.createCopyMachine();
    const state = { outcome: 'none', during: 'none', aborted: 'no' };
    (window as unknown as { __async: typeof state }).__async = state;
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;inset:auto 0 0 0;z-index:2147483647;background:Canvas;padding:8px';
    const share = document.createElement('button');
    share.id = 'share';
    share.textContent = 'Copy share link';
    const cancel = document.createElement('button');
    cancel.id = 'cancel';
    cancel.textContent = 'Cancel';
    const sink = document.createElement('div');
    sink.id = 'sink';
    sink.contentEditable = 'true';
    sink.setAttribute('aria-label', 'sink');
    sink.textContent = '·';
    box.append(share, cancel, sink);
    document.body.append(box);
    // The "server": answers after 500 ms, and stops when the copy is cancelled.
    const createLink = (signal: AbortSignal): Promise<string> =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          resolve('https://example.com/s/7Hq2');
        }, 500);
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          state.aborted = 'yes';
          reject(new DOMException('cancelled', 'AbortError'));
        });
      });
    share.addEventListener('click', () => {
      void copier.copy(({ signal }) => createLink(signal)).then((outcome) => {
        state.outcome = outcome.status === 'error' ? `error: ${outcome.error.type}` : outcome.status === 'ignored' ? `ignored: ${outcome.reason}` : outcome.status;
      });
      state.during = copier.getSnapshot().status;
    });
    cancel.addEventListener('click', () => {
      copier.reset();
    });
    const pasted: string[] = [];
    (window as unknown as { __pasted: typeof pasted }).__pasted = pasted;
    sink.addEventListener('paste', (event) => {
      pasted.push(event.clipboardData?.getData('text/plain') ?? '');
      event.preventDefault();
    });
  });
}

const state = (page: Page) => page.evaluate(() => (window as unknown as { __async: { outcome: string; during: string; aborted: string } }).__async);

test.describe('copying text the server makes after the click', () => {
  test.beforeEach(async ({ page }) => {
    await install(page);
  });

  test('reaches the clipboard after the wait, in every engine', async ({ page }) => {
    await page.click('#share');
    expect((await state(page)).during).toBe('copying');
    await expect.poll(async () => (await state(page)).outcome, { timeout: 5000 }).toBe('copied');
    await page.click('#sink');
    await page.keyboard.press('ControlOrMeta+v');
    await expect.poll(() => page.evaluate(() => (window as unknown as { __pasted: string[] }).__pasted.at(-1))).toBe('https://example.com/s/7Hq2');
  });

  test('cancelling while the server answers stops the request and copies nothing', async ({ page }) => {
    await page.click('#share');
    await page.click('#cancel');
    await expect.poll(async () => (await state(page)).outcome).toBe('ignored: cancelled');
    expect((await state(page)).aborted).toBe('yes');
  });
});
