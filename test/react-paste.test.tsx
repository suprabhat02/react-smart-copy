import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePaste } from '../src/react/usePaste';
import type { PasteAdapter, PasteResult } from '../src/core/paste-machine';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const textResult: PasteResult = { kind: 'text', value: 'pasted!' };

function makeAdapter(result: PasteResult): PasteAdapter {
  return { read: () => Promise.resolve(result) };
}

function makeFailingAdapter(cause: unknown): PasteAdapter {
  // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
  return { read: () => Promise.reject(cause) };
}

// ---------------------------------------------------------------------------
// Test component
// ---------------------------------------------------------------------------

interface TestProps {
  adapter?: PasteAdapter;
  resetAfterMs?: number | false;
  onPaste?: (r: PasteResult) => void;
  onError?: (e: { type: string }) => void;
}

function PasteButton({ adapter, resetAfterMs, onPaste, onError }: TestProps) {
  const { paste, status, result, error } = usePaste({
    ...(adapter !== undefined && { adapter }),
    ...(resetAfterMs !== undefined && { resetAfterMs }),
    ...(onPaste !== undefined && { onPaste }),
    ...(onError !== undefined && { onError }),
  });

  return (
    <div>
      <button type="button" data-testid="btn" onClick={() => void paste()}>
        Paste
      </button>
      <span data-testid="status">{status}</span>
      <span data-testid="result">{result?.kind === 'text' ? result.value : ''}</span>
      <span data-testid="error">{error?.type ?? ''}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('usePaste — React integration', () => {
  it('starts idle', () => {
    render(<PasteButton adapter={makeAdapter(textResult)} />);
    expect(screen.getByTestId('status').textContent).toBe('idle');
    expect(screen.getByTestId('result').textContent).toBe('');
  });

  it('transitions idle → reading → read on click', async () => {
    render(<PasteButton adapter={makeAdapter(textResult)} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('btn'));
    });

    expect(screen.getByTestId('status').textContent).toBe('read');
    expect(screen.getByTestId('result').textContent).toBe('pasted!');
    expect(screen.getByTestId('error').textContent).toBe('');
  });

  it('shows error on failure', async () => {
    render(
      <PasteButton
        adapter={makeFailingAdapter({ name: 'NotAllowedError', message: 'Blocked.' })}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('btn'));
    });

    expect(screen.getByTestId('status').textContent).toBe('error');
    expect(screen.getByTestId('error').textContent).toBe('permission-denied');
  });

  it('calls onPaste callback with result', async () => {
    const onPaste = vi.fn();
    render(<PasteButton adapter={makeAdapter(textResult)} onPaste={onPaste} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('btn'));
    });

    expect(onPaste).toHaveBeenCalledWith(textResult);
  });

  it('calls onError callback on failure', async () => {
    const onError = vi.fn();
    render(
      <PasteButton
        adapter={makeFailingAdapter({ name: 'NotAllowedError', message: 'No.' })}
        onError={onError}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('btn'));
    });

    expect(onError).toHaveBeenCalledOnce();
    const errorCall = onError.mock.calls[0] as [{ type: string }] | undefined;
    expect(errorCall?.[0].type).toBe('permission-denied');
  });

  it('ignores a second click while reading', async () => {
    let reads = 0;
    let resolveFn!: () => void;
    const slowAdapter: PasteAdapter = {
      read: () => {
        reads++;
        return new Promise((res) => { resolveFn = () => { res(textResult); }; });
      },
    };

    render(<PasteButton adapter={slowAdapter} />);

    act(() => { fireEvent.click(screen.getByTestId('btn')); });
    expect(screen.getByTestId('status').textContent).toBe('reading');

    act(() => { fireEvent.click(screen.getByTestId('btn')); });
    expect(reads).toBe(1); // adapter called only once

    await act(async () => { resolveFn(); });
    expect(screen.getByTestId('status').textContent).toBe('read');
  });

  it('result is null when not in read state', async () => {
    render(
      <PasteButton
        adapter={makeFailingAdapter({ name: 'NotAllowedError', message: 'No.' })}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('btn'));
    });

    // In error state, result should be empty
    expect(screen.getByTestId('result').textContent).toBe('');
  });
});
