import type { Page } from '@playwright/test';
import { expect, test } from './test';
import type * as ImageModule from '../src/image';

const FIXTURES = ['photo.jpg', 'progressive.jpg', 'shot.png', 'pic.webp', 'anim.gif'];

/** Loads the built `react-smart-copy/image` into a docs page. */
async function open(page: Page): Promise<void> {
  await page.goto('start/introduction/');
  await page.evaluate(async () => {
    const url = '/lib/image.js'; // The built package, served by e2e/serve.js.
    (window as unknown as { image: unknown }).image = (await import(url)) as unknown;
  });
}

test.describe('stripMetadata in a real browser', () => {
  for (const name of FIXTURES) {
    test(`${name}: same pixels and the same displayed size after stripping, metadata gone`, async ({ page }) => {
      await open(page);
      const result = await page.evaluate(async (file) => {
        const { stripMetadata, readImageInfo } = (window as unknown as { image: typeof ImageModule }).image;
        const original = await (await fetch(`/e2e-fixtures/${file}`)).blob();
        const { blob, removed } = await stripMetadata(original);
        /** Decodes as the browser displays it (an <img>), and reads the pixels. */
        const pixels = async (source: Blob) => {
          const url = URL.createObjectURL(source);
          const img = new Image();
          img.src = url;
          await img.decode();
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const context = canvas.getContext('2d') as CanvasRenderingContext2D;
          context.drawImage(img, 0, 0);
          URL.revokeObjectURL(url);
          return { width: img.naturalWidth, height: img.naturalHeight, data: Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data) };
        };
        const before = await pixels(original);
        const after = await pixels(blob);
        let differences = 0;
        for (let index = 0; index < before.data.length; index += 1) if (before.data[index] !== after.data[index]) differences += 1;
        return {
          removed,
          sizes: [before.width, before.height, after.width, after.height],
          differences,
          left: (await readImageInfo(blob)).metadata,
        };
      }, name);
      expect(result.removed.length).toBeGreaterThan(0);
      expect(result.left.filter((kind) => kind !== 'icc')).toEqual([]);
      expect(result.sizes.slice(2)).toEqual(result.sizes.slice(0, 2));
      expect(result.differences).toBe(0);
    });
  }
});

test.describe('prepareImage in a real browser', () => {
  test('resizes a turned photo upright, and the result decodes at the size it reports', async ({ page }) => {
    await open(page);
    const result = await page.evaluate(async () => {
      const { prepareImage, readImageInfo } = (window as unknown as { image: typeof ImageModule }).image;
      const file = new File([await (await fetch('/e2e-fixtures/photo.jpg')).blob()], 'photo.jpg', { type: 'image/jpeg' });
      const image = await prepareImage(file, { maxWidth: 40 });
      const bitmap = await createImageBitmap(image.file);
      return { type: image.type, width: image.width, height: image.height, decoded: [bitmap.width, bitmap.height], removed: image.removed, left: (await readImageInfo(image.file)).metadata, name: (image.file as File).name };
    });
    expect(result).toMatchObject({ type: 'image/jpeg', width: 40, height: 60, decoded: [40, 60], name: 'photo.jpg' });
    expect(result.removed).toEqual(expect.arrayContaining(['exif', 'gps', 'xmp', 'comment']));
    expect(result.left.filter((kind) => kind !== 'icc')).toEqual([]);
  });

  test('fits a byte budget with a format this browser can encode', async ({ page }) => {
    await open(page);
    const result = await page.evaluate(async () => {
      const { prepareImage } = (window as unknown as { image: typeof ImageModule }).image;
      // Noise does not compress: a 400 x 300 PNG of it is about 360 KB.
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 300;
      const context = canvas.getContext('2d') as CanvasRenderingContext2D;
      const pixels = context.createImageData(400, 300);
      for (let index = 0; index < pixels.data.length; index += 1) pixels.data[index] = index % 4 === 3 ? 255 : Math.floor(Math.random() * 256);
      context.putImageData(pixels, 0, 0);
      const png = await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => {
          resolve(blob as Blob);
        }, 'image/png');
      });
      const image = await prepareImage(new File([png], 'noise.png', { type: 'image/png' }), { maxBytes: 60_000 });
      const bitmap = await createImageBitmap(image.file);
      return { inputSize: png.size, size: image.size, type: image.type, fileType: image.file.type, decoded: [bitmap.width, bitmap.height], reported: [image.width, image.height] };
    });
    expect(result.inputSize).toBeGreaterThan(60_000);
    expect(result.size).toBeLessThanOrEqual(60_000);
    expect(['image/webp', 'image/jpeg']).toContain(result.type);
    expect(result.fileType).toBe(result.type);
    expect(result.decoded).toEqual(result.reported);
  });

  test('keeps an animation, or flattens it on request', async ({ page }) => {
    await open(page);
    const result = await page.evaluate(async () => {
      const { prepareImage } = (window as unknown as { image: typeof ImageModule }).image;
      const gif = await (await fetch('/e2e-fixtures/anim.gif')).blob();
      const kept = await prepareImage(gif);
      const flat = await prepareImage(gif, { maxWidth: 60, animated: 'first-frame' });
      let refused = '';
      try {
        await prepareImage(gif, { maxWidth: 60 });
      } catch (error) {
        refused = (error as { copyError: { type: string } }).copyError.type;
      }
      return { kept: [kept.type, kept.reencoded], flat: [flat.type, flat.width, flat.height], refused };
    });
    expect(result).toEqual({ kept: ['image/gif', false], flat: ['image/png', 60, 40], refused: 'too-large' });
  });

  test('the Images playground strips the sample photo losslessly', async ({ page }) => {
    await page.goto('modules/images/');
    await page.click('[data-img-sample]');
    await expect(page.locator('[data-img-status]')).toHaveText('Metadata removed without re-encoding: every pixel is unchanged.');
    await expect(page.locator('[data-img-removed]')).toContainText('GPS location');
    await page.selectOption('[data-img-width]', '480');
    await expect(page.locator('[data-img-status]')).toContainText('Re-encoded as JPEG');
    await expect(page.locator('[data-img-preview]')).toHaveJSProperty('naturalWidth', 480);
  });
});
