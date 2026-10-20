import { expect, test } from './test';
import { clipboardWrites, collectErrors, paste, recordClipboard } from './helpers';

test.beforeEach(async ({ page }) => {
  await recordClipboard(page);
});

test.describe('copy', () => {
  test('plain text, rich HTML, JSON and a PNG image reach the clipboard', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('copy/use-copy/');
    const row = (name: string) => page.locator(`[data-copy-row][data-name="${name}"]`);

    await row('Email').locator('button').click();
    await expect(row('Email')).toHaveAttribute('data-state', 'copied');
    await row('Rich HTML').locator('button').click();
    await expect(row('Rich HTML')).toHaveAttribute('data-state', 'copied');
    await row('JSON').locator('button').click();
    await expect(row('JSON')).toHaveAttribute('data-state', 'copied');
    await row('Image').locator('button').click();
    await expect(row('Image')).toHaveAttribute('data-state', 'copied');

    const writes = await clipboardWrites(page);
    expect(writes.every((write) => write.ok)).toBe(true);
    const texts = writes.flatMap((write) => [write.text, ...write.items.map((item) => item['text/plain'])]);
    expect(texts).toContain('shubh@example.com');
    expect(writes.some((write) => write.items.some((item) => item['text/html']?.includes('<b>INV-29018</b>')))).toBe(true);
    expect(texts.some((text) => text?.includes('"CUS-77"'))).toBe(true);
    expect(writes.some((write) => write.items.some((item) => 'image/png' in item))).toBe(true);
    expect(errors).toEqual([]);
  });

  test('a failure is reported honestly, never as copied', async ({ page }) => {
    await page.goto('copy/use-copy/');
    const row = page.locator('[data-copy-row][data-name="Failure"]');
    await row.locator('button').click();
    await expect(row).toHaveAttribute('data-state', 'error');
  });

  test('a terminal session copies as its commands, with highlighted HTML', async ({ page }) => {
    await page.goto('modules/code/');
    await page.click('[data-cd-copy]');
    const commands = 'npm install react-smart-copy\nnpx vitest run --coverage\ngit tag v1.12.0 && git push --tags';
    await expect(page.locator('[data-cd-preview]')).toHaveText(commands);
    const writes = await clipboardWrites(page);
    const item = writes.at(-1)?.items[0];
    expect(writes.at(-1)?.ok).toBe(true);
    expect(item?.['text/plain']).toBe(commands);
    expect(item?.['text/html']).toMatch(/^<pre style="font-family:ui-monospace[^"]*"><code class="language-sh">/);
  });
});

test.describe('paste', () => {
  test('rich text becomes Markdown at the cursor, and one Ctrl/Cmd+Z undoes it', async ({ page }) => {
    await page.goto('modules/markdown/');
    const editor = page.locator('[data-md-editor]');
    await editor.fill('Notes: ');
    const handled = await paste(page, '[data-md-editor]', {
      'text/html': '<h2>Plan</h2><p>Ship on <b>Friday</b> with <a href="https://example.com">docs</a>.</p><ul><li>One</li><li>Two</li></ul>',
      'text/plain': 'Plan\nShip on Friday with docs.\nOne\nTwo',
    });
    expect(handled).toBe(true);
    await expect(editor).toHaveValue('Notes: ## Plan\n\nShip on **Friday** with [docs](https://example.com/).\n\n- One\n- Two');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(editor).toHaveValue('Notes: ');
  });

  test('plain text is left to the browser', async ({ page }) => {
    await page.goto('modules/markdown/');
    expect(await paste(page, '[data-md-editor]', { 'text/plain': '**already markdown**' })).toBe(false);
  });

  test('pasted code is cleaned of Trojan Source and lookalikes, indented to the cursor, and undoable', async ({ page }) => {
    await page.goto('modules/code/');
    const editor = page.locator('[data-cd-editor]');
    const before = await editor.inputValue();
    await editor.evaluate((element: HTMLTextAreaElement) => {
      element.setSelectionRange(element.value.length, element.value.length);
    });
    const snippet = ['if (\u0430ccessLevel != "user\u202E \u2066// admins only\u2069 \u2066") {', '  log(\u201Cdenied\u201D);', '}'].join('\n');
    expect(await paste(page, '[data-cd-editor]', { 'text/plain': snippet })).toBe(true);
    await expect(editor).toHaveValue(`${before}if (accessLevel != "user // admins only ") {\n    log("denied");\n  }`);
    await expect(page.locator('[data-cd-findings] li[data-severity="danger"]')).toHaveCount(5);
    await page.keyboard.press('ControlOrMeta+z');
    await expect(editor).toHaveValue(before);
  });
});
