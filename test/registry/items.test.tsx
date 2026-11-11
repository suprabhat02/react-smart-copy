/**
 * The shadcn registry's components (registry/items), with shadcn's Button and Input stood in for.
 * Every base's real components, in a real shadcn project and three engines, are checked by the
 * Registry job in CI (registry/test); these tests hold the paths a browser test cannot reach.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CopyButton } from '@/components/copy-button';
import { CopyField } from '@/components/copy-field';
import { CopyPageButton } from '@/components/copy-page-button';
import { describeCopyError, type CopyError } from '../../src';

let writeText: ReturnType<typeof vi.fn<(text: string) => Promise<void>>>;

beforeEach(() => {
  writeText = vi.fn((_text: string) => Promise.resolve());
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});
afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard');
  Reflect.deleteProperty(window, 'isSecureContext');
  document.body.replaceChildren();
  vi.useRealTimers();
});

async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.click(element);
    for (let index = 0; index < 10; index += 1) await Promise.resolve();
  });
  // The live region writes one tick after it mounts.
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

const announced = (): string[] => screen.getAllByRole('status').map((region) => region.textContent);
const iconOf = (button: HTMLElement): string | null => button.querySelector('svg')?.getAttribute('data-icon') ?? null;
const tooltipOf = (button: HTMLElement): string | null => button.querySelector('span[title]')?.getAttribute('title') ?? null;

describe('CopyButton', () => {
  it('icon only: a stable name, a check mark and an announcement when copied, then back', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onCopied = vi.fn();
    render(<CopyButton value="INV-29018" label="Copy invoice number" onCopied={onCopied} />);
    const button = screen.getByRole('button', { name: 'Copy invoice number' });
    expect([button.dataset['variant'], button.dataset['size'], iconOf(button)]).toEqual(['ghost', 'icon', 'copy']);
    await click(button);
    expect(writeText).toHaveBeenCalledWith('INV-29018');
    expect(onCopied).toHaveBeenCalledWith({ kind: 'text', value: 'INV-29018' });
    expect([button.dataset['status'], iconOf(button), button.getAttribute('aria-label')]).toEqual(['copied', 'copied', 'Copy invoice number']);
    expect(announced()).toContain('Copied');
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect([button.dataset['status'], iconOf(button)]).toEqual(['idle', 'copy']);
  });

  it('with text: the text is its name (speech input), the label its tooltip', () => {
    render(
      <CopyButton value="x" label="Copy the total, with formatting" size="sm" className="ml-2" disabled>
        Copy total
      </CopyButton>,
    );
    const button = screen.getByRole('button', { name: 'Copy total' });
    expect(button.hasAttribute('aria-label')).toBe(false);
    expect(tooltipOf(button)).toBe('Copy the total, with formatting');
    expect([button.dataset['size'], button.className, (button as HTMLButtonElement).disabled]).toEqual(['sm', 'ml-2', true]);
  });

  it('a failure shows a warning, says why in the tooltip and to screen readers, and reaches onCopyError', async () => {
    writeText.mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
    const onCopyError = vi.fn<(error: CopyError) => void>();
    render(<CopyButton value="x" onCopyError={onCopyError} />);
    const button = screen.getByRole('button', { name: 'Copy' });
    await click(button);
    const error = onCopyError.mock.calls[0]?.[0] as CopyError;
    expect(error.type).toBe('permission-denied');
    expect([button.dataset['status'], iconOf(button), tooltipOf(button)]).toEqual(['error', 'error', describeCopyError(error)]);
    expect(announced()).toContain(describeCopyError(error));
  });

  it('copies HTML with its text, and a function value is read during the click', async () => {
    const value = vi.fn(() => 'computed at click');
    render(<CopyButton value={value} />);
    expect(value).not.toHaveBeenCalled();
    await click(screen.getByRole('button'));
    expect(value).toHaveBeenCalledOnce();
    expect(writeText).toHaveBeenCalledWith('computed at click');
  });

  it('marks itself busy while the copy is being written', async () => {
    let finish = (): void => undefined;
    writeText.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)));
    render(<CopyButton value="x" />);
    const button = screen.getByRole('button');
    await click(button);
    expect(button.getAttribute('aria-busy')).toBe('true');
    await act(async () => {
      finish();
      await Promise.resolve();
    });
    expect(button.hasAttribute('aria-busy')).toBe(false);
  });
});

describe('CopyField', () => {
  it('a labelled, described, read-only value that copies, selected on focus', async () => {
    render(<CopyField label="Invite link" value="https://example.com/invite/42" description="Anyone with the link can join." />);
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Invite link' });
    expect([input.readOnly, input.type, input.value]).toEqual([true, 'text', 'https://example.com/invite/42']);
    expect(document.getElementById(input.getAttribute('aria-describedby') ?? '')?.textContent).toBe('Anyone with the link can join.');
    const select = vi.spyOn(input, 'select');
    fireEvent.focus(input);
    expect(select).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: /Show/ })).toBeNull();
    await click(screen.getByRole('button', { name: 'Copy Invite link' }));
    expect(writeText).toHaveBeenCalledWith('https://example.com/invite/42');
  });

  it('a secret: hidden, away from password managers, revealed on request, and copied as it is', async () => {
    const onCopied = vi.fn();
    render(<CopyField label="API key" value="sk_test_EXAMPLE0123456789" secret hideLabel onCopied={onCopied} />);
    const input = screen.getByLabelText<HTMLInputElement>('API key', { selector: 'input' });
    expect([input.type, input.autocomplete, input.getAttribute('spellcheck')]).toEqual(['password', 'off', 'false']);
    expect(['data-1p-ignore', 'data-lpignore', 'data-bwignore'].every((name) => input.hasAttribute(name))).toBe(true);
    expect(input.hasAttribute('aria-describedby')).toBe(false);
    expect(screen.getByText('API key').className).toContain('sr-only');
    // Hidden, focusing it selects nothing that could be seen.
    const select = vi.spyOn(input, 'select');
    fireEvent.focus(input);
    expect(select).not.toHaveBeenCalled();
    const toggle = screen.getByRole('button', { name: 'Show API key' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect([input.type, toggle.getAttribute('aria-pressed')]).toEqual(['text', 'true']);
    fireEvent.click(toggle);
    expect(input.type).toBe('password');
    await click(screen.getByRole('button', { name: 'Copy API key' }));
    expect(writeText).toHaveBeenCalledWith('sk_test_EXAMPLE0123456789');
    expect(onCopied).toHaveBeenCalledOnce();
  });
});

describe('CopyPageButton', () => {
  function page(html: string): void {
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.append(host);
  }

  it("copies the article, with the page's heading first, escaped, and links made absolute", async () => {
    page('<h1>Release *notes*</h1><article><h2 id="setup">Setup</h2><p>Read <a href="/docs/start/">the start</a>.</p><button>Demo</button></article>');
    render(<CopyPageButton />);
    const button = screen.getByRole('button', { name: 'Copy page' });
    expect(tooltipOf(button)).toBe('Copy page as Markdown');
    expect([button.dataset['variant'], button.dataset['size']]).toEqual(['outline', 'sm']);
    await click(button);
    expect(writeText).toHaveBeenCalledWith(`# Release \\*notes\\*\n\n## Setup\n\nRead [the start](${new URL('/docs/start/', location.href).href}).\n`);
  });

  it('does not repeat a heading the article holds, takes main when there is no article, and leaves out what `ignore` selects', async () => {
    page('<main><h1>Guide</h1><p>Text.</p><div class="ad">Buy</div></main>');
    render(<CopyPageButton ignore=".ad" />);
    await click(screen.getByRole('button'));
    expect(writeText).toHaveBeenCalledWith('# Guide\n\nText.\n');
  });

  it('a title you give comes first; a selector you give is used alone', async () => {
    page('<main><p>Main text.</p></main><section id="doc"><p>Doc text.</p></section>');
    render(<CopyPageButton selector="#doc" title="My doc" />);
    await click(screen.getByRole('button'));
    expect(writeText).toHaveBeenCalledWith('# My doc\n\nDoc text.\n');
  });

  it('reports a page with nothing to copy, rather than copying something else or nothing', async () => {
    const onCopyError = vi.fn<(error: CopyError) => void>();
    page('<main><p>Main text.</p></main><article></article>');
    const { unmount } = render(<CopyPageButton selector="#missing" onCopyError={onCopyError} />);
    await click(screen.getByRole('button'));
    unmount();
    render(<CopyPageButton onCopyError={onCopyError} />);
    await click(screen.getByRole('button'));
    document.body.replaceChildren();
    render(<CopyPageButton onCopyError={onCopyError} />);
    await click(screen.getByRole('button'));
    expect(writeText).not.toHaveBeenCalled();
    expect(onCopyError.mock.calls.map(([error]) => error.type)).toEqual(['invalid-payload', 'invalid-payload', 'invalid-payload']);
  });
});
