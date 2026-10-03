import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import type { PasteStatus } from '../src/core/paste-machine';
import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PasteAdapter } from '../src/core/paste-adapter';
import type { PasteResult } from '../src/core/paste-reader';
import {
  PasteField,
  defaultPasteFieldMessages,
  usePasteField,
  usePasteDisplayStatus,
} from '../src';
import { fakeDataTransfer, pngFile } from './fixtures';
import { deferred, permissionDenied } from './helpers';

/* ---------------------------------------------------------------- fixtures */

const textResult: PasteResult = {
  source: 'clipboard',
  items: [{ type: 'text/plain', data: 'hello world' }],
  text: 'hello world',
  html: null,
  images: [],
  files: [],
};

const adapterOf = (result: PasteResult): PasteAdapter => ({ read: () => Promise.resolve(result) });

const text = (id: string): string | null => screen.getByTestId(id).textContent;

/* ----------------------------------------------------------------- helpers */

function DefaultField({ adapter, announce }: { adapter?: PasteAdapter; announce?: boolean }) {
  return (
    <PasteField.Root
      label="Notes"
      {...(adapter !== undefined ? { pasteOptions: { adapter } } : {})}
      {...(announce !== undefined ? { announce } : {})}
    >
      <PasteField.Label data-testid="label" />
      <PasteField.Status data-testid="status" />
      <PasteField.Zone data-testid="zone" />
      <PasteField.Trigger data-testid="trigger" />
    </PasteField.Root>
  );
}

/* ============================================================== Root render */

describe('PasteField — accessible rendering', () => {
  it('renders label, status, zone and trigger with correct ARIA', () => {
    const { container } = render(<DefaultField />);
    const label = screen.getByTestId('label');
    const trigger = screen.getByTestId('trigger');
    const zone = screen.getByTestId('zone');

    expect(label.textContent).toBe('Notes');
    expect(trigger.getAttribute('aria-label')).toBe('Paste Notes');
    expect(trigger.getAttribute('type')).toBe('button');
    expect(zone.getAttribute('role')).toBe('region');
    expect(zone.getAttribute('aria-label')).toBe('Paste area for Notes');
    expect(container.querySelector('[data-state="idle"]')).toBeTruthy();
  });

  it('root, zone and trigger all carry data-state and data-display-state', () => {
    const { container } = render(<DefaultField />);
    const states = container.querySelectorAll('[data-state="idle"]');
    // Root div + Zone + Trigger = at least 3 elements
    expect(states.length).toBeGreaterThanOrEqual(3);
    const displayStates = container.querySelectorAll('[data-display-state="idle"]');
    expect(displayStates.length).toBeGreaterThanOrEqual(3);
  });

  it('trigger renders stacked default label spanning all paste statuses', () => {
    render(<DefaultField />);
    const trigger = screen.getByTestId('trigger');
    expect(trigger.querySelector('[data-trigger-label="idle"]')).toBeTruthy();
    expect(trigger.querySelector('[data-trigger-label="reading"]')).toBeTruthy();
    expect(trigger.querySelector('[data-trigger-label="read"]')).toBeTruthy();
    expect(trigger.querySelector('[data-trigger-label="error"]')).toBeTruthy();
    // Only idle is active
    expect(trigger.querySelector('[data-trigger-label="idle"][data-active]')).toBeTruthy();
    expect(trigger.querySelector('[data-trigger-label="read"][data-active]')).toBeNull();
  });

  it('label id connects to zone aria-labelledby', () => {
    render(<DefaultField />);
    const label = screen.getByTestId('label');
    const zone = screen.getByTestId('zone');
    expect(zone.getAttribute('aria-labelledby')).toBe(label.id);
  });

  it('custom messages override defaults', () => {
    render(
      <PasteField.Root
        label="Content"
        messages={{
          triggerLabel: (l) => `Insert ${l}`,
          zoneLabel: (l) => `Drop zone for ${l}`,
        }}
      >
        <PasteField.Zone data-testid="zone" />
        <PasteField.Trigger data-testid="trigger" />
      </PasteField.Root>,
    );
    expect(screen.getByTestId('trigger').getAttribute('aria-label')).toBe('Insert Content');
    expect(screen.getByTestId('zone').getAttribute('aria-label')).toBe('Drop zone for Content');
  });

  it('empty triggerLabel falls back to default', () => {
    render(
      <PasteField.Root label="Image" messages={{ triggerLabel: () => '' }}>
        <PasteField.Trigger data-testid="trigger" />
      </PasteField.Root>,
    );
    expect(screen.getByTestId('trigger').getAttribute('aria-label')).toBe('Paste Image');
  });

  it('empty zoneLabel falls back to default', () => {
    render(
      <PasteField.Root label="Image" messages={{ zoneLabel: () => '' }}>
        <PasteField.Zone data-testid="zone" />
      </PasteField.Root>,
    );
    expect(screen.getByTestId('zone').getAttribute('aria-label')).toBe('Paste area for Image');
  });
});

/* =========================================================== Paste lifecycle */

describe('PasteField — paste lifecycle', () => {
  it('idle → reading → read via Trigger click', async () => {
    const pending = deferred<PasteResult>();
    render(
      <PasteField.Root label="Text" pasteOptions={{ adapter: { read: () => pending.promise } }}>
        <PasteField.Status data-testid="status" />
        <PasteField.Trigger data-testid="trigger" />
      </PasteField.Root>,
    );
    expect(text('status')).toBe('Ready');

    fireEvent.click(screen.getByTestId('trigger'));
    expect(screen.getByTestId('trigger').getAttribute('data-state')).toBe('reading');

    await act(async () => {
      pending.resolve(textResult);
      await pending.promise;
    });
    expect(screen.getByTestId('trigger').getAttribute('data-state')).toBe('read');
    expect(text('status')).toBe('Pasted');
  });

  it('announces success via live region', async () => {
    render(
      <PasteField.Root label="Text" pasteOptions={{ adapter: adapterOf(textResult) }}>
        <PasteField.Trigger data-testid="trigger" />
      </PasteField.Root>,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('trigger'));
      await Promise.resolve();
    });
    const announcer = document.querySelector('[role="status"]');
    expect(announcer?.textContent).toBe('Pasted from clipboard');
  });

  it('custom pasted message (function) receives PasteResult', async () => {
    render(
      <PasteField.Root
        label="Text"
        pasteOptions={{ adapter: adapterOf(textResult) }}
        messages={{ pasted: (r) => `Got: ${r.text ?? ''}` }}
      >
        <PasteField.Trigger data-testid="trigger" />
      </PasteField.Root>,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('trigger'));
      await Promise.resolve();
    });
    const announcer = document.querySelector('[role="status"]');
    expect(announcer?.textContent).toBe('Got: hello world');
  });

  it('announces error via live region', async () => {
    const failing: PasteAdapter = {
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      read: () => Promise.reject(permissionDenied),
    };
    render(
      <PasteField.Root label="Text" pasteOptions={{ adapter: failing }}>
        <PasteField.Trigger data-testid="trigger" />
      </PasteField.Root>,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('trigger'));
      await Promise.resolve();
    });
    const announcer = document.querySelector('[role="status"]');
    expect(announcer?.textContent).toContain('Clipboard access was blocked');
  });

  it('announce={false} renders no live region', async () => {
    render(
      <PasteField.Root label="Text" pasteOptions={{ adapter: adapterOf(textResult) }} announce={false}>
        <PasteField.Trigger data-testid="trigger" />
      </PasteField.Root>,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('trigger'));
      await Promise.resolve();
    });
    expect(document.querySelector('[role="status"]')).toBeNull();
  });

  it('root data-state updates through full paste cycle', async () => {
    const { container } = render(
      <PasteField.Root label="Text" pasteOptions={{ adapter: adapterOf(textResult) }}>
        <PasteField.Trigger data-testid="trigger" />
      </PasteField.Root>,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.dataset.state).toBe('idle');

    await act(async () => {
      fireEvent.click(screen.getByTestId('trigger'));
      await Promise.resolve();
    });
    expect(root.dataset.state).toBe('read');
  });

  it('works under StrictMode', async () => {
    render(
      <StrictMode>
        <PasteField.Root label="Text" pasteOptions={{ adapter: adapterOf(textResult) }}>
          <PasteField.Status data-testid="status" />
          <PasteField.Trigger data-testid="trigger" />
        </PasteField.Root>
      </StrictMode>,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('trigger'));
      await Promise.resolve();
    });
    expect(text('status')).toBe('Pasted');
  });
});

/* ============================================================== Zone / paste event */

describe('PasteField — Zone paste events', () => {
  it('accepts keyboard paste on the Zone', async () => {
    render(
      <PasteField.Root label="Text" pasteOptions={{ accept: ['text'] }}>
        <PasteField.Status data-testid="status" />
        <PasteField.Zone data-testid="zone" />
      </PasteField.Root>,
    );
    await act(async () => {
      fireEvent.paste(screen.getByTestId('zone'), {
        clipboardData: fakeDataTransfer({ 'text/plain': 'pasted via zone' }),
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(text('status')).toBe('Pasted');
  });

  it('accepts image paste on the Zone', async () => {
    const onPaste = vi.fn();
    render(
      <PasteField.Root label="Image" pasteOptions={{ accept: ['image'], onPaste }}>
        <PasteField.Status data-testid="status" />
        <PasteField.Zone data-testid="zone" />
      </PasteField.Root>,
    );
    await act(async () => {
      fireEvent.paste(screen.getByTestId('zone'), {
        clipboardData: fakeDataTransfer({}, [pngFile()]),
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(text('status')).toBe('Pasted');
    expect(onPaste).toHaveBeenCalledOnce();
  });

  it('does not intercept pastes without accepted content', () => {
    render(
      <PasteField.Root label="Image" pasteOptions={{ accept: ['image'] }}>
        <PasteField.Status data-testid="status" />
        <PasteField.Zone data-testid="zone" />
      </PasteField.Root>,
    );
    const event = fireEvent.paste(screen.getByTestId('zone'), {
      clipboardData: fakeDataTransfer({ 'text/plain': 'text' }),
    });
    expect(event).toBe(true); // not default-prevented
    expect(text('status')).toBe('Ready');
  });

  it('Zone is focusable by default (tabIndex=0)', () => {
    render(
      <PasteField.Root label="Text">
        <PasteField.Zone data-testid="zone" />
      </PasteField.Root>,
    );
    expect(screen.getByTestId('zone').getAttribute('tabindex')).toBe('0');
  });

  it('focusable={false} removes tabIndex', () => {
    render(
      <PasteField.Root label="Text">
        <PasteField.Zone data-testid="zone" focusable={false} />
      </PasteField.Root>,
    );
    expect(screen.getByTestId('zone').getAttribute('tabindex')).toBeNull();
  });

  it('consumer onPaste runs first; if defaultPrevented, zone paste is skipped', async () => {
    const consumer = vi.fn((e: React.ClipboardEvent) => { e.preventDefault(); });
    render(
      <PasteField.Root label="Text">
        <PasteField.Status data-testid="status" />
        <PasteField.Zone data-testid="zone" onPaste={consumer} />
      </PasteField.Root>,
    );
    fireEvent.paste(screen.getByTestId('zone'), {
      clipboardData: fakeDataTransfer({ 'text/plain': 'blocked' }),
    });
    expect(consumer).toHaveBeenCalledOnce();
    expect(text('status')).toBe('Ready');
  });
});

/* =============================================================== Status sub-component */

describe('PasteField.Status', () => {
  it('shows default English labels per status', async () => {
    render(
      <PasteField.Root label="Text" pasteOptions={{ adapter: adapterOf(textResult) }}>
        <PasteField.Status data-testid="status" />
        <PasteField.Trigger data-testid="trigger" />
      </PasteField.Root>,
    );
    expect(text('status')).toBe('Ready');

    await act(async () => {
      fireEvent.click(screen.getByTestId('trigger'));
      await Promise.resolve();
    });
    expect(text('status')).toBe('Pasted');
  });

  it('custom labels override defaults', async () => {
    render(
      <PasteField.Root label="Text" pasteOptions={{ adapter: adapterOf(textResult) }}>
        <PasteField.Status data-testid="status" labels={{ idle: 'Waiting', read: 'Done!' }} />
        <PasteField.Trigger data-testid="trigger" />
      </PasteField.Root>,
    );
    expect(text('status')).toBe('Waiting');
    await act(async () => {
      fireEvent.click(screen.getByTestId('trigger'));
      await Promise.resolve();
    });
    expect(text('status')).toBe('Done!');
  });

  it('children override label rendering', () => {
    render(
      <PasteField.Root label="Text">
        <PasteField.Status data-testid="status">custom child</PasteField.Status>
      </PasteField.Root>,
    );
    expect(text('status')).toBe('custom child');
  });
});

/* ============================================================= Trigger render fn */

describe('PasteField.Trigger render function', () => {
  it('receives live render props', async () => {
    render(
      <PasteField.Root label="Text" pasteOptions={{ adapter: adapterOf(textResult) }}>
        <PasteField.Trigger data-testid="trigger">
          {({ status, displayStatus, revealed }) => (
            <span data-testid="inner">
              {status}/{displayStatus}/{String(revealed)}
            </span>
          )}
        </PasteField.Trigger>
      </PasteField.Root>,
    );
    expect(screen.getByTestId('inner').textContent).toBe('idle/idle/false');
  });

  it('static children replace the default label', () => {
    render(
      <PasteField.Root label="Text">
        <PasteField.Trigger data-testid="trigger">
          <span data-testid="static">Click me</span>
        </PasteField.Trigger>
      </PasteField.Root>,
    );
    expect(screen.getByTestId('static').textContent).toBe('Click me');
  });
});

/* ================================================================ Label sub-component */

describe('PasteField.Label', () => {
  it('renders the label text from context', () => {
    render(
      <PasteField.Root label="My Label">
        <PasteField.Label data-testid="label" />
      </PasteField.Root>,
    );
    expect(text('label')).toBe('My Label');
  });

  it('children override the label text', () => {
    render(
      <PasteField.Root label="My Label">
        <PasteField.Label data-testid="label">Custom label</PasteField.Label>
      </PasteField.Root>,
    );
    expect(text('label')).toBe('Custom label');
  });
});

/* ========================================================== Error state */

describe('PasteField — error state', () => {
  it('shows error state on paste failure', async () => {
    const failing: PasteAdapter = {
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      read: () => Promise.reject(permissionDenied),
    };
    const { container } = render(
      <PasteField.Root label="Text" pasteOptions={{ adapter: failing }}>
        <PasteField.Status data-testid="status" />
        <PasteField.Trigger data-testid="trigger" />
      </PasteField.Root>,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('trigger'));
      await Promise.resolve();
    });
    expect(text('status')).toBe('Error');
    const root = container.firstElementChild as HTMLElement;
    expect(root.dataset.state).toBe('error');
  });
});

/* ================================================================= usePasteField */

describe('usePasteField', () => {
  it('throws outside PasteField.Root', () => {
    const Orphan = () => {
      usePasteField();
      return null;
    };
    expect(() => render(<Orphan />)).toThrow('usePasteField() must be used inside <PasteField.Root>.');
  });

  it('exposes label, labelId, zoneId from context', () => {
    const captured: { value: ReturnType<typeof usePasteField> | null } = { value: null };
    function Probe() {
      captured.value = usePasteField();
      return null;
    }
    render(
      <PasteField.Root label="Email">
        <Probe />
      </PasteField.Root>,
    );
    expect(captured.value?.label).toBe('Email');
    expect(typeof captured.value?.labelId).toBe('string');
    expect(typeof captured.value?.zoneId).toBe('string');
  });

  it('doPaste is stable across renders', async () => {
    let first: (() => unknown) | null = null;
    let second: (() => unknown) | null = null;
    function Probe({ round }: { round: number }) {
      const field = usePasteField();
      if (round === 1) first = field.doPaste;
      if (round === 2) second = field.doPaste;
      return null;
    }
    const { rerender } = render(
      <PasteField.Root label="X">
        <Probe round={1} />
      </PasteField.Root>,
    );
    rerender(
      <PasteField.Root label="X">
        <Probe round={2} />
      </PasteField.Root>,
    );
    expect(first).toBe(second);
  });
});

/* ================================================================= defaultPasteFieldMessages */

describe('defaultPasteFieldMessages', () => {
  it('pasted is a non-empty string', () => {
    expect(typeof defaultPasteFieldMessages.pasted).toBe('string');
    expect((defaultPasteFieldMessages.pasted as string).length).toBeGreaterThan(0);
  });

  it('triggerLabel includes the label', () => {
    expect(defaultPasteFieldMessages.triggerLabel('File')).toContain('File');
  });

  it('zoneLabel includes the label', () => {
    expect(defaultPasteFieldMessages.zoneLabel('File')).toContain('File');
  });

  it('error calls describePasteError', () => {
    const msg = defaultPasteFieldMessages.error({ type: 'permission-denied', message: 'denied' });
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
  });
});

/* ================================================================= usePasteDisplayStatus */

describe('usePasteDisplayStatus', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns idle immediately in idle state', () => {
    const { result } = renderHook(() => usePasteDisplayStatus('idle'));
    expect(result.current).toBe('idle');
  });

  it('returns read immediately in read state', () => {
    const { result } = renderHook(() => usePasteDisplayStatus('read'));
    expect(result.current).toBe('read');
  });

  it('suppresses fast reading — shows previous settled status', () => {
    vi.useFakeTimers();
    const seen: PasteStatus[] = [];
    function Probe({ status }: { status: PasteStatus }) {
      const display = usePasteDisplayStatus(status, { pendingDelayMs: 200 });
      seen.push(display);
      return null;
    }
    const { rerender } = render(<Probe status="idle" />);
    rerender(<Probe status="reading" />);
    // pendingDelayMs not yet elapsed — still shows idle
    rerender(<Probe status="read" />);
    // Should go idle → idle (suppressed reading) → read
    expect(seen).not.toContain('reading');
    expect(seen.at(-1)).toBe('read');
  });

  it('shows reading once pendingDelayMs elapses', () => {
    vi.useFakeTimers();
    const seen: PasteStatus[] = [];
    function Probe({ status }: { status: PasteStatus }) {
      const display = usePasteDisplayStatus(status, { pendingDelayMs: 100, minPendingMs: 0 });
      if (seen.at(-1) !== display) seen.push(display);
      return null;
    }
    const { rerender } = render(<Probe status="idle" />);
    rerender(<Probe status="reading" />);
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(seen).toContain('reading');
  });
});

/* ================================================================= SSR */

describe('PasteField — SSR', () => {
  it('renders idle markup without touching window', () => {
    const html = renderToString(
      <PasteField.Root label="Note">
        <PasteField.Label />
        <PasteField.Status />
        <PasteField.Zone />
        <PasteField.Trigger />
      </PasteField.Root>,
    );
    expect(html).toContain('data-state="idle"');
    expect(html).toContain('Note');
    expect(html).toContain('Paste Note');
    expect(html).toContain('Paste area for Note');
  });

  it('live region is empty on server (no pre-announce)', () => {
    const html = renderToString(
      <PasteField.Root label="Note">
        <PasteField.Trigger />
      </PasteField.Root>,
    );
    expect(html).toContain('role="status"');
    expect(html).not.toContain('Pasted from clipboard');
  });
});

/* ================================================================= forwardRef / custom children */

describe('PasteField — refs and composability', () => {
  it('Root forwards ref to the div', () => {
    let captured: HTMLDivElement | null = null;
    render(
      <PasteField.Root label="Text" ref={(el) => { captured = el; }}>
        <PasteField.Trigger />
      </PasteField.Root>,
    );
    expect(captured).toBeInstanceOf(HTMLDivElement);
  });

  it('Zone forwards ref to the div', () => {
    let captured: HTMLDivElement | null = null;
    render(
      <PasteField.Root label="Text">
        <PasteField.Zone ref={(el) => { captured = el; }} />
      </PasteField.Root>,
    );
    expect(captured).toBeInstanceOf(HTMLDivElement);
  });

  it('Trigger forwards ref to the button', () => {
    let captured: HTMLButtonElement | null = null;
    render(
      <PasteField.Root label="Text">
        <PasteField.Trigger ref={(el) => { captured = el; }} />
      </PasteField.Root>,
    );
    expect(captured).toBeInstanceOf(HTMLButtonElement);
  });
});

/* ================================================================= branch coverage */

describe('PasteField — branch coverage', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes pendingDelayMs and minPendingMs through to usePasteDisplayStatus', async () => {
    // Exercises the pendingDelayMs/minPendingMs spread branches in Root (lines 107-108)
    vi.useFakeTimers();
    const pending = deferred<PasteResult>();
    const { container } = render(
      <PasteField.Root
        label="Text"
        pasteOptions={{ adapter: { read: () => pending.promise } }}
        pendingDelayMs={50}
        minPendingMs={200}
      >
        <PasteField.Trigger data-testid="trigger" />
      </PasteField.Root>,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.dataset.displayState).toBe('idle');
    fireEvent.click(screen.getByTestId('trigger'));
    // Before delay elapses, displayState stays idle
    act(() => { vi.advanceTimersByTime(10); });
    expect(root.dataset.displayState).toBe('idle');
    // After pendingDelayMs, displayState becomes reading
    act(() => { vi.advanceTimersByTime(60); });
    expect(root.dataset.displayState).toBe('reading');
    // Resolve — but minPendingMs keeps reading visible briefly
    await act(async () => {
      pending.resolve(textResult);
      await pending.promise;
    });
    expect(root.dataset.displayState).toBe('reading');
    // After minPendingMs the display settles
    act(() => { vi.advanceTimersByTime(300); });
    expect(root.dataset.displayState).toBe('read');
  });

  it('data-revealed is set when the trigger becomes visible via pointer hover', () => {
    // Exercises data-revealed={reveal.visible ? '' : undefined} branch (line 328)
    render(
      <PasteField.Root label="Text">
        <PasteField.Trigger data-testid="trigger" />
      </PasteField.Root>,
    );
    const trigger = screen.getByTestId('trigger');
    // Before hover — not revealed
    expect(trigger.hasAttribute('data-revealed')).toBe(false);
    // Hover on Root reveals the trigger
    const root = trigger.closest('[data-state]') as HTMLElement;
    fireEvent.pointerEnter(root);
    expect(trigger.hasAttribute('data-revealed')).toBe(true);
    fireEvent.pointerLeave(root);
    expect(trigger.hasAttribute('data-revealed')).toBe(false);
  });

  it('Root onPointerDown is composed with reveal', () => {
    // Exercises composeEventHandlers(onPointerDown, ...) branch (line 158)
    const onPointerDown = vi.fn();
    const { container } = render(
      <PasteField.Root label="Text" onPointerDown={onPointerDown}>
        <PasteField.Trigger data-testid="trigger" />
      </PasteField.Root>,
    );
    const root = container.firstElementChild as HTMLElement;
    fireEvent.pointerDown(root);
    expect(onPointerDown).toHaveBeenCalledOnce();
  });

  it('usePasteDisplayStatus: slow paste shows reading and clears after minPendingMs', async () => {
    // Exercises the minPendingMs cleanup timer (lines 55-60 of usePasteDisplayStatus.ts)
    vi.useFakeTimers();
    const seen: PasteStatus[] = [];
    function Probe({ status }: { status: PasteStatus }) {
      const display = usePasteDisplayStatus(status, { pendingDelayMs: 50, minPendingMs: 300 });
      if (seen.at(-1) !== display) seen.push(display);
      return null;
    }
    const { rerender } = render(<Probe status="idle" />);
    rerender(<Probe status="reading" />);
    // Trigger pendingDelayMs
    act(() => { vi.advanceTimersByTime(100); });
    expect(seen).toContain('reading');
    // Resolve to read — minPendingMs keeps 'reading' visible
    rerender(<Probe status="read" />);
    expect(seen.at(-1)).toBe('reading');
    // After minPendingMs the cleanup fires and display settles to read
    act(() => { vi.advanceTimersByTime(400); });
    expect(seen.at(-1)).toBe('read');
  });
});
