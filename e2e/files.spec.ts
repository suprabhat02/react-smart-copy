import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, test } from './test';
import { collectErrors, expectAccessible } from './helpers';
import type * as FilesModule from '../src/files';

const sha256 = (file: string): string => createHash('sha256').update(readFileSync(`e2e/fixtures/${file}`)).digest('hex');

/** Loads the built `react-smart-copy/files` into a docs page. */
async function open(page: Page): Promise<void> {
  await page.goto('start/introduction/');
  await page.evaluate(async () => {
    const url = '/lib/files.js'; // The built package, served by e2e/serve.js.
    (window as unknown as { files: unknown }).files = (await import(url)) as unknown;
  });
}

test.describe('acceptFiles in a real browser', () => {
  test('reads real images by content, through a real DataTransfer, with SHA-256 and typed uploads', async ({ page }) => {
    await open(page);
    const result = await page.evaluate(async () => {
      const { acceptFiles } = (window as unknown as { files: typeof FilesModule }).files;
      const transfer = new DataTransfer();
      for (const [name, claimed] of [
        ['photo.jpg', 'image/jpeg'],
        ['shot.png', 'image/png'],
        ['pic.webp', 'image/webp'],
        ['anim.gif', 'image/gif'],
      ] as const) {
        const blob = await (await fetch(`/e2e-fixtures/${name}`)).blob();
        // Claimed types are never trusted: give each a wrong one.
        transfer.items.add(new File([blob], name === 'shot.png' ? 'shot.jpg' : name, { type: claimed === 'image/png' ? 'image/gif' : 'text/plain' }));
      }
      transfer.items.add(new File([new Uint8Array([0x4d, 0x5a, 0x90, 0])], 'invoice.pdf.exe'));
      const { accepted, rejected } = await acceptFiles({ dataTransfer: transfer }, { digest: true });
      return {
        accepted: accepted.map((file) => ({ path: file.path, type: file.type, sha256: file.sha256, upload: [file.upload instanceof File, (file.upload as File).name, file.upload.type] })),
        rejected: rejected.map((file) => [file.path, file.reason, file.risks]),
      };
    });
    expect(result.accepted).toEqual([
      { path: 'photo.jpg', type: 'image/jpeg', sha256: sha256('photo.jpg'), upload: [true, 'photo.jpg', 'image/jpeg'] },
      { path: 'pic.webp', type: 'image/webp', sha256: sha256('pic.webp'), upload: [true, 'pic.webp', 'image/webp'] },
      { path: 'anim.gif', type: 'image/gif', sha256: sha256('anim.gif'), upload: [true, 'anim.gif', 'image/gif'] },
    ]);
    expect(result.rejected).toEqual([
      ['shot.jpg', 'blocked', ['type-mismatch']],
      ['invoice.pdf.exe', 'blocked', ['executable', 'double-extension']],
    ]);
  });
});

test.describe('the files demo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('modules/files/');
  });

  test('the sample set: safe files added, risky ones turned away with a reason', async ({ page }) => {
    const errors = collectErrors(page);
    await page.click('[data-fl-sample]');
    await expect(page.locator('[data-fl-status]')).toHaveText('3 files added (118 bytes), 7 not added.');
    await expect(page.locator('[data-fl-accepted] .fl-name')).toHaveText(['Q3 report.pdf', 'chart.png', 'revenue.csv']);
    await expect(page.locator('[data-fl-rejected] li')).toHaveText([
      /revenue \(1\)\.csvrevenue \(1\)\.csv is the same file as revenue\.csv\./,
      /invoice\.pdf.*web page or SVG that can run scripts/,
      /invoice\.pdf\.exe.*is a program or script/,
      /photogpj\.exe.*is a program or script/,
      /budget\.docm.*can contain macros/,
      /logo\.svg.*web page or SVG/,
      /notes\.txt.*is empty/,
    ]);
    await expectAccessible(page, '[data-demo="files"]');
    expect(errors).toEqual([]);
  });

  test('options change what is accepted', async ({ page }) => {
    await page.check('[data-fl-active]');
    await page.uncheck('[data-fl-digest]');
    await page.selectOption('[data-fl-accept]', '.csv,.xlsx,text/csv');
    await page.click('[data-fl-sample]');
    await expect(page.locator('[data-fl-accepted] .fl-name')).toHaveText(['revenue.csv', 'revenue (1).csv']);
    await expect(page.locator('[data-fl-rejected] li', { hasText: 'logo.svg' })).toContainText('is not a type of file that can be added here.');
    await expect(page.locator('[data-fl-rejected] li', { hasText: 'invoice.pdf' }).first()).toContainText('is not the type of file its name says.');
  });

  test('a drop on the zone is read through acceptFiles', async ({ page }) => {
    await page.evaluate(() => {
      const zone = document.querySelector('[data-fl-zone]') as HTMLElement;
      const transfer = new DataTransfer();
      transfer.items.add(new File(['%PDF-1.7\n'], 'scan.pdf', { type: 'application/pdf' }));
      transfer.items.add(new File(['<html><script>x()</script></html>'], 'notes.txt', { type: 'text/plain' }));
      zone.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
    });
    await expect(page.locator('[data-fl-accepted] .fl-name')).toHaveText(['scan.pdf']);
    await expect(page.locator('[data-fl-rejected] li')).toHaveText([/notes\.txt.*web page or SVG/]);
  });
});
