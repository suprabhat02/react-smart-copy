import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrowserClipboardAdapter, type ClipboardItemData } from '../../src/core/clipboard-adapter';
import { createBrowserPasteAdapter } from '../../src/core/paste-adapter';
import type { PasteAccept, PasteResult } from '../../src/core/paste-reader';
import { useCopy } from '../../src/react/useCopy';
import { useCopyInterceptor } from '../../src/react/useCopyInterceptor';
import { usePaste } from '../../src/react/usePaste';
import { clipAccept, clipPayload, readClip, readClipSync, type ClipReadResult } from '../../src/structured';
import { fakeClipboardItem, fakeDataTransfer } from '../fixtures';
import { INVOICES, Invoices, type Invoice } from './fixtures';

/** Chromium-like: supports web custom formats, not arbitrary types. */
class ChromiumClipboardItem {
  static supports(type: string): boolean {
    return type === 'text/plain' || type === 'text/html' || type === 'image/png' || type.startsWith('web ');
  }
  constructor(readonly items: Record<string, ClipboardItemData>) {}
}

/** Safari/Firefox-like: no web custom formats. */
class LimitedClipboardItem {
  static supports(type: string): boolean {
    return type === 'text/plain' || type === 'text/html';
  }
  constructor(readonly items: Record<string, ClipboardItemData>) {}
}

type ItemClass = typeof ChromiumClipboardItem | typeof LimitedClipboardItem;

/** A system clipboard shared by the copy adapter and the paste adapter. */
function systemClipboard(Item: ItemClass) {
  let current: Record<string, ClipboardItemData> = {};
  const clipboard = {
    write: vi.fn(async (items: readonly unknown[]) => {
      current = (items[0] as InstanceType<ItemClass>).items;
      await Promise.resolve();
    }),
    read: async () => {
      const entries: Record<string, Blob> = {};
      for (const [type, data] of Object.entries(current)) entries[type] = await data;
      return [fakeClipboardItem(entries)];
    },
  };
  return {
    copyAdapter: createBrowserClipboardAdapter({ getEnvironment: () => ({ navigator: { clipboard }, ClipboardItem: Item }) }),
    pasteAdapter: createBrowserPasteAdapter({ getEnvironment: () => ({ navigator: { clipboard } }) }),
    types: () => Object.keys(current),
  };
}

function CopyInvoices({ adapter }: { readonly adapter: ReturnType<typeof systemClipboard>['copyAdapter'] }) {
  const { copy, status } = useCopy({ adapter });
  return (
    <button type="button" data-status={status} onClick={() => void copy(() => clipPayload(Invoices, INVOICES))}>
      Copy invoices
    </button>
  );
}

function PasteInvoices(props: {
  readonly adapter?: ReturnType<typeof systemClipboard>['pasteAdapter'];
  readonly accept?: readonly PasteAccept[];
  readonly onClip: (clip: ClipReadResult<Invoice[]>) => void;
}) {
  const { paste, targetProps } = usePaste<HTMLDivElement>({
    ...(props.adapter ? { adapter: props.adapter } : {}),
    accept: props.accept ?? clipAccept(Invoices),
    onPaste: (result: PasteResult) => {
      props.onClip(readClipSync(result, Invoices));
    },
  });
  return (
    <div>
      <div data-testid="target" {...targetProps} />
      <button type="button" onClick={() => void paste()}>
        Paste invoices
      </button>
    </div>
  );
}

const flush = () => act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

describe('structured clipboard with the React hooks', () => {
  it.each([
    ['Chromium', ChromiumClipboardItem, 'web', ['web application/vnd.acme.invoices+json', 'text/html', 'text/plain']],
    ['Safari / Firefox', LimitedClipboardItem, 'html', ['text/html', 'text/plain']],
  ] as const)('useCopy → system clipboard → usePaste button (%s)', async (_browser, Item, carrier, written) => {
    const system = systemClipboard(Item);
    const onClip = vi.fn<(clip: ClipReadResult<Invoice[]>) => void>();
    render(
      <>
        <CopyInvoices adapter={system.copyAdapter} />
        <PasteInvoices adapter={system.pasteAdapter} onClip={onClip} />
      </>,
    );
    fireEvent.click(screen.getByText('Copy invoices'));
    await flush();
    expect(screen.getByText('Copy invoices').dataset['status']).toBe('copied');
    expect(system.types()).toEqual(written);

    fireEvent.click(screen.getByText('Paste invoices'));
    await flush();
    expect(onClip).toHaveBeenCalledWith({ status: 'ok', value: INVOICES, version: 1, carrier });
  });

  it('keyboard paste after a copy event: the custom type is read from the event', async () => {
    const onClip = vi.fn<(clip: ClipReadResult<Invoice[]>) => void>();
    render(<PasteInvoices onClip={onClip} />);
    const payload = clipPayload(Invoices, INVOICES);
    const clipboardData = fakeDataTransfer(
      Object.fromEntries(payload.items.filter((item) => !item.mimeType.startsWith('web ')).map((item) => [item.mimeType, item.data])),
    );
    await act(async () => {
      fireEvent.paste(screen.getByTestId('target'), { clipboardData });
      await Promise.resolve();
    });
    await flush();
    expect(onClip).toHaveBeenCalledWith(expect.objectContaining({ status: 'ok', carrier: 'custom' }));
  });

  it('keyboard paste of HTML only (what Chromium exposes after an async write) still finds the clip', async () => {
    const onClip = vi.fn<(clip: ClipReadResult<Invoice[]>) => void>();
    render(<PasteInvoices onClip={onClip} />);
    const html = clipPayload(Invoices, INVOICES).items.find((item) => item.mimeType === 'text/html')?.data ?? '';
    await act(async () => {
      fireEvent.paste(screen.getByTestId('target'), { clipboardData: fakeDataTransfer({ 'text/html': `<html><body>${html}</body></html>`, 'text/plain': 'x' }) });
      await Promise.resolve();
    });
    await flush();
    expect(onClip).toHaveBeenCalledWith(expect.objectContaining({ status: 'ok', value: INVOICES, carrier: 'html' }));
  });

  it('without clipAccept, the default text-only paste never sees the clip', async () => {
    const onClip = vi.fn<(clip: ClipReadResult<Invoice[]>) => void>();
    render(<PasteInvoices accept={['text']} onClip={onClip} />);
    const payload = clipPayload(Invoices, INVOICES);
    await act(async () => {
      fireEvent.paste(screen.getByTestId('target'), {
        clipboardData: fakeDataTransfer(Object.fromEntries(payload.items.map((item) => [item.mimeType, item.data]))),
      });
      await Promise.resolve();
    });
    await flush();
    expect(onClip).toHaveBeenCalledWith({ status: 'absent' });
  });
});

describe('structured clipboard with native copy interception', () => {
  afterEach(() => {
    document.getSelection()?.removeAllRanges();
  });

  function Rows() {
    const { ref } = useCopyInterceptor<HTMLUListElement>({ transform: () => clipPayload(Invoices, INVOICES) });
    return (
      <ul ref={ref}>
        <li>INV-1</li>
      </ul>
    );
  }

  it('Ctrl/⌘+C writes the custom type, HTML and text; a paste reads it back', async () => {
    const { container } = render(<Rows />);
    const list = container.querySelector('ul') as HTMLUListElement;
    const range = document.createRange();
    range.selectNodeContents(list);
    document.getSelection()?.addRange(range);

    const data = new Map<string, string>();
    const event = new Event('copy', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { setData: (format: string, value: string) => data.set(format, value) } });
    list.dispatchEvent(event);

    expect([...data.keys()]).toEqual(['application/vnd.acme.invoices+json', 'text/html', 'text/plain']);
    const transfer = fakeDataTransfer(Object.fromEntries(data));
    expect(await readClip(transfer, Invoices)).toMatchObject({ status: 'ok', value: INVOICES, carrier: 'custom' });
  });
});
