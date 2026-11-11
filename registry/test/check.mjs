/**
 * Runs the registry's components in a real shadcn project (registry/test/App.tsx, built and served
 * by the Registry job at APP_URL) in real browsers: what is copied, what is shown and announced,
 * the secret field, the page as Markdown, and axe (WCAG 2.2 AA and best practices).
 *
 *   APP_URL=http://localhost:4173/ BROWSERS=chromium,firefox,webkit node registry/test/check.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const playwright = require('playwright');
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const APP = process.env.APP_URL;
if (APP === undefined) throw new Error('Set APP_URL to the built app.');
const BROWSERS = (process.env.BROWSERS ?? 'chromium').split(',');

/** Records each clipboard write (every format, as text), and still writes it. */
function record() {
  window.__writes = [];
  const clipboard = navigator.clipboard;
  const writeText = clipboard.writeText.bind(clipboard);
  const write = clipboard.write.bind(clipboard);
  clipboard.writeText = (text) => {
    window.__writes.push({ 'text/plain': text });
    return writeText(text).catch(() => undefined);
  };
  clipboard.write = async (items) => {
    const formats = {};
    for (const item of items) for (const type of item.types) formats[type] = await (await item.getType(type)).text();
    window.__writes.push(formats);
    return write(items).catch(() => undefined);
  };
}

async function check(name) {
  const executablePath = name === 'chromium' ? process.env.PW_CHROMIUM_PATH : undefined;
  const browser = await playwright[name].launch(executablePath ? { executablePath } : {});
  try {
    const context = await browser.newContext(name === 'chromium' ? { permissions: ['clipboard-read', 'clipboard-write'] } : {});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(record);
    await page.goto(APP);
    const written = async (count) => {
      await page.waitForFunction((n) => window.__writes.length === n, count);
      return page.evaluate(() => window.__writes.at(-1));
    };

    // An icon button: copied, a check mark, an announcement, and the same name throughout.
    const invoice = page.getByRole('button', { name: 'Copy invoice number' });
    await invoice.click();
    assert.equal((await written(1))['text/plain'], 'INV-29018');
    await invoice.locator('[data-icon="copied"]').waitFor();
    assert.equal(await invoice.getAttribute('aria-label'), 'Copy invoice number');
    assert.ok((await page.getByRole('status').allTextContents()).includes('Copied'));

    // HTML, with its plain text.
    await page.getByRole('button', { name: 'Copy total' }).click();
    const html = await written(2);
    assert.equal(html['text/plain'], 'Total: ₹ 1,234');
    assert.match(html['text/html'] ?? '', /<b>Total: ₹ 1,234<\/b>/);

    // A field.
    await page.getByRole('button', { name: 'Copy Invite link' }).click();
    assert.equal((await written(3))['text/plain'], 'https://example.com/invite/42');
    assert.equal(await page.getByRole('textbox', { name: 'Invite link', exact: true }).inputValue(), 'https://example.com/invite/42');

    // A secret: hidden and away from password managers, revealed on request, copied as it is.
    const key = page.locator(`#${await page.getByText('API key', { exact: true }).getAttribute('for')}`);
    assert.deepEqual(await key.evaluate((input) => [input.type, input.autocomplete]), ['password', 'off']);
    const toggle = page.getByRole('button', { name: 'Show API key' });
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
    await toggle.click();
    assert.equal(await key.getAttribute('type'), 'text');
    assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: 'Copy API key' }).click();
    assert.equal((await written(4))['text/plain'], 'sk_test_EXAMPLE0123456789');

    // The page as Markdown: its heading first, links absolute, the demo left out.
    await page.getByRole('button', { name: 'Copy page', exact: true }).click();
    assert.equal((await written(5))['text/plain'], `# Release notes\n\n## Setup\n\nRead [the start](${new URL('/docs/start/', APP).href}).\n`);

    await page.evaluate(AXE);
    const violations = await page.evaluate(async () => {
      const result = await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'] });
      return result.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`);
    });
    assert.deepEqual(violations, []);
    assert.deepEqual(errors, []);
    console.log(`${name}: every check passed`);
  } finally {
    await browser.close();
  }
}

for (const name of BROWSERS) await check(name);
