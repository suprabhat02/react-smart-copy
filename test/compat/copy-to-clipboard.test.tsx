/**
 * react-smart-copy/compat's CopyToClipboard, held to react-copy-to-clipboard's behaviour (5.1.1,
 * read from its source): one child, cloned with the other props and a click that copies, the
 * child's own onClick kept, `onCopy(text, result)`. Where it differs, on purpose, the test says so.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode, useState } from 'react';
import { createPortal } from 'react-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DefaultExport, { CopyToClipboard, compatPayload, type CopyFinishedOutcome } from '../../src/compat';

class FakeClipboardItem {
  static supports(type: string): boolean {
    return type === 'text/plain' || type === 'text/html';
  }
  constructor(readonly items: Record<string, Blob | string | Promise<Blob | string>>) {}
}

function installClipboard(target: Window & typeof globalThis = window) {
  const writeText = vi.fn((_text: string) => Promise.resolve());
  const write = vi.fn((_items: FakeClipboardItem[]) => Promise.resolve());
  Object.defineProperty(target, 'isSecureContext', {
    value: true,
    configurable: true,
  });
  Object.defineProperty(target.navigator, 'clipboard', {
    value: { writeText, write },
    configurable: true,
  });
  Object.defineProperty(target, 'ClipboardItem', {
    value: FakeClipboardItem,
    configurable: true,
    writable: true,
  });
  return { writeText, write };
}

async function settle(): Promise<void> {
  await act(async () => {
    for (let index = 0; index < 10; index += 1) await Promise.resolve();
  });
}

async function textOf(item: FakeClipboardItem, type: string): Promise<string> {
  const value = await item.items[type];
  return typeof value === 'string' ? value : ((await value?.text()) ?? '');
}

let clipboard: ReturnType<typeof installClipboard>;
beforeEach(() => {
  clipboard = installClipboard();
});
afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard');
  Reflect.deleteProperty(window, 'isSecureContext');
  Reflect.deleteProperty(window, 'ClipboardItem');
  Reflect.deleteProperty(document, 'execCommand');
  vi.restoreAllMocks();
});

describe('as react-copy-to-clipboard', () => {
  it('renders only its child, with every other prop, and copies on click', async () => {
    const onCopy = vi.fn();
    const extra = {
      className: 'copy',
      'aria-label': 'Copy the invoice number',
      'data-testid': 'copy',
    };
    render(
      <CopyToClipboard text="INV-29018" onCopy={onCopy} {...(extra as object)}>
        <button type="button">Copy</button>
      </CopyToClipboard>,
    );
    const button = screen.getByRole('button', {
      name: 'Copy the invoice number',
    });
    expect(button.className).toBe('copy');
    expect(button.parentElement).toBe(document.body.firstElementChild);
    fireEvent.click(button);
    await settle();
    expect(clipboard.writeText).toHaveBeenCalledWith('INV-29018');
    expect(onCopy).toHaveBeenCalledOnce();
    expect(onCopy).toHaveBeenCalledWith('INV-29018', true, expect.objectContaining({ status: 'copied' }));
  });

  it("keeps the child's onClick, in the same click, so preventDefault still works", () => {
    const order: string[] = [];
    clipboard.writeText.mockImplementation(() => {
      order.push('write');
      return Promise.resolve();
    });
    const own = vi.fn((event: React.MouseEvent) => {
      order.push('child');
      event.preventDefault();
    });
    render(
      <CopyToClipboard text="x" onCopy={() => order.push('onCopy')}>
        <a href="#top" onClick={own}>
          Copy
        </a>
      </CopyToClipboard>,
    );
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    screen.getByText('Copy').dispatchEvent(event);
    // The write has started and the child has run, both inside the click; onCopy comes after.
    expect(order).toEqual(['write', 'child']);
    expect(own).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it('is exported by name and as the default, and is a memoised component, as the original was pure', () => {
    expect(DefaultExport).toBe(CopyToClipboard);
    expect((CopyToClipboard as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
  });

  it('takes exactly one element, with React’s own error otherwise', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() =>
      render(
        <CopyToClipboard text="x">
          <button type="button">A</button>
          <button type="button">B</button>
        </CopyToClipboard>,
      ),
    ).toThrow(/single React element child/);
    expect(() => render(<CopyToClipboard text="x">text</CopyToClipboard>)).toThrow(/single React element child/);
  });

  it('works with no onCopy, and with a child that has no onClick of its own', async () => {
    render(
      <CopyToClipboard text="x">
        <button type="button">Copy</button>
      </CopyToClipboard>,
    );
    fireEvent.click(screen.getByRole('button'));
    await settle();
    expect(clipboard.writeText).toHaveBeenCalledWith('x');
  });
});

describe('failures', () => {
  it('report false and why, never a prompt or a console message, whatever debug and message say', async () => {
    clipboard.writeText.mockRejectedValue(new DOMException('Write permission denied.', 'NotAllowedError'));
    const prompt = vi.spyOn(window, 'prompt').mockImplementation(() => null);
    const log = vi.spyOn(console, 'error');
    const warn = vi.spyOn(console, 'warn');
    const onCopy = vi.fn<(text: string, result: boolean, outcome: CopyFinishedOutcome) => void>();
    render(
      <CopyToClipboard text="x" onCopy={onCopy} options={{ debug: true, message: 'Press #{key} to copy' }}>
        <button type="button">Copy</button>
      </CopyToClipboard>,
    );
    fireEvent.click(screen.getByRole('button'));
    await settle();
    expect(onCopy).toHaveBeenCalledOnce();
    const [text, result, outcome] = onCopy.mock.calls[0] as Parameters<typeof onCopy>;
    expect([text, result]).toEqual(['x', false]);
    expect(outcome.status === 'error' && outcome.error.type).toBe('permission-denied');
    expect(prompt).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('copies through the copy command on plain HTTP, where navigator.clipboard is missing', async () => {
    Reflect.deleteProperty(navigator, 'clipboard');
    Object.defineProperty(window, 'isSecureContext', {
      value: false,
      configurable: true,
    });
    const written = new Map<string, string>();
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => {
        const event = new Event('copy', { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'clipboardData', {
          value: {
            setData: (type: string, value: string) => written.set(type, value),
          },
        });
        (document.activeElement ?? document.body).dispatchEvent(event);
        return true;
      }),
    });
    const onCopy = vi.fn();
    render(
      <CopyToClipboard text="http only" onCopy={onCopy}>
        <button type="button">Copy</button>
      </CopyToClipboard>,
    );
    fireEvent.click(screen.getByRole('button'));
    await settle();
    expect(written.get('text/plain')).toBe('http only');
    expect(onCopy).toHaveBeenCalledWith('http only', true, expect.objectContaining({ status: 'copied' }));
  });

  it('an empty or unusable text copies nothing and reports false', async () => {
    const onCopy = vi.fn<(text: string, result: boolean, outcome: CopyFinishedOutcome) => void>();
    const { rerender } = render(
      <CopyToClipboard text="" onCopy={onCopy}>
        <button type="button">Copy</button>
      </CopyToClipboard>,
    );
    fireEvent.click(screen.getByRole('button'));
    await settle();
    // JavaScript callers can pass anything; an object would have copied "[object Object]".
    rerender(
      <CopyToClipboard text={{} as unknown as string} onCopy={onCopy}>
        <button type="button">Copy</button>
      </CopyToClipboard>,
    );
    fireEvent.click(screen.getByRole('button'));
    await settle();
    expect(clipboard.writeText).not.toHaveBeenCalled();
    expect(onCopy.mock.calls.map(([, result, outcome]) => [result, outcome.status])).toEqual([
      [false, 'error'],
      [false, 'error'],
    ]);
  });
});

describe('formats', () => {
  it('text/html writes the HTML and its plain text, where the original wrote the HTML alone', async () => {
    render(
      <CopyToClipboard text="<p>Total: <b>₹ 1,234</b></p><ul><li>Pen</li><li>Ink</li></ul>" options={{ format: 'text/html' }}>
        <button type="button">Copy</button>
      </CopyToClipboard>,
    );
    fireEvent.click(screen.getByRole('button'));
    await settle();
    const item = clipboard.write.mock.calls[0]?.[0][0] as FakeClipboardItem;
    expect(await textOf(item, 'text/html')).toBe('<p>Total: <b>₹ 1,234</b></p><ul><li>Pen</li><li>Ink</li></ul>');
    expect(await textOf(item, 'text/plain')).toBe('Total: ₹ 1,234\n• Pen\n• Ink');
  });

  it('builds payloads as the original would have copied them', () => {
    expect(compatPayload('<b>a</b>', undefined)).toEqual({ kind: 'text', value: '<b>a</b>' });
    expect(compatPayload('<b>a</b>', { format: 'text/plain' })).toEqual({ kind: 'text', value: '<b>a</b>' });
    // A format the Clipboard API cannot write: the text still arrives, as plain text.
    expect(compatPayload('{"a":1}', { format: 'application/json' })).toEqual({ kind: 'text', value: '{"a":1}' });
    expect(compatPayload('<b>a</b>', { format: 'TEXT/HTML' })).toEqual({ kind: 'html', html: '<b>a</b>', text: 'a' });
    // HTML with no text of its own keeps its source as the plain text, rather than nothing.
    expect(compatPayload('<img src="x.png">', { format: 'text/html' })).toEqual({ kind: 'html', html: '<img src="x.png">', text: '<img src="x.png">' });
    expect(compatPayload('', { format: 'text/html' })).toEqual({ kind: 'text', value: '' });
    // Found by the property test: a script's source or a style sheet is not the plain text.
    expect(compatPayload('Hi<script>alert(1)</script><style>.a{color:red}</style><p hidden>x</p><template>t</template>', { format: 'text/html' })).toMatchObject({ text: 'Hi' });
    for (const [input, value] of [
      [42, '42'],
      [12n, '12'],
      [true, 'true'],
      [null, ''],
      [undefined, ''],
      [{}, ''],
    ] as const) {
      expect(compatPayload(input, undefined)).toEqual({ kind: 'text', value });
    }
  });
});

describe('edge cases', () => {
  it('copies the latest text, even though the click handler is stable', async () => {
    function Changing() {
      const [count, setCount] = useState(1);
      return (
        <>
          <CopyToClipboard text={`v${String(count)}`}>
            <button type="button">Copy</button>
          </CopyToClipboard>
          <button
            type="button"
            onClick={() => {
              setCount(2);
            }}
          >
            Next
          </button>
        </>
      );
    }
    render(<Changing />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await settle();
    expect(clipboard.writeText).toHaveBeenCalledWith('v2');
  });

  it('a second click while the first is still being written is ignored: one write, one onCopy', async () => {
    let finish = (): void => undefined;
    clipboard.writeText.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)));
    const onCopy = vi.fn();
    render(
      <CopyToClipboard text="x" onCopy={onCopy}>
        <button type="button">Copy</button>
      </CopyToClipboard>,
    );
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByRole('button'));
    finish();
    await settle();
    expect(clipboard.writeText).toHaveBeenCalledOnce();
    expect(onCopy).toHaveBeenCalledOnce();
  });

  it('still reports to onCopy when it unmounts mid-copy: a menu that closes on click', async () => {
    let finish = (): void => undefined;
    clipboard.writeText.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)));
    const toast = vi.fn<(message: string) => void>();
    function Menu() {
      const [open, setOpen] = useState(true);
      return open ? (
        <CopyToClipboard
          text="https://example.com/doc/42"
          onCopy={(_text, ok) => {
            toast(ok ? 'Link copied' : 'Could not copy');
          }}
        >
          <button
            type="button"
            onClick={() => {
              setOpen(false);
            }}
          >
            Copy link
          </button>
        </CopyToClipboard>
      ) : null;
    }
    render(<Menu />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(screen.queryByRole('button')).toBeNull();
    finish();
    await settle();
    expect(clipboard.writeText).toHaveBeenCalledWith('https://example.com/doc/42');
    expect(toast).toHaveBeenCalledWith('Link copied');
  });

  it('works under StrictMode, where effects run twice', async () => {
    const onCopy = vi.fn();
    render(
      <StrictMode>
        <CopyToClipboard text="strict" onCopy={onCopy}>
          <button type="button">Copy</button>
        </CopyToClipboard>
      </StrictMode>,
    );
    fireEvent.click(screen.getByRole('button'));
    await settle();
    expect(onCopy).toHaveBeenCalledWith('strict', true, expect.objectContaining({ status: 'copied' }));
  });

  it("uses the clipboard of the window it is clicked in (a pop-out window), not the opener's", async () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const popout = installClipboard(frame.contentWindow as Window & typeof globalThis);
    render(
      createPortal(
        <CopyToClipboard text="from the pop-out">
          <button type="button">Copy</button>
        </CopyToClipboard>,
        (frame.contentDocument as Document).body,
      ),
    );
    fireEvent.click((frame.contentDocument as Document).querySelector('button') as HTMLButtonElement);
    await settle();
    expect(popout.writeText).toHaveBeenCalledWith('from the pop-out');
    expect(clipboard.writeText).not.toHaveBeenCalled();
    frame.remove();
  });
});
