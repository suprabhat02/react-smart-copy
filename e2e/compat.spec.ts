import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'tsdown';
import { expect, test } from './test';
import { lastWrite, recordClipboard } from './helpers';

/**
 * react-smart-copy/compat's CopyToClipboard in a real React app, bundled (by the bundler that
 * builds the package) against dist/, what npm ships, in each engine: the click is a real one, so
 * Safari's rule that a write must start inside the user's action is checked here, not assumed.
 */
let app = '';

test.beforeAll(async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'rsc-compat-'));
  try {
    await build({
      entry: { app: fileURLToPath(new URL('fixtures/compat-app.tsx', import.meta.url)) },
      outDir,
      format: 'iife',
      platform: 'browser',
      dts: false,
      sourcemap: false,
      config: false,
      logLevel: 'silent',
      deps: { alwaysBundle: [/./] },
      alias: { 'react-smart-copy/compat': fileURLToPath(new URL('../dist/compat.js', import.meta.url)) },
      define: { 'process.env.NODE_ENV': '"production"' },
    });
    app = readFileSync(join(outDir, 'app.iife.js'), 'utf8');
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test.beforeEach(async ({ page }) => {
  await recordClipboard(page);
  await page.goto('/e2e-fixtures/compat.html');
  await page.addScriptTag({ content: app });
  await expect(page.getByRole('button', { name: 'Copy invoice' })).toBeVisible();
});

test.describe('CopyToClipboard (react-smart-copy/compat)', () => {
  test('copies the text and calls onCopy(text, true, outcome)', async ({ page }) => {
    await page.getByRole('button', { name: 'Copy invoice' }).click();
    await expect(page.locator('[data-result="plain"]')).toHaveText('INV-29018|true|copied');
    const write = await lastWrite(page);
    expect(write?.text ?? write?.items[0]?.['text/plain']).toBe('INV-29018');
  });

  test('with format text/html, writes the HTML and its plain text, without the script', async ({ page }) => {
    await page.getByRole('button', { name: 'Copy total' }).click();
    await expect(page.locator('[data-result="html"]')).toHaveText('true');
    const write = await lastWrite(page);
    const item = write?.items[0] ?? {};
    expect(item['text/html']).toContain('<p>Total: <b>₹ 1,234</b></p>');
    expect(item['text/plain']).toBe('Total: ₹ 1,234');
  });

  test('reports to onCopy after a menu that closes on click has unmounted it', async ({ page }) => {
    await page.getByRole('menuitem', { name: 'Copy link' }).click();
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(page.locator('[data-result="menu"]')).toHaveText('Link copied');
    const write = await lastWrite(page);
    expect(write?.text ?? write?.items[0]?.['text/plain']).toBe('https://example.com/doc/42');
  });
});
