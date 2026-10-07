import { act, renderHook } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ClipboardAdapter } from '../src/core/clipboard-adapter';
import type { PasteAdapter } from '../src/core/paste-adapter';
import { useCopy } from '../src/react/useCopy';
import { usePaste } from '../src/react/usePaste';
import { flush } from './helpers';

const never = <T,>(): Promise<T> => new Promise<T>(() => undefined);
const strict = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;

describe('useCopy onReset / onCancel', () => {
  it('calls onCancel("disconnect") when unmounted mid-copy, and nothing when idle', () => {
    const adapter: ClipboardAdapter = { write: never };
    const onCancel = vi.fn();
    const idle = renderHook(() => useCopy({ adapter, onCancel }), { wrapper: strict });
    idle.unmount();
    expect(onCancel).not.toHaveBeenCalled();

    const { result, unmount } = renderHook(() => useCopy({ adapter, onCancel }), { wrapper: strict });
    act(() => {
      void result.current.copy('x');
    });
    unmount();
    expect(onCancel).toHaveBeenCalledExactlyOnceWith('disconnect');
  });

  it('calls the latest onReset after reset() from copied', async () => {
    const adapter: ClipboardAdapter = { write: () => Promise.resolve() };
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(({ onReset }) => useCopy({ adapter, onReset }), {
      initialProps: { onReset: first },
    });
    await act(async () => {
      await result.current.copy('x');
    });
    rerender({ onReset: second });
    act(() => {
      result.current.reset();
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('idle');
  });
});

describe('usePaste onReset / onCancel', () => {
  it('calls onCancel("disconnect") when unmounted mid-read', () => {
    const adapter: PasteAdapter = { read: never };
    const onCancel = vi.fn();
    const { result, unmount } = renderHook(() => usePaste({ adapter, onCancel }), { wrapper: strict });
    act(() => {
      void result.current.paste();
    });
    expect(onCancel).not.toHaveBeenCalled();
    unmount();
    expect(onCancel).toHaveBeenCalledExactlyOnceWith('disconnect');
  });

  it('calls onCancel("reset") then onReset when reset() cancels a read', async () => {
    const adapter: PasteAdapter = { read: never };
    const calls: string[] = [];
    const { result } = renderHook(() =>
      usePaste({ adapter, onCancel: (reason) => calls.push(reason), onReset: () => calls.push('onReset') }),
    );
    act(() => {
      void result.current.paste();
    });
    act(() => {
      result.current.reset();
    });
    await act(flush);
    expect(calls).toEqual(['reset', 'onReset']);
    expect(result.current.status).toBe('idle');
  });
});
