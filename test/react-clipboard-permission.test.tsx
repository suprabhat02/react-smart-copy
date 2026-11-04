import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useClipboardPermission } from '../src/react/useClipboardPermission';

function fakeStatus(initial: string) {
  const listeners = new Set<() => void>();
  return {
    state: initial,
    listeners,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    set(next: string) {
      this.state = next;
      for (const listener of [...listeners]) listener();
    },
  };
}

function Probe({ name }: { readonly name?: 'read' | 'write' }) {
  const { state } = useClipboardPermission(name);
  return <output>{state}</output>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useClipboardPermission', () => {
  it('starts as checking, then follows the permission as the user changes it', async () => {
    const status = fakeStatus('prompt');
    vi.stubGlobal('navigator', { permissions: { query: () => Promise.resolve(status) } });
    const { container } = render(<Probe />);
    const output = container.querySelector('output') as HTMLElement;
    expect(output.textContent).toBe('checking');
    await act(async () => {
      await Promise.resolve();
    });
    expect(output.textContent).toBe('prompt');
    act(() => {
      status.set('denied');
    });
    expect(output.textContent).toBe('denied');
    act(() => {
      status.set('granted');
    });
    expect(output.textContent).toBe('granted');
  });

  it('says unsupported where the browser cannot tell', async () => {
    vi.stubGlobal('navigator', { permissions: { query: () => Promise.reject(new TypeError('no')) } });
    const { container } = render(<Probe />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.querySelector('output')?.textContent).toBe('unsupported');
  });

  it('asks again, from checking, when the name changes, and stops listening on unmount', async () => {
    const statuses = { 'clipboard-read': fakeStatus('granted'), 'clipboard-write': fakeStatus('denied') };
    const query = vi.fn((descriptor: { name: keyof typeof statuses }) => Promise.resolve(statuses[descriptor.name]));
    vi.stubGlobal('navigator', { permissions: { query } });
    const { container, rerender, unmount } = render(<Probe name="read" />);
    const output = container.querySelector('output') as HTMLElement;
    await act(async () => {
      await Promise.resolve();
    });
    expect(output.textContent).toBe('granted');
    rerender(<Probe name="write" />);
    expect(output.textContent).toBe('checking');
    await act(async () => {
      await Promise.resolve();
    });
    expect(output.textContent).toBe('denied');
    expect(statuses['clipboard-read'].listeners.size).toBe(0);
    unmount();
    expect(statuses['clipboard-write'].listeners.size).toBe(0);
  });
});
