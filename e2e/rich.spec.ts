import type { Page } from '@playwright/test';
import { expect, test } from './test';
import { expectAccessible, lastWrite, recordClipboard } from './helpers';

test.beforeEach(async ({ page }) => {
  await recordClipboard(page);
});

/** Selects `selector`'s contents and dispatches a copy event, as Ctrl/Cmd+C would; returns what was written. */
async function nativeCopy(page: Page, selector: string): Promise<Record<string, string>> {
  return page.evaluate((target) => {
    const element = document.querySelector(target) as Element;
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = getSelection() as Selection;
    selection.removeAllRanges();
    selection.addRange(range);
    const transfer = new DataTransfer();
    const event = new Event('copy', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: transfer });
    element.dispatchEvent(event);
    return Object.fromEntries(transfer.types.map((type) => [type, transfer.getData(type)]));
  }, selector);
}

test.describe('rich text', () => {
  test('a styled card copies as portable HTML: inline styles, hex colours, absolute links, no chrome', async ({ page, baseURL }) => {
    await page.goto('modules/rich-text/');
    await page.click('[data-rt-copy]');
    const write = await lastWrite(page);
    expect(write?.ok).toBe(true);
    const html = write?.items[0]?.['text/html'] ?? '';
    const text = write?.items[0]?.['text/plain'] ?? '';
    // Only what travels: no classes, no modern colour syntax, no button, no tracking pixel.
    expect(html).not.toMatch(/class=|oklch|<button|<img|data:image|position|display/);
    expect(html).toContain('INC-4821: Checkout latency');
    expect(html).toMatch(/<span style="[^"]*background-color:#[\da-f]{6}[^"]*color:#[\da-f]{6}[^"]*">Resolved<\/span>/);
    expect(html).toContain(`<a href="${new URL('modules/rich-text/#try-it', baseURL).href}"`);
    expect(html).toMatch(/<table style="[^"]*border-collapse:collapse/);
    expect(html).toMatch(/<td style="[^"]*border-bottom:1px solid #[\da-f]{6}/);
    expect(text).toContain('INC-4821: Checkout latency');
    expect(text).toContain('Metric\tBefore\tPeak');
    expect(text).not.toContain('Edit');
    await expect(page.locator('[data-rt-removed]')).toContainText('button');
    await expect(page.locator('[data-rt-removed]')).toContainText("Image that can't travel");
  });

  test('in dark mode: a card keeps its own dark background, and text without one takes the destination colour', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('modules/rich-text/');
    await page.click('[data-rt-copy]');
    const html = (await lastWrite(page))?.items[0]?.['text/html'] ?? '';
    // The card brings its dark background, so its light ink stays readable.
    expect(html).toMatch(/^<div style="background-color:#0e1d17;[^"]*color:#ecf3ec/);
    // A paragraph without a background of its own would carry light ink onto a white page: it doesn't.
    const native = await nativeCopy(page, '[data-rt-native]');
    expect(native['text/html']).toContain('colours every mail client understands');
    expect(native['text/html']).not.toMatch(/color:#/);
  });

  test('Ctrl/Cmd+C of a selection writes portable HTML too', async ({ page, baseURL }) => {
    await page.goto('modules/rich-text/');
    const written = await nativeCopy(page, '[data-rt-native]');
    expect(written['text/html']).toContain('<strong>bold</strong>');
    expect(written['text/html']).toContain(`<a href="${new URL('modules/rich-text/#try-it', baseURL).href}"`);
    expect(written['text/html']).toMatch(/<span style="color:#[\da-f]{6}">colours every mail client understands<\/span>/);
    expect(written['text/html']).not.toMatch(/oklch|class=/);
    expect(written['text/plain']).toContain('Select any part of this paragraph');
    await expect(page.locator('[data-rt-native-status]')).toHaveText('Copied as portable HTML: paste it into a mail or a document.');
  });

  test('pasting from Google Docs gives clean, semantic HTML: no styles, classes or scripts', async ({ page }) => {
    await page.goto('modules/rich-text/');
    await page.click('[data-rt-sample]');
    const editor = page.locator('[data-rt-editor]');
    await expect(editor.locator('h2')).toHaveText('Launch checklist');
    await expect(editor.locator('strong', { hasText: 'Thursday' })).toHaveCount(1);
    await expect(editor.locator('em')).toHaveText('final');
    await expect(editor.locator('a')).toHaveAttribute('href', 'https://example.com/notes');
    await expect(editor.locator('li')).toHaveCount(2);
    await expect(editor.locator('code')).toHaveText('main');
    await expect(editor.locator('td')).toHaveCount(4);
    expect(await editor.evaluate((element) => element.querySelectorAll('[style], [class], [id], script, img, b, span').length)).toBe(0);
    // No event handler reached the page: not on any element in the editor, and none ran (the fixture checks dialogs).
    expect(await editor.evaluate((element) => Array.from(element.querySelectorAll('*')).flatMap((node) => node.getAttributeNames()).filter((name) => name.startsWith('on')))).toEqual([]);
    await expect(page.locator('[data-rt-paste-status]')).toHaveText('Pasted clean HTML. Left out: image with a relative address, <script>.');
    await expect(page.locator('[data-rt-paste-html]')).toContainText('<h2>Launch checklist</h2>');
  });

  test('a paste event from Word: real lists, then Ctrl/Cmd+Z undoes the paste', async ({ page }) => {
    await page.goto('modules/rich-text/');
    const editor = page.locator('[data-rt-editor]');
    await editor.click();
    await page.evaluate(() => {
      const target = document.querySelector('[data-rt-editor]') as HTMLElement;
      const transfer = new DataTransfer();
      transfer.setData('text/html', '<p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">1.</span>Budget</p><p style="mso-list:l0 level2 lfo1"><span style="mso-list:Ignore">o</span>Q4</p><p class=MsoNormal><b>Thanks<o:p></o:p></b></p>');
      transfer.setData('text/plain', 'Budget\nQ4\nThanks');
      const event = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clipboardData', { value: transfer });
      target.dispatchEvent(event);
    });
    await expect(editor.locator('ol > li')).toHaveCount(1);
    await expect(editor.locator('ol > li > ul > li')).toHaveText('Q4');
    await expect(editor.locator('strong')).toHaveText('Thanks');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    await expect(editor).toHaveText('');
  });

  test('a comment box keeps only bold, italic, links and lists, and all of the text', async ({ page }) => {
    await page.goto('modules/rich-text/');
    await page.selectOption('[data-rt-kind]', 'comment');
    await page.click('[data-rt-sample]');
    const editor = page.locator('[data-rt-editor]');
    await expect(editor.locator('h2, table, code, s, u')).toHaveCount(0);
    await expect(editor.locator('strong').first()).toHaveText('Launch checklist');
    await expect(editor).toContainText('Release notes');
  });

  test('the Rich text panel is accessible', async ({ page }) => {
    await page.goto('modules/rich-text/');
    await expectAccessible(page, '[data-demo="rich"]');
  });
});
