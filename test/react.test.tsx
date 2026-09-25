import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CopyField,
  useCopy,
  useCopyField,
  useDisplayStatus,
  useRevealOnInteraction,
  type CopyStatus,
} from '../src';
import { createControllableAdapter, flush, permissionDenied } from './helpers';

afterEach(() => {
  vi.useRealTimers();
});

/** The label a sighted user actually sees on the default trigger. */
const visibleLabel = (trigger: HTMLElement): string | null | undefined =>
  trigger.querySelector('[data-active]')?.textContent;

describe('useCopy', () => {
  it('drives the state machine and keeps function identities stable', async () => {
    const c = createControllableAdapter();
    const { result, rerender } = renderHook(() => useCopy({ adapter: c.adapter }));
    const { copy, retry, reset } = result.current;

    act(() => {
      void result.current.copy('a');
    });
    expect(result.current.status).toBe('copying');

    await act(async () => {
      c.resolve();
      await flush();
    });
    expect(result.current.status).toBe('copied');

    rerender();
    expect(result.current.copy).toBe(copy);
    expect(result.current.retry).toBe(retry);
    expect(result.current.reset).toBe(reset);
  });

  it('exposes error and canRetry', async () => {
    const c = createControllableAdapter();
    const { result } = renderHook(() => useCopy({ adapter: c.adapter }));
    await act(async () => {
      const outcome = result.current.copy('a');
      c.reject(permissionDenied);
      await outcome;
    });
    expect(result.current.error?.type).toBe('permission-denied');
    expect(result.current.canRetry).toBe(true);
  });

  it('always calls the latest inline callback', async () => {
    const c = createControllableAdapter();
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(({ onCopy }) => useCopy({ adapter: c.adapter, onCopy }), {
      initialProps: { onCopy: first },
    });
    rerender({ onCopy: second });
    await act(async () => {
      const outcome = result.current.copy('a');
      c.resolve();
      await outcome;
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it('works under StrictMode double effects, including auto-reset', async () => {
    vi.useFakeTimers();
    const c = createControllableAdapter();
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
    const { result } = renderHook(() => useCopy({ adapter: c.adapter }), { wrapper });
    await act(async () => {
      const outcome = result.current.copy('a');
      c.resolve();
      await outcome;
    });
    expect(result.current.status).toBe('copied');
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.status).toBe('idle');
  });

  it('unmounting mid-copy produces no warnings', async () => {
    const errors = vi.spyOn(console, 'error');
    const c = createControllableAdapter();
    const onCopy = vi.fn();
    const { result, unmount } = renderHook(() => useCopy({ adapter: c.adapter, onCopy }));
    act(() => {
      void result.current.copy('a');
    });
    unmount();
    c.resolve();
    await flush();
    expect(errors).not.toHaveBeenCalled();
    expect(onCopy).not.toHaveBeenCalled();
  });

  it('renders idle on the server', () => {
    function Probe() {
      const { status } = useCopy();
      return <span>{status}</span>;
    }
    expect(renderToString(<Probe />)).toContain('idle');
  });
});

describe('useRevealOnInteraction', () => {
  function Row({ alwaysVisible = false }: { alwaysVisible?: boolean }) {
    const { visible, reason, targetProps } = useRevealOnInteraction<HTMLDivElement>({ alwaysVisible });
    return (
      <div data-testid="row" data-visible={String(visible)} data-reason={reason ?? ''} {...targetProps}>
        <button type="button">Action</button>
      </div>
    );
  }

  it('reveals on hover and hides on leave', () => {
    render(<Row />);
    const row = screen.getByTestId('row');
    expect(row.dataset['visible']).toBe('false');
    fireEvent.pointerEnter(row);
    expect(row.dataset['reason']).toBe('hover');
    fireEvent.pointerLeave(row);
    expect(row.dataset['visible']).toBe('false');
  });

  it('reveals on keyboard focus within and hides when focus leaves', () => {
    render(
      <>
        <Row />
        <button type="button">Outside</button>
      </>,
    );
    const row = screen.getByTestId('row');
    act(() => {
      screen.getByRole('button', { name: 'Action' }).focus();
    });
    expect(row.dataset['reason']).toBe('focus');
    act(() => {
      screen.getByRole('button', { name: 'Outside' }).focus();
    });
    expect(row.dataset['visible']).toBe('false');
  });

  it('can be forced visible', () => {
    render(<Row alwaysVisible />);
    expect(screen.getByTestId('row').dataset['reason']).toBe('forced');
  });

  it('is hidden in server output (no hydration mismatch)', () => {
    expect(renderToString(<Row />)).toContain('data-visible="false"');
  });
});

describe('CopyField', () => {
  function Field(props: { value?: string | (() => string); adapter: ReturnType<typeof createControllableAdapter>['adapter'] }) {
    return (
      <CopyField.Root value={props.value ?? 'shubh@example.com'} label="Email" copyOptions={{ adapter: props.adapter }}>
        <CopyField.Label />
        <CopyField.Value />
        <CopyField.Trigger />
      </CopyField.Root>
    );
  }

  it('renders an accessible, labelled trigger and the value', () => {
    render(<Field adapter={createControllableAdapter().adapter} />);
    expect(screen.getByRole('button', { name: 'Copy Email' }).getAttribute('type')).toBe('button');
    expect(screen.getByText('Email')).toBeTruthy();
    expect(screen.getByText('shubh@example.com')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('copies on click, announces success and exposes data-state', async () => {
    const c = createControllableAdapter();
    render(<Field adapter={c.adapter} />);
    const trigger = screen.getByRole('button', { name: 'Copy Email' });

    fireEvent.click(trigger);
    expect(trigger.dataset['state']).toBe('copying');
    expect(trigger.dataset['displayState']).toBe('idle'); // fast copy: no "Copying…" flash
    await act(async () => {
      c.resolve();
      await flush();
    });

    expect(c.calls).toEqual([{ kind: 'text', value: 'shubh@example.com' }]);
    expect(trigger.dataset['state']).toBe('copied');
    expect(visibleLabel(trigger)).toBe('Copied');
    expect(trigger.dataset['displayState']).toBe('copied');
    expect(screen.getByRole('status').textContent).toBe('Copied to clipboard');
    expect(document.activeElement === trigger || document.activeElement === document.body).toBe(true);
  });

  it('announces a human-readable error', async () => {
    const c = createControllableAdapter();
    render(<Field adapter={c.adapter} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy Email' }));
    await act(async () => {
      c.reject(permissionDenied);
      await flush();
    });
    expect(screen.getByRole('status').textContent).toBe('Clipboard access was blocked. Allow it and try again.');
    expect(visibleLabel(screen.getByRole('button', { name: 'Copy Email' }))).toBe('Retry');
  });

  it('reads a lazy value at click time', () => {
    const c = createControllableAdapter();
    let token = 'old';
    render(<Field adapter={c.adapter} value={() => token} />);
    token = 'fresh';
    fireEvent.click(screen.getByRole('button', { name: 'Copy Email' }));
    expect(c.calls[0]).toEqual({ kind: 'text', value: 'fresh' });
  });

  it('supports render-function children and consumer handlers with preventDefault', () => {
    const c = createControllableAdapter();
    const onClick = vi.fn((event: { preventDefault: () => void }) => {
      event.preventDefault();
    });
    render(
      <CopyField.Root value="x" label="ID" copyOptions={{ adapter: c.adapter }}>
        <CopyField.Trigger onClick={onClick}>{({ status }) => `[${status}]`}</CopyField.Trigger>
      </CopyField.Root>,
    );
    const trigger = screen.getByRole('button', { name: 'Copy ID' });
    expect(trigger.textContent).toBe('[idle]');
    fireEvent.click(trigger);
    expect(onClick).toHaveBeenCalledOnce();
    expect(c.calls).toHaveLength(0);
  });

  it('localises messages', async () => {
    const c = createControllableAdapter();
    render(
      <CopyField.Root
        value="x"
        label="ईमेल"
        copyOptions={{ adapter: c.adapter }}
        messages={{ copied: 'कॉपी हो गया', triggerLabel: (label) => `${label} कॉपी करें` }}
      >
        <CopyField.Trigger />
      </CopyField.Root>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'ईमेल कॉपी करें' }));
    await act(async () => {
      c.resolve();
      await flush();
    });
    expect(screen.getByRole('status').textContent).toBe('कॉपी हो गया');
  });

  it('reveals the root on hover via data-revealed', () => {
    const { container } = render(<Field adapter={createControllableAdapter().adapter} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.hasAttribute('data-revealed')).toBe(false);
    fireEvent.pointerEnter(root);
    expect(root.hasAttribute('data-revealed')).toBe(true);
  });

  it('forwards refs and props to the root', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(
      <CopyField.Root ref={ref} value="x" label="ID" className="row" data-testid="root">
        <CopyField.Trigger />
      </CopyField.Root>,
    );
    expect(ref.current).toBe(screen.getByTestId('root'));
    expect(ref.current?.className).toBe('row');
  });

  it('throws a helpful error when parts are used outside Root', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function Orphan() {
      useCopyField();
      return null;
    }
    expect(() => render(<Orphan />)).toThrow('useCopyField() must be used inside <CopyField.Root>.');
  });

  it('server-renders without touching the clipboard', () => {
    const html = renderToString(
      <CopyField.Root value="x" label="ID">
        <CopyField.Trigger />
      </CopyField.Root>,
    );
    expect(html).toContain('data-state="idle"');
    expect(html).toContain('aria-label="Copy ID"');
  });
});

describe('flicker-free display status', () => {
  function Probe({ status, onRender }: { status: CopyStatus; onRender: (s: CopyStatus) => void }) {
    onRender(useDisplayStatus(status));
    return null;
  }

  function track(initial: CopyStatus) {
    const seen: CopyStatus[] = [];
    const onRender = (s: CopyStatus) => {
      if (seen[seen.length - 1] !== s) seen.push(s);
    };
    const view = render(<Probe status={initial} onRender={onRender} />);
    const set = (status: CopyStatus) => {
      view.rerender(<Probe status={status} onRender={onRender} />);
    };
    return { seen, set };
  }

  it('a fast copy goes straight from idle to copied: "copying" is never displayed', () => {
    vi.useFakeTimers();
    const { seen, set } = track('idle');
    set('copying');
    act(() => {
      vi.advanceTimersByTime(5);
    });
    set('copied');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(seen).toEqual(['idle', 'copied']);
  });

  it('a slow copy shows "copying" after the delay and holds it for the minimum time', () => {
    vi.useFakeTimers();
    const { seen, set } = track('idle');
    set('copying');
    act(() => {
      vi.advanceTimersByTime(149);
    });
    expect(seen).toEqual(['idle']);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(seen).toEqual(['idle', 'copying']);

    act(() => {
      vi.advanceTimersByTime(10);
    });
    set('copied'); // finishes 10 ms after the indicator appeared
    act(() => {
      vi.advanceTimersByTime(389);
    });
    expect(seen).toEqual(['idle', 'copying']); // still held: no blink
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(seen).toEqual(['idle', 'copying', 'copied']);
  });

  it('copying again from "copied" keeps showing "copied" instead of blinking', () => {
    vi.useFakeTimers();
    const { seen, set } = track('copied');
    set('copying');
    act(() => {
      vi.advanceTimersByTime(3);
    });
    set('copied');
    expect(seen).toEqual(['copied']);
  });

  it('the default label keeps a constant width by stacking every state', () => {
    render(
      <CopyField.Root value="x" label="ID">
        <CopyField.Trigger />
      </CopyField.Root>,
    );
    const trigger = screen.getByRole('button', { name: 'Copy ID' });
    const labels = Array.from(trigger.querySelectorAll('[data-trigger-label]'));
    expect(labels.map((l) => l.textContent)).toEqual(['Copy', 'Copying…', 'Copied', 'Retry']);
    expect(labels.filter((l) => l.hasAttribute('data-active'))).toHaveLength(1);
    expect(labels.every((l) => (l as HTMLElement).style.gridArea.startsWith('1'))).toBe(true);
    expect(visibleLabel(trigger)).toBe('Copy');
  });

  it('custom render children receive both the real and the display status', () => {
    const c = createControllableAdapter();
    render(
      <CopyField.Root value="x" label="ID" copyOptions={{ adapter: c.adapter }}>
        <CopyField.Trigger>{({ status, displayStatus }) => `${status}/${displayStatus}`}</CopyField.Trigger>
      </CopyField.Root>,
    );
    const trigger = screen.getByRole('button', { name: 'Copy ID' });
    fireEvent.click(trigger);
    expect(trigger.textContent).toBe('copying/idle');
  });
});
