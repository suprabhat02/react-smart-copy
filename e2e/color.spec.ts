import type * as ColorModule from '../src/color';
import { expect, test } from './test';
import { expectAccessible, lastWrite, paste, recordClipboard } from './helpers';

/**
 * Opaque colours inside sRGB, in every notation: the browser and the library must
 * draw the same pixel. Out-of-range hsl() (such as 150% saturation) is left out:
 * WebKit draws it differently from Chromium and Firefox, which clamp as the library does.
 */
const SAME_PIXEL = [
  '#3b82f6',
  '#abc',
  'rebeccapurple',
  'rgb(59 130 246)',
  'rgb(59, 130, 246)',
  'rgb(100% 50% 0%)',
  'rgb(300 -20 128)',
  'rgb(none 128 255)',
  'hsl(217 91% 60%)',
  'hsl(217deg, 91%, 60%)',
  'hsl(0.5turn 50% 50%)',
  'hsl(3.14159rad 50% 50%)',
  'hsl(200grad 50% 50%)',
  'hwb(120 10% 20%)',
  'hwb(0 60% 60%)',
  'lab(54.29 80.8 69.89)',
  'lab(50% 20% -30%)',
  'lch(54.29 106.84 40.85)',
  'oklab(0.628 0.2249 0.1258)',
  'oklch(62.8% 0.2577 29.23)',
  'oklch(70% 0.1 200)',
  'oklch(70% 0.1 none)',
  'color(srgb 0.2 0.4 0.6)',
  'color(srgb-linear 0.2 0.4 0.6)',
  'color(xyz-d65 0.2 0.3 0.4)',
  'color(xyz-d50 0.2 0.3 0.4)',
  'color(display-p3 0.3 0.5 0.7)',
];

/** Not colours: whenever the browser rejects one, the library must too. */
const MAYBE_INVALID = [
  'rgb(255, 0%, 0)',
  'hsl(0, 100, 50)',
  '#ff',
  'rgb(255 0)',
  'hwb(0, 0%, 0%)',
  'lab(50, 0, 0)',
  'blurple',
  'rgb(255 0 0 / 1 / 1)',
  'rgb(255, 0, none)',
  'oklch(50% 0.1deg 20)',
  'color(srgb, 1, 0, 0)',
  'hsl(0px 100% 50%)',
];

test.beforeEach(async ({ page }) => {
  await recordClipboard(page);
  await page.goto('/#try-colors');
});

test.describe('colours', () => {
  test('the library and the browser draw every notation as the same pixel', async ({ page }) => {
    const results = await page.evaluate(async (colors) => {
      const lib = (await import(new URL('./color.js', location.href).href)) as typeof ColorModule;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
      return colors.map((css) => {
        const ours = lib.parseColor(css);
        if (ours === null || !CSS.supports('color', css)) return { css, skipped: ours === null ? 'library' : 'browser' };
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = css;
        context.fillRect(0, 0, 1, 1);
        const pixel = Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3));
        const hex = lib.formatColor(ours, 'hex', { gamut: 'clip' });
        const mine = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
        return { css, pixel, mine, inGamut: lib.inGamut(ours) };
      });
    }, SAME_PIXEL);
    for (const result of results) {
      expect(result.skipped, `${result.css} should be read by both`).toBeUndefined();
      if (result.inGamut === false) continue;
      for (const [index, value] of (result.pixel as number[]).entries()) {
        expect(Math.abs(value - ((result.mine as number[])[index] as number)), `${result.css}: browser ${JSON.stringify(result.pixel)}, library ${JSON.stringify(result.mine)}`).toBeLessThanOrEqual(1);
      }
    }
  });

  test('what the browser rejects as a colour, the library rejects too', async ({ page }) => {
    const accepted = await page.evaluate(async (colors) => {
      const lib = (await import(new URL('./color.js', location.href).href)) as typeof ColorModule;
      return colors.filter((css) => !CSS.supports('color', css) && lib.parseColor(css) !== null);
    }, MAYBE_INVALID);
    expect(accepted).toEqual([]);
  });

  test('a swatch copies the colour in the chosen format, with a swatch for rich text', async ({ page }) => {
    await page.selectOption('[data-cl-format]', 'oklch');
    await page.click('[data-name="blue-600"]');
    await expect(page.locator('[data-cl-preview]')).toHaveText('oklch(54.61% 0.21521 262.88)');
    const write = (await lastWrite(page));
    expect(write?.ok).toBe(true);
    expect(write?.items[0]?.['text/plain']).toBe('oklch(54.61% 0.21521 262.88)');
    expect(write?.items[0]?.['text/html']).toContain('background:#2563eb');
    await page.selectOption('[data-cl-format]', 'hex');
    await page.click('[data-name="red-p3"]');
    await expect(page.locator('[data-cl-preview]')).toHaveText(/^#[\da-f]{6}$/);
  });

  test('pasting any colour into the hex field inserts hex, and one Ctrl/Cmd+Z undoes it', async ({ page }) => {
    const field = page.locator('[data-cl-hex]');
    await field.evaluate((input: HTMLInputElement) => {
      input.focus();
      input.select();
    });
    expect(await paste(page, '[data-cl-hex]', { 'text/plain': 'background-color: rgb(37 99 235);' })).toBe(true);
    await expect(field).toHaveValue('#2563eb');
    await expect(page.locator('[data-cl-hex-status]')).toHaveText('Pasted as #2563eb.');
    expect(await paste(page, '[data-cl-hex]', { 'text/plain': 'not a colour' })).toBe(false);
  });

  test('the contrast checker reports the WCAG level as you type', async ({ page }) => {
    const ratio = page.locator('[data-cl-ratio]');
    await expect(ratio).toHaveText('4.54 : 1. Normal text: AA. Large text: AAA.');
    await page.fill('[data-cl-fg]', '#999');
    await expect(ratio).toHaveText('2.85 : 1. Normal text: fail. Large text: fail.');
    await page.fill('[data-cl-bg]', 'nope');
    await expect(ratio).toHaveText('Enter a CSS colour in both fields.');
    await expect(page.locator('[data-cl-bg]')).toHaveAttribute('aria-invalid', 'true');
  });

  test('the Colours panel is accessible', async ({ page }) => {
    await expectAccessible(page, '#panel-colors');
  });
});
