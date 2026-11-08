import type { Page } from '@playwright/test';
import type * as Core from '../src/core';
import { expect, test } from './test';

/**
 * Copy interceptors around and inside web components (Shoelace, Ionic, Salesforce Lightning
 * build their inputs and cards in shadow DOM). Real selections and real key presses; a window
 * listener, which runs after the library's, records what the copy event carried.
 */
async function install(page: Page): Promise<void> {
  await page.goto('start/quick-start/');
  await page.evaluate(async () => {
    const core = (await import(new URL('/lib/core.js', location.href).href)) as typeof Core;
    const wrapper = document.createElement('section');
    wrapper.id = 'wrapper';
    wrapper.style.cssText = 'position:fixed;inset:0 0 auto 0;z-index:2147483647;background:Canvas;padding:8px';
    const card = document.createElement('x-card');
    wrapper.append(card);
    document.body.prepend(wrapper);
    const outer = card.attachShadow({ mode: 'open' });
    outer.innerHTML = '<p id="para">Account notes inside a component</p><input id="key" aria-label="API key" value="sk-live-0123456789abcdef"><x-row id="row"></x-row><div id="own"><p id="own-text">Scoped inside the component</p></div>';
    // A component inside a component: two shadow roots deep.
    const nested = (outer.getElementById('row') as HTMLElement).attachShadow({ mode: 'open' });
    nested.innerHTML = '<span id="deep">Two levels down</span>';
    // A redaction scope around the component, from the outside, as an app would register it.
    core.registerCopyInterceptor(wrapper, { transform: ({ text }) => (text.includes('sk-live') ? '[redacted]' : `${text} (from the app)`) });
    // A scope inside the component's own tree.
    core.registerCopyInterceptor(outer.getElementById('own') as Element, { priority: 5, transform: ({ text }) => `${text} (component scope)` });
    const seen: { prevented: boolean; text: string }[] = [];
    window.addEventListener('copy', (event) => seen.push({ prevented: event.defaultPrevented, text: event.clipboardData?.getData('text/plain') ?? '' }));
    (window as unknown as { __seen: typeof seen; __outer: ShadowRoot; __nested: ShadowRoot }).__seen = seen;
    (window as unknown as { __outer: ShadowRoot }).__outer = outer;
    (window as unknown as { __nested: ShadowRoot }).__nested = nested;
  });
}

/** Selects an element's text the way a person does: a drag from its start to its end. */
async function dragSelect(page: Page, root: '__outer' | '__nested', id: string): Promise<void> {
  const box = await page.evaluate(
    ([key, target]) => {
      const element = (window as unknown as Record<string, ShadowRoot>)[key]?.getElementById(target);
      const range = document.createRange();
      range.selectNodeContents(element as Node);
      const rect = range.getBoundingClientRect();
      return { left: rect.left, right: rect.right, y: rect.top + rect.height / 2 };
    },
    [root, id] as const,
  );
  await page.mouse.move(box.left + 1, box.y);
  await page.mouse.down();
  await page.mouse.move(box.right - 1, box.y, { steps: 8 });
  await page.mouse.up();
}

const lastCopy = (page: Page) => page.evaluate(() => (window as unknown as { __seen: { prevented: boolean; text: string }[] }).__seen.at(-1));

test.describe('copy interceptors and web components', () => {
  test.beforeEach(async ({ page }) => {
    await install(page);
  });

  test('a scope around a component handles text selected inside it', async ({ page }) => {
    await dragSelect(page, '__outer', 'para');
    await page.keyboard.press('ControlOrMeta+c');
    const copied = await lastCopy(page);
    expect(copied?.prevented).toBe(true);
    expect(copied?.text).toMatch(/^Account notes inside a componen.* \(from the app\)$/);
  });

  test("redacts a key copied from an input inside a component's shadow root", async ({ page }) => {
    await page.evaluate(() => {
      const field = (window as unknown as { __outer: ShadowRoot }).__outer.getElementById('key') as HTMLInputElement;
      field.focus();
      field.select();
    });
    await page.keyboard.press('ControlOrMeta+c');
    const copied = await lastCopy(page);
    expect(copied?.prevented).toBe(true);
    expect(copied?.text).toBe('[redacted]');
  });

  test('reaches into a component inside a component', async ({ page }) => {
    await dragSelect(page, '__nested', 'deep');
    await page.keyboard.press('ControlOrMeta+c');
    const copied = await lastCopy(page);
    expect(copied?.prevented).toBe(true);
    expect(copied?.text).toMatch(/^Two levels dow.* \(from the app\)$/);
  });

  test("a scope inside the component's own tree still wins by priority", async ({ page }) => {
    await dragSelect(page, '__outer', 'own-text');
    await page.keyboard.press('ControlOrMeta+c');
    const copied = await lastCopy(page);
    expect(copied?.prevented).toBe(true);
    expect(copied?.text).toMatch(/^Scoped inside the componen.* \(component scope\)$/);
  });

  test('drag-to-copy works from inside a component', async ({ page }) => {
    await page.evaluate(async () => {
      const core = (await import(new URL('/lib/core.js', location.href).href)) as typeof Core;
      const chip = document.createElement('x-chip');
      chip.style.cssText = 'position:fixed;top:120px;left:10px;z-index:2147483647;background:Canvas';
      document.body.append(chip);
      chip.attachShadow({ mode: 'open' }).innerHTML = '<span id="handle" style="display:inline-block;padding:16px">Order 29018</span>';
      const target = document.createElement('div');
      target.id = 'drop-target';
      target.style.cssText = 'position:fixed;top:260px;left:10px;width:300px;height:80px;z-index:2147483647;background:Canvas';
      document.body.append(target);
      const dropped: string[] = [];
      (window as unknown as { __dropped: string[] }).__dropped = dropped;
      target.addEventListener('dragover', (event) => {
        event.preventDefault();
      });
      target.addEventListener('drop', (event) => {
        event.preventDefault();
        dropped.push(event.dataTransfer?.getData('text/plain') ?? '');
      });
      // Registered on the component's host, from the outside.
      core.registerDragCopy(chip, { source: () => 'ORD-29018' });
    });
    await page.mouse.move(40, 140);
    await page.mouse.down();
    await page.mouse.move(80, 280, { steps: 12 });
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __dropped: string[] }).__dropped)).toEqual(['ORD-29018']);
  });
});
