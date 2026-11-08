import type { Frame, Page } from '@playwright/test';
import type * as Core from '../src/core';
import { expect, test } from './test';

/**
 * A copy button inside an app embedded from another origin, with no `allow="clipboard-write"`:
 * how a Microsoft Teams tab, a SharePoint web part or a Storybook canvas runs. Chromium blocks
 * the async Clipboard API there; the library's default adapter, with no options, must still
 * copy. A real paste in the same frame shows what reached the system clipboard.
 */
async function embeddedApp(page: Page): Promise<Frame> {
  await page.goto('/e2e-fixtures/frame-host.html');
  await page.frameLocator('#app').locator('main').waitFor();
  const frame = page.frames().find((candidate) => candidate !== page.mainFrame() && candidate.url().includes('/start/quick-start/'));
  if (frame === undefined) throw new Error('The embedded app did not load.');
  await frame.evaluate(async () => {
    const core = (await import(new URL('/lib/core.js', location.href).href)) as typeof Core;
    // The default adapter, exactly as useCopy uses it.
    const copier = core.createCopyMachine();
    const state = { outcome: 'none', blocked: 'unknown' };
    (window as unknown as { __embedded: typeof state }).__embedded = state;
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;inset:auto 0 0 0;z-index:2147483647;background:Canvas;padding:8px';
    const button = document.createElement('button');
    button.id = 'copy-in-frame';
    button.textContent = 'Copy';
    const probe = document.createElement('button');
    probe.id = 'probe-async';
    probe.textContent = 'Probe';
    const sink = document.createElement('div');
    sink.id = 'sink';
    sink.contentEditable = 'true';
    sink.setAttribute('aria-label', 'sink');
    sink.textContent = '·';
    box.append(button, probe, sink);
    document.body.append(box);
    button.addEventListener('click', () => {
      void copier.copy({ kind: 'html', html: '<b>Order</b> 29018', text: 'Order 29018' }).then((outcome) => {
        state.outcome = outcome.status === 'error' ? `error: ${outcome.error.type}` : outcome.status;
      });
    });
    // What the async API itself does in this frame, to show which path the copy took.
    probe.addEventListener('click', () => {
      navigator.clipboard.writeText('probe').then(
        () => (state.blocked = 'no'),
        (error: unknown) => (state.blocked = (error as Error).name),
      );
    });
    const pasted: Record<string, string>[] = [];
    (window as unknown as { __pasted: typeof pasted }).__pasted = pasted;
    sink.addEventListener('paste', (event) => {
      const data = event.clipboardData;
      pasted.push(Object.fromEntries((data?.types ?? []).map((type) => [type, data?.getData(type) ?? ''])));
      event.preventDefault();
    });
  });
  return frame;
}

const read = <T>(frame: Frame, key: string): Promise<T> => frame.evaluate((name) => (window as unknown as Record<string, T>)[name] as T, key);

test.describe('copying from an app embedded in another site (Teams tab, SharePoint web part)', () => {
  test('the async Clipboard API is blocked there in Chromium, as in the real hosts', async ({ page, browserName }) => {
    const frame = await embeddedApp(page);
    await frame.click('#probe-async');
    await expect.poll(async () => (await read<{ blocked: string }>(frame, '__embedded')).blocked).not.toBe('unknown');
    // Firefox and WebKit have no clipboard-write permissions policy: the async API works in frames.
    expect((await read<{ blocked: string }>(frame, '__embedded')).blocked).toBe(browserName === 'chromium' ? 'NotAllowedError' : 'no');
  });

  test('a copy button still copies, as HTML, with no options', async ({ page }) => {
    const frame = await embeddedApp(page);
    await frame.click('#copy-in-frame');
    await expect.poll(async () => (await read<{ outcome: string }>(frame, '__embedded')).outcome).toBe('copied');
    await frame.click('#sink');
    await page.keyboard.press('ControlOrMeta+v');
    await expect.poll(async () => (await read<Record<string, string>[]>(frame, '__pasted')).length).toBe(1);
    const [last] = await read<Record<string, string>[]>(frame, '__pasted');
    expect(last?.['text/plain']).toBe('Order 29018');
    // Safari rewrites pasted HTML with inline styles: check the structure, not the exact markup.
    const bold = await frame.evaluate((html) => new DOMParser().parseFromString(html, 'text/html').querySelector('b')?.textContent, last?.['text/html'] ?? '');
    expect(bold).toBe('Order');
  });
});
