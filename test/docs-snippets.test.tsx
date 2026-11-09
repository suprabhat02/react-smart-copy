/**
 * Snippets and claims of the Accessibility and Security guides, run as they are written: if one
 * of them stops being true, this fails before the docs can say it.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeCopyError, LiveRegion, useCopy } from '../src';
import { readLink } from '../src/link';
import { pasteToMarkdown } from '../src/markdown';
import { pasteToRich } from '../src/rich';
import { render as renderMarkdown } from './markdown/oracle';

// docs/src/content/docs/guides/accessibility.md, "With your own button".
function CopyInvoice({ invoiceId }: { invoiceId: string }) {
  const { copy, status, error } = useCopy();
  const message = status === 'copied' ? 'Invoice number copied' : error ? describeCopyError(error) : '';
  return (
    <>
      <button type="button" onClick={() => void copy(invoiceId)}>
        Copy invoice number
      </button>
      <LiveRegion message={message} />
    </>
  );
}

function clipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
}

async function click(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Copy invoice number' }));
    for (let index = 0; index < 5; index += 1) await Promise.resolve();
  });
  // The live region writes one tick after it is first mounted.
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard');
  Reflect.deleteProperty(window, 'isSecureContext');
});

describe('accessibility guide: announcing with your own button', () => {
  it('announces the copy, keeps the button name, and announces a failure as a sentence', async () => {
    const writeText = vi.fn((_text: string) => Promise.resolve());
    clipboard(writeText);
    render(<CopyInvoice invoiceId="INV-29018" />);
    const region = screen.getByRole('status');
    expect(region.textContent).toBe('');
    await click();
    expect(writeText).toHaveBeenCalledWith('INV-29018');
    expect(region.textContent).toBe('Invoice number copied');
    expect(screen.getByRole('button').textContent).toBe('Copy invoice number');

    clipboard(() => Promise.reject(new DOMException('Denied', 'NotAllowedError')));
    await click();
    expect(region.textContent).toBe(describeCopyError({ type: 'permission-denied' } as Parameters<typeof describeCopyError>[0]));
    expect(region.textContent).not.toBe('');
  });
});

describe('security guide: what is safe to render', () => {
  const HOSTILE =
    '<p>&lt;img src=x onerror=alert(1)&gt; <img src=x onerror="alert(1)"><a href="javascript:alert(1)">x</a><script>alert(1)</script><span onclick="alert(1)">y</span></p>';

  it('pasteToRich output holds no script, handler or javascript: link, and says what it removed', () => {
    const result = pasteToRich({ html: HOSTILE });
    const host = document.createElement('div');
    host.innerHTML = result?.html ?? '';
    expect(host.querySelectorAll('script, img, [onclick], [onerror], a[href^="javascript"]')).toHaveLength(0);
    expect(result?.removed.map(({ reason }) => reason)).toEqual(expect.arrayContaining(['unsafe-element', 'unsafe-link', 'unsafe-image']));
  });

  it('markdown output escapes markup in the text, so a renderer with raw HTML off shows it as text', () => {
    const markdown = pasteToMarkdown({ html: HOSTILE, text: 'x' })?.markdown ?? '';
    expect(markdown).toContain('\\<img src=x onerror=alert(1)>');
    const rendered = renderMarkdown(markdown);
    expect(rendered.querySelector('img, script')).toBeNull();
    expect(rendered.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('readLink returns only http(s), mailto and tel links unless told otherwise', () => {
    expect(readLink({ text: 'javascript:alert(1)' })).toBeNull();
    expect(readLink({ text: 'data:text/html,<script>alert(1)</script>' })).toBeNull();
    for (const text of ['https://example.com/a', 'http://example.com/', 'mailto:ana@example.com', 'tel:+15550100']) expect(readLink({ text }), text).not.toBeNull();
  });
});
