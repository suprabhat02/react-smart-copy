import { act, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { PasteAdapter } from '../src/core/paste-adapter';
import type { PasteResult } from '../src/core/paste-reader';
import { usePaste, type UsePasteOptions } from '../src/react/usePaste';
import { fakeDataTransfer, pngFile } from './fixtures';
import { deferred, permissionDenied } from './helpers';

const textResult: PasteResult = {
  source: 'clipboard',
  items: [{ type: 'text/plain', data: 'pasted!' }],
  text: 'pasted!',
  html: null,
  images: [],
  files: [],
};

const adapterOf = (result: PasteResult): PasteAdapter => ({ read: () => Promise.resolve(result) });

function PasteZone(props: UsePasteOptions) {
  const { paste, reset, status, result, error, targetProps } = usePaste<HTMLDivElement>(props);
  return (
    <div>
      <div data-testid="zone" {...targetProps} />
      <button type="button" onClick={() => void paste()}>
        Paste
      </button>
      <button type="button" onClick={reset}>
        Reset
      </button>
      <output data-testid="status">{status}</output>
      <output data-testid="text">{result?.text ?? ''}</output>
      <output data-testid="images">{String(result?.images.length ?? 0)}</output>
      <output data-testid="error">{error?.type ?? ''}</output>
    </div>
  );
}

const text = (id: string): string | null => screen.getByTestId(id).textContent;

describe('usePaste — button', () => {
  it('idle → reading → read, then reset', async () => {
    const pending = deferred<PasteResult>();
    render(<PasteZone adapter={{ read: () => pending.promise }} />);
    expect(text('status')).toBe('idle');

    fireEvent.click(screen.getByText('Paste'));
    expect(text('status')).toBe('reading');
    await act(async () => {
      pending.resolve(textResult);
      await pending.promise;
    });
    expect(text('status')).toBe('read');
    expect(text('text')).toBe('pasted!');

    fireEvent.click(screen.getByText('Reset'));
    expect(text('status')).toBe('idle');
  });

  it('shows classified errors and fires the latest callbacks', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const failing: PasteAdapter = {
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- platform-shaped error
      read: () => Promise.reject(permissionDenied),
    };
    const { rerender } = render(<PasteZone adapter={failing} onError={first} />);
    rerender(<PasteZone adapter={failing} onError={second} />);
    await act(async () => {
      fireEvent.click(screen.getByText('Paste'));
      await Promise.resolve();
    });
    expect(text('status')).toBe('error');
    expect(text('error')).toBe('permission-denied');
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it('works under StrictMode', async () => {
    render(
      <StrictMode>
        <PasteZone adapter={adapterOf(textResult)} />
      </StrictMode>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('Paste'));
      await Promise.resolve();
    });
    expect(text('status')).toBe('read');
  });
});

describe('usePaste — keyboard paste on an element', () => {
  it('handles Ctrl/⌘+V on the target with no permission prompt', async () => {
    const onPaste = vi.fn();
    render(<PasteZone accept={['image']} onPaste={onPaste} />);
    await act(async () => {
      fireEvent.paste(screen.getByTestId('zone'), { clipboardData: fakeDataTransfer({}, [pngFile()]) });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(text('status')).toBe('read');
    expect(text('images')).toBe('1');
    expect(onPaste).toHaveBeenCalledOnce();
  });

  it('does not intercept pastes without accepted content', () => {
    render(<PasteZone accept={['image']} />);
    const event = fireEvent.paste(screen.getByTestId('zone'), { clipboardData: fakeDataTransfer({ 'text/plain': 'x' }) });
    expect(event).toBe(true); // not default-prevented: the browser inserts the text as usual
    expect(text('status')).toBe('idle');
  });
});

describe('usePaste — listenOnDocument', () => {
  const pasteOnDocument = async (target: EventTarget, clipboardData: unknown) => {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: clipboardData });
    await act(async () => {
      target.dispatchEvent(event);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    return event;
  };

  it('catches pastes anywhere on the page and stops when turned off', async () => {
    const { rerender } = render(<PasteZone listenOnDocument />);
    const event = await pasteOnDocument(document.body, fakeDataTransfer({ 'text/plain': 'anywhere' }));
    expect(event.defaultPrevented).toBe(true);
    expect(text('text')).toBe('anywhere');

    rerender(<PasteZone listenOnDocument={false} />);
    await pasteOnDocument(document.body, fakeDataTransfer({ 'text/plain': 'ignored' }));
    expect(text('text')).toBe('anywhere');
  });

  it('skips events an element already handled', async () => {
    const onPaste = vi.fn();
    render(<PasteZone listenOnDocument onPaste={onPaste} />);
    await act(async () => {
      fireEvent.paste(screen.getByTestId('zone'), { clipboardData: fakeDataTransfer({ 'text/plain': 'once' }) });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(onPaste).toHaveBeenCalledOnce();
  });

  it('removes the document listener on unmount', async () => {
    const onPaste = vi.fn();
    const { unmount } = render(<PasteZone listenOnDocument onPaste={onPaste} />);
    unmount();
    await pasteOnDocument(document.body, fakeDataTransfer({ 'text/plain': 'late' }));
    expect(onPaste).not.toHaveBeenCalled();
  });
});
