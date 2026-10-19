import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, type Page } from '@playwright/test';

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

/** What the page asked the async Clipboard API to write. */
export interface ClipboardWrite {
  readonly method: 'writeText' | 'write';
  /** For `write`: each item's types with their text (or the byte size, for images). */
  readonly items: Record<string, string>[];
  readonly text?: string;
  /** Whether the browser accepted the write. */
  readonly ok: boolean;
  readonly error?: string;
}

/**
 * Records every clipboard write the page makes, and still performs it: the test
 * sees what the library wrote and whether this browser accepted it.
 */
export async function recordClipboard(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const writes: unknown[] = [];
    (window as unknown as { __writes: unknown[] }).__writes = writes;
    const clipboard = navigator.clipboard as Clipboard | undefined;
    if (clipboard === undefined) return;
    const writeText = clipboard.writeText.bind(clipboard);
    const write = clipboard.write.bind(clipboard);
    const settle = (entry: Record<string, unknown>, promise: Promise<void>) =>
      promise.then(
        () => {
          writes.push({ ...entry, ok: true });
        },
        (error: unknown) => {
          writes.push({ ...entry, ok: false, error: String(error) });
          throw error;
        },
      );
    clipboard.writeText = (text: string) => settle({ method: 'writeText', text, items: [] }, writeText(text));
    clipboard.write = async (data: ClipboardItems) => {
      const items = await Promise.all(
        data.map(async (item) => {
          const out: Record<string, string> = {};
          for (const type of item.types) {
            const blob = await item.getType(type);
            out[type] = type.startsWith('image/') ? `${String(blob.size)} bytes` : await blob.text();
          }
          return out;
        }),
      );
      return settle({ method: 'write', items }, write(data));
    };
  });
}

export async function clipboardWrites(page: Page): Promise<ClipboardWrite[]> {
  return page.evaluate(() => (window as unknown as { __writes: ClipboardWrite[] }).__writes);
}

/** Dispatches a paste event carrying `data` (MIME type to text) at `selector`. Returns whether it was handled. */
export async function paste(page: Page, selector: string, data: Record<string, string>): Promise<boolean> {
  return page.evaluate(
    ([target, entries]) => {
      const element = document.querySelector(target) as HTMLElement;
      element.focus();
      const transfer = new DataTransfer();
      for (const [type, value] of Object.entries(entries)) transfer.setData(type, value);
      const event = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clipboardData', { value: transfer });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    },
    [selector, data] as const,
  );
}

/** Runs axe on `selector` (WCAG 2.2 AA and best practices) and expects no violations. */
export async function expectAccessible(page: Page, selector: string): Promise<void> {
  // Evaluated over the automation protocol, not as an inline <script>: the site's CSP rightly blocks those.
  if (!(await page.evaluate(() => 'axe' in window))) await page.evaluate(AXE);
  const violations = await page.evaluate(async (target) => {
    const axe = (window as unknown as { axe: { run: (context: Element, options: object) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
    const result = await axe.run(document.querySelector(target) as Element, {
      runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'],
    });
    return result.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`);
  }, selector);
  expect(violations).toEqual([]);
}

/** Collects page errors and console errors. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}
