import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClipboardAdapter } from '../src/core/clipboard-adapter';
import type { OperationContext } from '../src/core/machine-shared';
import type { PasteAdapter } from '../src/core/paste-adapter';
import type { PasteResult } from '../src/core/paste-reader';
import { CopyField } from '../src/react/CopyField';
import { CopyGroup } from '../src/react/CopyGroup';
import { PasteField, type PasteFieldTriggerRenderProps } from '../src/react/PasteField';
import { usePaste } from '../src/react/usePaste';
import { flush, permissionDenied } from './helpers';

const result = (overrides: Partial<PasteResult> = {}): PasteResult => ({
  source: 'clipboard',
  items: [],
  text: null,
  html: null,
  images: [],
  files: [],
  ...overrides,
});

const adapterOf = (value: PasteResult): PasteAdapter => ({ read: () => Promise.resolve(value) });

/** Fails with `reasons` in order, then resolves `value`. */
const scripted = (reasons: unknown[], value: PasteResult = result({ text: 'ok' })): PasteAdapter => ({
  // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- platform-shaped errors
  read: () => (reasons.length > 0 ? Promise.reject(reasons.shift()) : Promise.resolve(value)),
});

async function pasteVia(testId: string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByTestId(testId));
    await flush();
  });
}

function stubObjectUrls() {
  let next = 0;
  const create = vi.fn((_blob: Blob) => `blob:test/${String(++next)}`);
  const revoke = vi.fn((_url: string) => undefined);
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: create, revokeObjectURL: revoke }));
  return { create, revoke };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/* =================================================================== usePaste */

describe('usePaste — retry and cancellation', () => {
  it('exposes canRetry and a stable retry() that re-reads after a retryable failure', async () => {
    const adapter = scripted([permissionDenied]);
    const { result: hook, rerender } = renderHook(() => usePaste({ adapter }));
    const { retry } = hook.current;
    expect(hook.current.canRetry).toBe(false);

    await act(async () => {
      await hook.current.paste();
    });
    expect(hook.current.status).toBe('error');
    expect(hook.current.canRetry).toBe(true);

    await act(async () => {
      await hook.current.retry();
    });
    expect(hook.current.status).toBe('read');
    expect(hook.current.canRetry).toBe(false);
    rerender();
    expect(hook.current.retry).toBe(retry);
  });

  it('respects maxRetries from the latest options', async () => {
    const adapter = scripted([permissionDenied]);
    const { result: hook } = renderHook(() => usePaste({ adapter, maxRetries: 0 }));
    await act(async () => {
      await hook.current.paste();
    });
    expect(hook.current.canRetry).toBe(false);
  });

  it('aborts the in-flight read when the component unmounts', () => {
    const contexts: (OperationContext | undefined)[] = [];
    const adapter: PasteAdapter = {
      read: (_options, context) => {
        contexts.push(context);
        return new Promise(() => undefined);
      },
    };
    const { result: hook, unmount } = renderHook(() => usePaste({ adapter }));
    act(() => {
      void hook.current.paste();
    });
    expect(contexts[0]?.signal.aborted).toBe(false);
    unmount();
    expect(contexts[0]?.signal.aborted).toBe(true);
  });
});

/* ======================================================== PasteField.Trigger */

describe('PasteField.Trigger — canRetry render prop', () => {
  it('passes canRetry to render-function children', async () => {
    const seen: PasteFieldTriggerRenderProps[] = [];
    render(
      <PasteField.Root label="Notes" pasteOptions={{ adapter: scripted([permissionDenied]) }}>
        <PasteField.Trigger data-testid="trigger">
          {(props) => {
            seen.push(props);
            return props.canRetry ? 'Try again' : 'Paste';
          }}
        </PasteField.Trigger>
      </PasteField.Root>,
    );
    expect(seen.at(-1)?.canRetry).toBe(false);
    await pasteVia('trigger');
    expect(seen.at(-1)?.canRetry).toBe(true);
    expect(screen.getByTestId('trigger').textContent).toBe('Try again');
  });
});

/* ======================================================== PasteField.Preview */

function PreviewField({ adapter, ...preview }: { adapter: PasteAdapter } & Parameters<typeof PasteField.Preview>[0]) {
  return (
    <PasteField.Root label="Notes" pasteOptions={{ adapter }}>
      <PasteField.Trigger data-testid="trigger" />
      <PasteField.Preview data-testid="preview" {...preview} />
    </PasteField.Root>
  );
}

describe('PasteField.Preview', () => {
  it('shows the placeholder until something is pasted', () => {
    render(<PreviewField adapter={adapterOf(result())} placeholder="Nothing pasted yet" />);
    const preview = screen.getByTestId('preview');
    expect(preview.textContent).toBe('Nothing pasted yet');
    expect(preview.hasAttribute('data-empty')).toBe(true);
    expect(preview.getAttribute('data-state')).toBe('idle');
  });

  it('renders pasted text, truncated past maxTextLength', async () => {
    render(<PreviewField adapter={adapterOf(result({ text: 'abcdefghij' }))} maxTextLength={4} />);
    await pasteVia('trigger');
    const preview = screen.getByTestId('preview');
    expect(preview.querySelector('[data-preview-text]')?.textContent).toBe('abcd…');
    expect(preview.hasAttribute('data-empty')).toBe(false);
    expect(preview.getAttribute('data-state')).toBe('read');
  });

  it('never renders pasted HTML as markup', async () => {
    const html = '<img src=x onerror="alert(1)"><b>bold</b>';
    render(<PreviewField adapter={adapterOf(result({ html, text: 'bold' }))} />);
    await pasteVia('trigger');
    const preview = screen.getByTestId('preview');
    expect(preview.querySelector('b')).toBeNull();
    expect(preview.querySelector('img')).toBeNull();
    expect(preview.textContent).toBe('bold');
  });

  it('renders image thumbnails with alt text and revokes their URLs on change and unmount', async () => {
    const { create, revoke } = stubObjectUrls();
    const images = [new Blob(['a'], { type: 'image/png' }), new Blob(['b'], { type: 'image/png' })];
    const reads = [result({ images }), result({ text: 'later' })];
    const adapter: PasteAdapter = { read: () => Promise.resolve(reads.shift() ?? result()) };
    const { unmount } = render(<PreviewField adapter={adapter} />);

    await pasteVia('trigger');
    const imgs = screen.getByTestId('preview').querySelectorAll('img');
    expect(Array.from(imgs, (img) => [img.getAttribute('src'), img.getAttribute('alt')])).toEqual([
      ['blob:test/1', 'Pasted image 1 of 2'],
      ['blob:test/2', 'Pasted image 2 of 2'],
    ]);
    expect(create).toHaveBeenCalledTimes(2);

    await pasteVia('trigger');
    expect(revoke.mock.calls.map(([url]) => url)).toEqual(['blob:test/1', 'blob:test/2']);
    expect(screen.getByTestId('preview').querySelectorAll('img')).toHaveLength(0);

    unmount();
    expect(revoke).toHaveBeenCalledTimes(2);
  });

  it('revokes image URLs on unmount', async () => {
    const { revoke } = stubObjectUrls();
    const { unmount } = render(
      <PreviewField
        adapter={adapterOf(result({ images: [new Blob(['a'], { type: 'image/png' })] }))}
        imageAlt={(index) => `Screenshot ${String(index + 1)}`}
      />,
    );
    await pasteVia('trigger');
    expect(screen.getByTestId('preview').querySelector('img')?.getAttribute('alt')).toBe('Screenshot 1');
    unmount();
    expect(revoke).toHaveBeenCalledWith('blob:test/1');
  });

  it('skips thumbnails where object URLs are unavailable', async () => {
    vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: undefined }));
    render(<PreviewField adapter={adapterOf(result({ images: [new Blob(['a'], { type: 'image/png' })] }))} />);
    await pasteVia('trigger');
    expect(screen.getByTestId('preview').querySelector('img')).toBeNull();
  });

  it('lists non-image files by name; image files appear only as thumbnails', async () => {
    stubObjectUrls();
    const png = new File(['p'], 'shot.png', { type: 'image/png' });
    const pdf = new File(['%PDF'], 'invoice.pdf', { type: 'application/pdf' });
    render(<PreviewField adapter={adapterOf(result({ source: 'event', files: [png, pdf], images: [png] }))} />);
    await pasteVia('trigger');
    const preview = screen.getByTestId('preview');
    expect(Array.from(preview.querySelectorAll('[data-preview-files] li'), (li) => li.textContent)).toEqual(['invoice.pdf']);
    expect(preview.querySelectorAll('img')).toHaveLength(1);
  });

  it('render-function children get the result and image URLs', async () => {
    stubObjectUrls();
    const images = [new Blob(['a'], { type: 'image/png' })];
    render(
      <PreviewField adapter={adapterOf(result({ text: 'hi', images }))} placeholder="empty">
        {({ result: pasted, imageUrls }) => (
          <span data-testid="custom">{`${pasted.text ?? ''}:${imageUrls.join(',')}`}</span>
        )}
      </PreviewField>,
    );
    expect(screen.getByTestId('preview').textContent).toBe('empty');
    await pasteVia('trigger');
    expect(screen.getByTestId('custom').textContent).toBe('hi:blob:test/1');
  });

  it('render-function children never get URLs from a previous result', async () => {
    stubObjectUrls();
    const reads = [
      result({ images: [new Blob(['a'], { type: 'image/png' })] }),
      result({ images: [new Blob(['b'], { type: 'image/png' }), new Blob(['c'], { type: 'image/png' })] }),
    ];
    const adapter: PasteAdapter = { read: () => Promise.resolve(reads.shift() ?? result()) };
    const seen: [number, number][] = [];
    render(
      <PreviewField adapter={adapter}>
        {({ result: pasted, imageUrls }) => {
          seen.push([pasted.images.length, imageUrls.length]);
          return null;
        }}
      </PreviewField>,
    );
    await pasteVia('trigger');
    await pasteVia('trigger');
    // URLs are either not ready yet (0) or exactly the current result's.
    for (const [images, urls] of seen) expect([0, images]).toContain(urls);
    expect(seen.at(-1)).toEqual([2, 2]);
  });

  it('renders the placeholder on the server without touching object URLs', () => {
    const html = renderToString(
      <PasteField.Root label="Notes">
        <PasteField.Preview placeholder="Nothing yet" />
      </PasteField.Root>,
    );
    expect(html).toContain('data-preview=""');
    expect(html).toContain('Nothing yet');
  });
});

/* ================================================================ StrictMode */

describe('StrictMode', () => {
  it('CopyGroup keeps one "Copied" at a time under double-invoked effects', async () => {
    const instant: ClipboardAdapter = { write: () => Promise.resolve() };
    render(
      <StrictMode>
        <CopyGroup>
          <CopyField.Root value="a" label="A" copyOptions={{ adapter: instant }}>
            <CopyField.Trigger data-testid="a" />
          </CopyField.Root>
          <CopyField.Root value="b" label="B" copyOptions={{ adapter: instant }}>
            <CopyField.Trigger data-testid="b" />
          </CopyField.Root>
        </CopyGroup>
      </StrictMode>,
    );
    await pasteVia('a');
    expect(screen.getByTestId('a').getAttribute('data-state')).toBe('copied');
    await pasteVia('b');
    expect(screen.getByTestId('b').getAttribute('data-state')).toBe('copied');
    expect(screen.getByTestId('a').getAttribute('data-state')).toBe('idle');
    await pasteVia('a');
    expect(screen.getByTestId('a').getAttribute('data-state')).toBe('copied');
    expect(screen.getByTestId('b').getAttribute('data-state')).toBe('idle');
  });

  it('PasteField with Preview pastes and revokes cleanly under StrictMode', async () => {
    const { create, revoke } = stubObjectUrls();
    const { unmount } = render(
      <StrictMode>
        <PreviewField adapter={adapterOf(result({ images: [new Blob(['a'], { type: 'image/png' })] }))} />
      </StrictMode>,
    );
    await pasteVia('trigger');
    expect(screen.getByTestId('preview').querySelectorAll('img')).toHaveLength(1);
    unmount();
    // Every URL created (StrictMode creates some twice) was revoked: nothing leaks.
    const created = create.mock.results.map((entry) => entry.value as string);
    expect(created.length).toBeGreaterThan(0);
    expect(new Set(revoke.mock.calls.map(([url]) => url))).toEqual(new Set(created));
  });
});
