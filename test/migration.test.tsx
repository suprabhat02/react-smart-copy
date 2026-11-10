/**
 * The "after" snippets of docs/src/content/docs/start/migrating.md, run against the real default
 * adapter: if one of them stops working, this fails before the docs can lie.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CopyField, useCopy } from '../src';
import { CopyToClipboard } from '../src/compat';
import { createCopyMachine } from '../src/core';

function onHttp(): Map<string, string> {
  Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
  const written = new Map<string, string>();
  Object.defineProperty(document, 'execCommand', {
    configurable: true,
    value: (name: string) => {
      const event = new Event(name, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clipboardData', {
        value: {
          clearData: () => {
            written.clear();
          },
          setData: (format: string, value: string) => written.set(format, value),
        },
      });
      document.body.dispatchEvent(event);
      return true;
    },
  });
  return written;
}

function onHttps() {
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  const writeText = vi.fn((_text: string) => Promise.resolve());
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  return writeText;
}

afterEach(() => {
  Reflect.deleteProperty(window, 'isSecureContext');
  Reflect.deleteProperty(document, 'execCommand');
  Reflect.deleteProperty(navigator, 'clipboard');
});

describe('the migration guide', () => {
  it('From react-copy-to-clipboard: the same JSX, with only the import changed, on HTTPS and on plain HTTP', async () => {
    // The original's README example, unchanged but for the import.
    function App({ value }: { value: string }) {
      const [copied, setCopied] = useState(false);
      return (
        <div>
          <CopyToClipboard text={value} onCopy={() => {
            setCopied(true);
          }}>
            <span>Copy to clipboard with span</span>
          </CopyToClipboard>
          <CopyToClipboard text={value} onCopy={() => {
            setCopied(true);
          }}>
            <button>Copy to clipboard with button</button>
          </CopyToClipboard>
          {copied ? <span style={{ color: 'red' }}>Copied.</span> : null}
        </div>
      );
    }
    const writeText = onHttps();
    const { unmount } = render(<App value="Hello" />);
    await act(async () => {
      fireEvent.click(screen.getByText('Copy to clipboard with span'));
      for (let index = 0; index < 5; index += 1) await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith('Hello');
    expect(screen.getByText('Copied.')).toBeDefined();
    unmount();
    Reflect.deleteProperty(navigator, 'clipboard');

    const written = onHttp();
    render(<App value="On plain HTTP" />);
    await act(async () => {
      fireEvent.click(screen.getByText('Copy to clipboard with button'));
      for (let index = 0; index < 5; index += 1) await Promise.resolve();
    });
    expect(written.get('text/plain')).toBe('On plain HTTP');
    expect(screen.getByText('Copied.')).toBeDefined();
  });

  it('From react-copy-to-clipboard, with CopyField', async () => {
    const writeText = onHttps();
    const invoiceId = 'INV-29018';
    render(
      <CopyField.Root value={invoiceId} label="Invoice number">
        <CopyField.Trigger>{({ displayStatus }) => (displayStatus === 'copied' ? 'Copied' : 'Copy')}</CopyField.Trigger>
      </CopyField.Root>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith('INV-29018');
    expect(screen.getByRole('button').textContent).toBe('Copied');
  });

  it('From react-copy-to-clipboard, with the hook, on a plain-HTTP page', async () => {
    const written = onHttp();
    function CopyInvoice({ invoiceId }: { invoiceId: string }) {
      const { copy, status } = useCopy();
      return (
        <button type="button" onClick={() => void copy(invoiceId)}>
          {status === 'copied' ? 'Copied' : 'Copy'}
        </button>
      );
    }
    render(<CopyInvoice invoiceId="INV-29018" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
      await Promise.resolve();
    });
    expect(written.get('text/plain')).toBe('INV-29018');
    expect(screen.getByRole('button').textContent).toBe('Copied');
  });

  it('From copy-to-clipboard, with the core: copied on HTTP, and a typed error where nothing can copy', async () => {
    const written = onHttp();
    const copier = createCopyMachine();
    expect(await copier.copy('INV-29018')).toMatchObject({ status: 'copied' });
    expect(written.get('text/plain')).toBe('INV-29018');

    Reflect.deleteProperty(document, 'execCommand');
    Object.defineProperty(document, 'execCommand', { configurable: true, value: () => false });
    const outcome = await createCopyMachine().copy('INV-29018');
    expect(outcome).toMatchObject({ status: 'error', error: { type: 'insecure-context' } });
  });

  it('From react-use and navigator.clipboard: status, error and the reset after two seconds', async () => {
    vi.useFakeTimers();
    try {
      onHttps();
      let result: ReturnType<typeof useCopy> | undefined;
      function Probe() {
        result = useCopy();
        return null;
      }
      render(<Probe />);
      await act(async () => {
        await result?.copy('x');
      });
      expect(result?.status).toBe('copied');
      expect(result?.error).toBeNull();
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(result?.status).toBe('idle');
    } finally {
      vi.useRealTimers();
    }
  });
});
