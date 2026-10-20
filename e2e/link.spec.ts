import { expect, test } from './test';
import { expectAccessible, lastWrite, paste, recordClipboard } from './helpers';

test.beforeEach(async ({ page }) => {
  await recordClipboard(page);
  await page.goto('modules/links/');
});

test.describe('links', () => {
  test('Copy link writes a titled link and the clean URL', async ({ page, baseURL }) => {
    const url = new URL('modules/links/?tab=links#try-it', baseURL).href;
    await expect(page.locator('[data-ln-url]')).toHaveText(url);
    await page.click('[data-ln-copy]');
    await expect(page.locator('[data-ln-text]')).toHaveText(url);
    const write = (await lastWrite(page));
    expect(write?.ok).toBe(true);
    expect(write?.items[0]?.['text/plain']).toBe(url);
    expect(write?.items[0]?.['text/html']).toContain(`<a href="${url}">Paste drops the colour profile in Safari 18</a>`);
    await expect(page.locator('[data-ln-html] a')).toHaveAttribute('href', url);
  });

  test('Markdown text keeps tracking parameters only when asked', async ({ page }) => {
    await page.selectOption('[data-ln-format]', 'markdown');
    await page.uncheck('[data-ln-clean]');
    await page.click('[data-ln-copy]');
    await expect(page.locator('[data-ln-text]')).toHaveText(/^\[Paste drops the colour profile in Safari 18\]\(http.*utm_source=newsletter.*fbclid=IwAR0dQx.*\)$/);
    expect((await lastWrite(page))?.ok).toBe(true);
  });

  test('dragging the link carries text/uri-list', async ({ page }) => {
    const types = await page.locator('[data-ln-drag]').evaluate((chip) => {
      const transfer = new DataTransfer();
      chip.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: transfer }));
      return { list: transfer.getData('text/uri-list'), html: transfer.getData('text/html') };
    });
    expect(types.list).toMatch(/\/modules\/links\/\?tab=links#try-it$/);
    expect(types.html).toContain('>Paste drops the colour profile in Safari 18</a>');
  });

  test('a link to the selected words is a text fragment link', async ({ page, baseURL }) => {
    const button = page.locator('[data-ln-selection]');
    await expect(button).toBeDisabled();
    await page.locator('[data-ln-passage]').evaluate((passage) => {
      const text = passage.firstChild as Text;
      const at = text.data.indexOf('scrolls the page');
      const range = document.createRange();
      range.setStart(text, at);
      range.setEnd(text, at + 'scrolls the page'.length);
      const selection = getSelection() as Selection;
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await expect(button).toBeEnabled();
    await button.click();
    const url = new URL('modules/links/#try-it:~:text=scrolls%20the%20page', baseURL).href;
    await expect(page.locator('[data-ln-selection-status]')).toContainText(url);
    const write = (await lastWrite(page));
    expect(write?.ok).toBe(true);
    expect(write?.items[0]?.['text/plain']).toBe(url);
  });

  test('pasting a URL over selected text makes a Markdown link, and one Ctrl/Cmd+Z undoes it', async ({ page }) => {
    const editor = page.locator('[data-ln-editor]');
    await editor.evaluate((element: HTMLTextAreaElement) => {
      const at = element.value.indexOf('release notes');
      element.focus();
      element.setSelectionRange(at, at + 'release notes'.length);
    });
    expect(await paste(page, '[data-ln-editor]', { 'text/plain': 'https://example.com/releases/1.14' })).toBe(true);
    await expect(editor).toHaveValue('The fix is in the [release notes](https://example.com/releases/1.14).');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(editor).toHaveValue('The fix is in the release notes.');
    expect(await paste(page, '[data-ln-editor]', { 'text/plain': 'javascript:alert(1)' })).toBe(false);
  });

  test('the Links panel is accessible', async ({ page }) => {
    await expectAccessible(page, '[data-demo="links"]');
  });
});
