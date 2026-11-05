import type { Page } from '@playwright/test';
import type * as Core from '../src/core';
import { expect, test } from './test';

/**
 * The copy-command fallback, in each real engine: the adapter is told the async Clipboard API
 * is missing (as on a plain-HTTP intranet page), so every copy here goes through
 * `execCommand('copy')`. A real paste then shows what reached the system clipboard.
 */
async function install(page: Page): Promise<void> {
  await page.goto('start/quick-start/');
  await page.evaluate(async () => {
    const lib = (await import(new URL('/lib/core.js', location.href).href)) as typeof Core;
    // As on http://intranet/: no secure context, so no async Clipboard API.
    const adapter = lib.createBrowserClipboardAdapter({ getEnvironment: () => ({ isSecureContext: false, navigator: {}, document }) });
    const state = { result: 'none' };
    (window as unknown as { __legacy: typeof state }).__legacy = state;
    const run = (payload: Parameters<typeof adapter.write>[0]) => {
      // Called inside the gesture, as useCopy does.
      adapter.write(payload).then(
        () => (state.result = 'copied'),
        (error: unknown) => (state.result = `error: ${String((error as { copyError?: { type: string } }).copyError?.type)}`),
      );
    };
    const box = document.createElement('div');
    box.id = 'legacy-test';
    box.innerHTML = `
      <button id="copy-text" type="button">text</button>
      <button id="copy-html" type="button">html</button>
      <textarea id="editor" aria-label="editor">one two three</textarea>
      <div id="sink" contenteditable="true" aria-label="sink"></div>`;
    // Above the docs' fixed header, so real clicks reach it. CSSOM: the docs' CSP refuses style attributes.
    box.style.cssText = 'position:fixed;inset:auto 0 0 0;z-index:2147483647;background:Canvas;padding:8px';
    document.body.prepend(box);
    document.querySelector('#copy-text')?.addEventListener('click', () => {
      run({ kind: 'text', value: 'plain from http' });
    });
    document.querySelector('#copy-html')?.addEventListener('click', () => {
      run({ kind: 'html', html: '<b>bold</b> from http', text: 'bold from http' });
    });
    // An editor shortcut: the copy runs while the user's focus and selection are in the field.
    document.querySelector('#editor')?.addEventListener('keydown', (event) => {
      if ((event as KeyboardEvent).key === 'F2') run({ kind: 'text', value: 'from the shortcut' });
    });
    const pasted: Record<string, string>[] = [];
    (window as unknown as { __pasted: typeof pasted }).__pasted = pasted;
    document.querySelector('#sink')?.addEventListener('paste', (event) => {
      const data = (event as ClipboardEvent).clipboardData;
      pasted.push(Object.fromEntries((data?.types ?? []).map((type) => [type, data?.getData(type) ?? ''])));
      event.preventDefault();
    });
  });
}

const result = (page: Page) => page.evaluate(() => (window as unknown as { __legacy: { result: string } }).__legacy.result);

/** Pastes into the sink with the keyboard, the way a person would, and returns what arrived. */
async function pasteBack(page: Page): Promise<Record<string, string> | undefined> {
  await page.locator('#sink').click();
  await page.keyboard.press('ControlOrMeta+v');
  return page.evaluate(() => (window as unknown as { __pasted: Record<string, string>[] }).__pasted.at(-1));
}

test.describe('copying without the async Clipboard API (plain HTTP)', () => {
  test.beforeEach(async ({ page }) => {
    await install(page);
  });

  test('copies text that a real paste then receives', async ({ page }) => {
    await page.click('#copy-text');
    await expect.poll(() => result(page)).toBe('copied');
    expect((await pasteBack(page))?.['text/plain']).toBe('plain from http');
  });

  test('copies HTML as HTML, with its plain-text alternative', async ({ page }) => {
    await page.click('#copy-html');
    await expect.poll(() => result(page)).toBe('copied');
    const pasted = await pasteBack(page);
    expect(pasted?.['text/plain']).toBe('bold from http');
    expect(pasted?.['text/html']).toContain('<b>bold</b> from http');
  });

  test("keeps the user's focus and selection, and leaves nothing in the page", async ({ page }) => {
    const before = await page.evaluate(() => document.body.childElementCount);
    const editor = page.locator('#editor');
    await editor.focus();
    await editor.evaluate((field: HTMLTextAreaElement) => {
      field.setSelectionRange(4, 7);
    });
    await page.keyboard.press('F2');
    await expect.poll(() => result(page)).toBe('copied');
    await expect(editor).toBeFocused();
    expect(await editor.evaluate((field: HTMLTextAreaElement) => [field.selectionStart, field.selectionEnd])).toEqual([4, 7]);
    expect(await page.evaluate(() => document.body.childElementCount)).toBe(before);
    expect((await pasteBack(page))?.['text/plain']).toBe('from the shortcut');
  });
});
