import { readFileSync } from 'node:fs';
import { captureProblems } from '../test/corpus/schema';
import { privacyProblems } from '../test/corpus/privacy';
import type { Page } from '@playwright/test';
import { expect, test } from './test';
import { collectErrors, expectAccessible, paste } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('guides/clipboard-inspector/');
});

const target = '[data-in-target]';

async function fill(page: Page, app: string, version: string): Promise<void> {
  await page.fill('[data-in-field="app"]', app);
  await page.fill('[data-in-field="appVersion"]', version);
}

test.describe('the clipboard inspector', () => {
  test('shows every format of a paste, as the browser gave it', async ({ page }) => {
    const errors = collectErrors(page);
    expect(await paste(page, target, { 'text/html': '<table><tr><td>a</td></tr></table>', 'text/plain': 'a', 'application/x-private': '{"k":1}' })).toBe(true);
    await expect(page.locator('[data-in-status]')).toHaveText('The clipboard held 3 formats.');
    await expect(page.locator('[data-in-formats] summary')).toHaveText(['text/html: 34 characters', 'text/plain: 1 character', 'application/x-private: 7 characters']);
    await expect(page.locator('[data-in-formats] pre').first()).toHaveText('<table><tr><td>a</td></tr></table>');
    await expectAccessible(page, '[data-demo="inspector"]');
    expect(errors).toEqual([]);
  });

  test('downloads a capture the corpus accepts', async ({ page }, info) => {
    await paste(page, target, { 'text/html': '<p>Hello</p>', 'text/plain': 'Hello' });
    await fill(page, 'Microsoft Word', '16.89');
    await page.fill('[data-in-field="note"]', 'One paragraph');
    const download = page.waitForEvent('download');
    await page.click('[data-in-download]');
    const file = await download;
    expect(file.suggestedFilename()).toBe('microsoft-word-html.capture.json');
    const path = info.outputPath('capture.json');
    await file.saveAs(path);
    const capture = JSON.parse(readFileSync(path, 'utf8')) as Parameters<typeof privacyProblems>[0];
    expect(captureProblems(capture, 'microsoft-word-html')).toEqual([]);
    expect(privacyProblems(capture)).toEqual([]);
    expect(capture).toMatchObject({ schema: 1, note: 'One paragraph', types: { 'text/html': '<p>Hello</p>', 'text/plain': 'Hello' }, source: { app: 'Microsoft Word', appVersion: '16.89' } });
    await expect(page.locator('[data-in-saved]')).toHaveText('Saved microsoft-word-html.capture.json.');
  });

  test('names the file after what was copied, so two captures of one app do not collide', async ({ page }) => {
    await paste(page, target, { 'text/html': '<p>Hello</p>', 'text/plain': 'Hello' });
    await fill(page, 'Microsoft Excel', '16.89');
    await page.fill('[data-in-field="what"]', 'Pivot table!');
    const download = page.waitForEvent('download');
    await page.click('[data-in-download]');
    expect((await download).suggestedFilename()).toBe('microsoft-excel-pivot-table-html.capture.json');
    await page.fill('[data-in-field="what"]', '');
    const again = page.waitForEvent('download');
    await page.click('[data-in-download]');
    expect((await again).suggestedFilename()).toBe('microsoft-excel-html.capture.json');
  });

  test('saves only text formats: a paste of only a file is turned away', async ({ page }) => {
    await page.evaluate((selector) => {
      const element = document.querySelector(selector) as HTMLElement;
      const transfer = new DataTransfer();
      transfer.items.add(new File(['pixels'], 'chart.png', { type: 'image/png' }));
      const event = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clipboardData', { value: transfer });
      element.dispatchEvent(event);
    }, target);
    await fill(page, 'Paint', '11');
    await page.click('[data-in-download]');
    await expect(page.locator('[data-in-saved]')).toHaveText('Only text formats can be saved, and this paste held none.');
  });

  test('asks for the source before saving, and keeps files out of the capture', async ({ page }, info) => {
    await page.evaluate((selector) => {
      const element = document.querySelector(selector) as HTMLElement;
      const transfer = new DataTransfer();
      transfer.items.add(new File(['pixels'], 'chart.png', { type: 'image/png' }));
      transfer.setData('text/plain', 'Chart');
      const event = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clipboardData', { value: transfer });
      element.dispatchEvent(event);
    }, target);
    await expect(page.locator('[data-in-formats] li').last()).toHaveText('File chart.png (image/png, 6 bytes). Only this description is saved, never the file.');
    await page.fill('[data-in-field="os"]', '');
    await page.click('[data-in-download]');
    await expect(page.locator('[data-in-saved]')).toHaveText('Fill in the app, its version, your system and browser first.');
    await fill(page, 'Paint', '11');
    await page.fill('[data-in-field="os"]', 'Windows 11');
    await page.fill('[data-in-field="browser"]', 'Edge 130');
    const download = page.waitForEvent('download');
    await page.click('[data-in-download]');
    const path = info.outputPath('files.capture.json');
    await (await download).saveAs(path);
    const capture = JSON.parse(readFileSync(path, 'utf8')) as { files: unknown; types: unknown };
    expect(capture.files).toEqual([{ name: 'chart.png', type: 'image/png', size: 6 }]);
    expect(capture.types).toEqual({ 'text/plain': 'Chart' });
  });

  test('warns about addresses at real domains, and not about reserved ones', async ({ page }) => {
    await paste(page, target, { 'text/plain': 'ana@example.com' });
    await expect(page.locator('[data-in-warnings]')).toBeHidden();
    await paste(page, target, { 'text/plain': 'dee@gmail.com' });
    await expect(page.locator('[data-in-warnings] li')).toContainText('text/plain holds an address at a real domain');
  });

  test("does not take an image's pixel-density suffix for an address, as in Slack's emoji", async ({ page }) => {
    await paste(page, target, { 'text/html': '<img src="https://a.slack-edge.com/emoji/2705@2x.png" alt=":ok:">', 'text/plain': ':ok:' });
    await expect(page.locator('[data-in-status]')).toHaveText('The clipboard held 2 formats.');
    await expect(page.locator('[data-in-warnings]')).toBeHidden();
  });

  test("writes the account name in Office's temporary file paths as user, and says so", async ({ page }, info) => {
    const html = '<link rel=File-List href="file:///C:/Users/ana.k/AppData/Local/Temp/msohtmlclip1/01/clip_filelist.xml"><p>Hi</p>';
    await paste(page, target, { 'text/html': html, 'text/rtf': '{\\rtf1 C:\\\\Users\\\\ana.k\\\\x}', 'text/plain': 'Hi' });
    await expect(page.locator('[data-in-status]')).toHaveText('The clipboard held 3 formats. Your account name in 2 file paths is written as "user".');
    await expect(page.locator('[data-in-formats] pre').first()).toContainText('file:///C:/Users/user/AppData/Local/Temp');
    await expect(page.locator('[data-in-formats]')).not.toContainText('ana.k');
    await fill(page, 'Microsoft Word', '16');
    const download = page.waitForEvent('download');
    await page.click('[data-in-download]');
    const file = info.outputPath('redacted.capture.json');
    await (await download).saveAs(file);
    const capture = JSON.parse(readFileSync(file, 'utf8')) as Parameters<typeof privacyProblems>[0];
    expect(JSON.stringify(capture)).not.toContain('ana.k');
    expect(privacyProblems(capture)).toEqual([]);
  });

  test('shows its examples as examples, so an empty field never reads as filled in', async ({ page }) => {
    await paste(page, target, { 'text/plain': 'x' });
    for (const name of ['app', 'appVersion', 'what', 'note']) {
      const field = page.locator(`[data-in-field="${name}"]`);
      await expect(field).toHaveValue('');
      await expect(field).toHaveAttribute('placeholder', /^e\.g\. /);
      expect(await field.evaluate((input) => getComputedStyle(input, '::placeholder').fontStyle)).toBe('italic');
    }
  });

  test('clear forgets what described the capture, and keeps what describes the machine', async ({ page }) => {
    await paste(page, target, { 'text/plain': 'x' });
    await fill(page, 'Microsoft Excel', '16.89');
    await page.fill('[data-in-field="what"]', 'pivot table');
    await page.fill('[data-in-field="note"]', 'two cells');
    await page.fill('[data-in-field="os"]', 'Windows 11');
    await page.click('[data-in-clear]');
    for (const name of ['app', 'appVersion', 'what', 'note']) await expect(page.locator(`[data-in-field="${name}"]`)).toHaveValue('');
    await expect(page.locator('[data-in-field="os"]')).toHaveValue('Windows 11');
  });

  test('clear starts over, and an empty clipboard says so', async ({ page }) => {
    await paste(page, target, { 'text/plain': 'x' });
    await expect(page.locator('[data-in-result]')).toBeVisible();
    await page.click('[data-in-clear]');
    await expect(page.locator('[data-in-result]')).toBeHidden();
    await expect(page.locator('[data-in-status]')).toHaveText('Nothing pasted yet.');
    await expect(page.locator(target)).toBeFocused();
    await paste(page, target, {});
    await expect(page.locator('[data-in-status]')).toHaveText('The clipboard held nothing this page can read.');
  });
});
