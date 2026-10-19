import { act, renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import type { ClipboardAdapter } from '../../src/core/clipboard-adapter';
import { useShare, type ShareEnvironment, type UseShareOutcome } from '../../src';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const ok: ClipboardAdapter = { write: () => Promise.resolve() };

/** A share sheet that stays open until the test closes it. */
function sheet() {
  let close: ((error?: Error) => void) | undefined;
  const environment: ShareEnvironment = {
    navigator: {
      share: () =>
        new Promise<void>((resolve, reject) => {
          close = (error) => {
            if (error === undefined) resolve();
            else reject(error);
          };
        }),
      canShare: () => true,
    },
    matchMedia: () => ({ matches: true }),
  };
  return { environment, close: (error?: Error) => close?.(error) };
}

describe('useShare', () => {
  it('copies on desktop: sharing, then copied, then idle again', async () => {
    vi.useFakeTimers();
    const onShare = vi.fn();
    const { result } = renderHook(() => useShare({ adapter: ok, environment: { matchMedia: () => ({ matches: false }) }, onShare }));
    expect(result.current).toMatchObject({ status: 'idle', method: 'copy', outcome: null, error: null });
    const { share, reset } = result.current;
    let outcome: UseShareOutcome | undefined;
    await act(async () => {
      outcome = await result.current.share({ url: 'https://example.com', title: 'Example' });
    });
    expect(outcome).toMatchObject({ status: 'copied', reason: 'preferred' });
    expect(result.current.status).toBe('copied');
    expect(onShare).toHaveBeenCalledWith(outcome);
    expect(result.current.share).toBe(share);
    expect(result.current.reset).toBe(reset);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.status).toBe('idle');
  });

  it('honours resetAfterMs', async () => {
    vi.useFakeTimers();
    const run = async (resetAfterMs: number) => {
      const { result } = renderHook(() => useShare({ mode: 'copy', adapter: ok, resetAfterMs }));
      await act(async () => {
        await result.current.share({ text: 'x' });
      });
      act(() => {
        vi.advanceTimersByTime(10);
      });
      return result.current.status;
    };
    expect(await run(10)).toBe('idle');
    expect(await run(-5)).toBe('idle');
    expect(await run(Infinity)).toBe('copied');
    expect(await run(Number.NaN)).toBe('copied'); // NaN falls back to the default 2000 ms.
  });

  it('shows sharing while the share sheet is open, and ignores a second share meanwhile', async () => {
    const { environment, close } = sheet();
    const { result } = renderHook(() => useShare({ environment, resetAfterMs: false }));
    expect(result.current.method).toBe('native');
    let first: Promise<UseShareOutcome> | undefined;
    act(() => {
      first = result.current.share({ url: 'https://example.com' });
    });
    expect(result.current.status).toBe('sharing');
    let second: UseShareOutcome | undefined;
    await act(async () => {
      second = await result.current.share({ url: 'https://example.com' });
    });
    expect(second).toEqual({ status: 'ignored', reason: 'in-flight' });
    await act(async () => {
      close();
      await first;
    });
    expect(result.current.status).toBe('shared');
  });

  it('returns to idle when the share sheet is closed, keeping the outcome', async () => {
    const { environment, close } = sheet();
    const { result } = renderHook(() => useShare({ environment }));
    await act(async () => {
      const pending = result.current.share({ url: 'https://example.com' });
      close(new DOMException('closed', 'AbortError'));
      await pending;
    });
    expect(result.current).toMatchObject({ status: 'idle', outcome: { status: 'cancelled' }, error: null });
  });

  it('exposes the error of a failed share', async () => {
    const failing: ClipboardAdapter = { write: () => Promise.reject(new DOMException('no', 'NotAllowedError')) };
    const { result } = renderHook(() => useShare({ mode: 'copy', adapter: failing }));
    await act(async () => {
      await result.current.share({ text: 'x' });
    });
    expect(result.current).toMatchObject({ status: 'error', error: { type: 'permission-denied' } });
  });

  it('ignores a result after reset() or unmount', async () => {
    const first = sheet();
    const { result } = renderHook(() => useShare({ environment: first.environment }));
    await act(async () => {
      const pending = result.current.share({ url: 'https://example.com' });
      result.current.reset();
      first.close();
      expect(await pending).toMatchObject({ status: 'shared' });
    });
    expect(result.current).toMatchObject({ status: 'idle', outcome: null });

    const second = sheet();
    const onShare = vi.fn();
    const hook = renderHook(() => useShare({ environment: second.environment, onShare }));
    let pending: Promise<UseShareOutcome> | undefined;
    act(() => {
      pending = hook.result.current.share({ url: 'https://example.com' });
    });
    hook.unmount();
    second.close();
    await pending;
    expect(onShare).not.toHaveBeenCalled();
  });

  it('follows the device: the method updates when the media query changes', () => {
    let touch = false;
    const listeners = new Set<() => void>();
    vi.stubGlobal('matchMedia', (query: string) => ({
      get matches() {
        return touch && query.includes('coarse');
      },
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    }));
    Object.defineProperty(navigator, 'share', { value: () => Promise.resolve(), configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    onTestFinished(() => {
      Reflect.deleteProperty(navigator, 'share');
      Reflect.deleteProperty(navigator, 'canShare');
    });
    const { result, unmount } = renderHook(() => useShare());
    expect(result.current.method).toBe('copy');
    act(() => {
      touch = true;
      listeners.forEach((listener) => {
        listener();
      });
    });
    expect(result.current.method).toBe('native');
    unmount();
    expect(listeners.size).toBe(0);
  });

  it('works without matchMedia, and renders on the server as copy', () => {
    vi.stubGlobal('matchMedia', undefined);
    const { result } = renderHook(() => useShare());
    expect(result.current.method).toBe('copy');
    function Button() {
      const { method } = useShare({ environment: sheet().environment });
      return <button type="button">{method === 'native' ? 'Share' : 'Copy link'}</button>;
    }
    expect(renderToString(<Button />)).toContain('Copy link');
  });
});
