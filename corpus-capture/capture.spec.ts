import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

/**
 * Real clipboard captures from Chromium and Firefox: what each one puts on the system
 * clipboard when a person selects part of an ordinary web page and presses Ctrl/⌘+C. The page
 * is e2e/fixtures/corpus-source.html. Run with `npm run corpus:browsers`, then
 * `npm run corpus:accept` and review test/corpus/expected/.
 *
 * The capture is read back the way an app sees it: a real Ctrl/⌘+V into a field, recording
 * every format of the paste event.
 */
const CASES = ['table', 'list', 'code', 'article'] as const;

async function captureCase(page: Page, id: string): Promise<Record<string, string>> {
  await page.evaluate((section) => {
    const range = document.createRange();
    range.selectNodeContents(document.getElementById(section) as Node);
    const selection = getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, id);
  await page.keyboard.press('ControlOrMeta+c');
  await page.evaluate(() => {
    const sink = document.createElement('div');
    sink.id = 'sink';
    sink.contentEditable = 'true';
    document.body.append(sink);
    sink.focus();
    sink.addEventListener('paste', (event) => {
      const data = event.clipboardData;
      (window as unknown as { __types: Record<string, string> }).__types = Object.fromEntries(
        (data?.types ?? []).filter((type) => type !== 'Files').map((type) => [type.toLowerCase(), data?.getData(type) ?? '']),
      );
      event.preventDefault();
      sink.remove();
    });
  });
  await page.keyboard.press('ControlOrMeta+v');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __types?: unknown }).__types)).toBeTruthy();
  return page.evaluate(() => {
    const types = (window as unknown as { __types: Record<string, string> }).__types;
    Reflect.deleteProperty(window, '__types');
    return types;
  });
}

for (const id of CASES) {
  test(`capture ${id}`, async ({ page, browser, browserName }) => {
    await page.goto('/e2e-fixtures/corpus-source.html');
    const types = await captureCase(page, id);
    expect(Object.keys(types).length).toBeGreaterThan(0);
    const engine = browserName === 'firefox' ? 'Firefox' : 'Chromium';
    const name = `web-${browserName}-${id}`;
    const capture = {
      schema: 1,
      id: name,
      source: {
        app: 'Web page',
        appVersion: 'static HTML (e2e/fixtures/corpus-source.html)',
        os: 'Linux',
        browser: `${engine} ${browser.version()} (Playwright)`,
        capturedAt: new Date().toISOString().slice(0, 10),
      },
      note: `What ${engine} puts on the clipboard for a selection of the "${id}" section, read back through a real paste. Regenerate with npm run corpus:browsers.`,
      types,
    };
    await mkdir('test/corpus/captures', { recursive: true });
    await writeFile(`test/corpus/captures/${name}.capture.json`, `${JSON.stringify(capture, null, 2)}\n`);
  });
}
