import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import type { FocusEvent, PointerEvent } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrowserClipboardAdapter } from '../src/core/clipboard-adapter';
import { createCopyMachine } from '../src/core/copy-machine';
import {
  createCopyError,
  describeCopyError,
  describePasteError,
  isRetryableError,
  toCopyError,
  type CopyErrorType,
} from '../src/core/errors';
import { serializeJson, validatePayload } from '../src/core/payload';
import { CopyField } from '../src/react/CopyField';
import { LiveRegion } from '../src/react/LiveRegion';
import { useMediaQuery } from '../src/react/useMediaQuery';
import { useRevealOnInteraction } from '../src/react/useRevealOnInteraction';
import { permissionDenied } from './helpers';

/** jsdom has no matchMedia: install a controllable one. */
function installMatchMedia(matches: (query: string) => boolean) {
  const listeners = new Set<() => void>();
  // Return an object whose `.matches` is a live getter so cached references
  // reflect value changes — matching real MediaQueryList semantics.
  const matchMedia = vi.fn((query: string) => ({
    get matches() { return matches(query); },
    media: query,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  }));
  vi.stubGlobal('matchMedia', matchMedia);
  return {
    listeners,
    fire: () => {
      for (const listener of listeners) listener();
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('errors', () => {
  const ALL_TYPES: CopyErrorType[] = [
    'unsupported',
    'insecure-context',
    'permission-denied',
    'not-focused',
    'invalid-payload',
    'unsupported-format',
    'blob-generation-failed',
    'max-retries-exceeded',
    'no-content',
    'too-large',
    'timeout',
    'aborted',
    'unknown',
  ];

  it('has a copy and a paste description for every error type', () => {
    for (const type of ALL_TYPES) {
      const error = createCopyError(type, 'x');
      expect(describeCopyError(error)).toMatch(/\S/);
      expect(describePasteError(error)).toMatch(/\S/);
      expect(describePasteError(error)).not.toBe(describeCopyError(error) === 'There is nothing to copy.' ? '' : undefined);
    }
    expect(describePasteError(createCopyError('no-content', 'x'))).toContain('clipboard');
  });

  it('classifies AbortError and TimeoutError, with operation-specific messages', () => {
    expect(toCopyError({ name: 'AbortError' })).toMatchObject({ type: 'aborted', message: 'The clipboard write was aborted.' });
    expect(toCopyError({ name: 'TimeoutError' }, 'read')).toMatchObject({ type: 'timeout', message: 'The clipboard read timed out.' });
    expect(toCopyError({ name: 'NotAllowedError', message: 'Document is not focused' }, 'read').message).toBe(
      'The document was not focused during the clipboard read.',
    );
    expect(toCopyError({}, 'read').message).toBe('The clipboard read failed for an unknown reason.');
  });

  it('treats timeouts as retryable and aborts / size limits as terminal', () => {
    expect(isRetryableError(createCopyError('timeout', 'x'))).toBe(true);
    expect(isRetryableError(createCopyError('aborted', 'x'))).toBe(false);
    expect(isRetryableError(createCopyError('too-large', 'x'))).toBe(false);
  });
});

describe('payload edge cases', () => {
  it('rejects multi items that are not objects', () => {
    expect(validatePayload({ kind: 'multi', items: [null] })).toMatchObject({ type: 'invalid-payload' });
  });

  it('refuses JSON that serialises to nothing', () => {
    expect(() => serializeJson({ kind: 'json', value: () => undefined })).toThrow(/serialised to nothing/);
  });
});

describe('browser clipboard adapter edge cases', () => {
  it('reports unsupported when writeText() is missing', async () => {
    const adapter = createBrowserClipboardAdapter({ getEnvironment: () => ({ navigator: { clipboard: {} } }) });
    await expect(adapter.write({ kind: 'text', value: 'x' })).rejects.toMatchObject({ copyError: { type: 'unsupported' } });
  });
});

describe('copy machine edge cases', () => {
  it('rejects an async source function with invalid-payload (T1: async sources break user-gesture window)', async () => {
    // Returning a Promise from the source function is a common mistake.
    // The machine detects the thenable and fails synchronously with a clear error
    // rather than letting a malformed payload propagate to the clipboard adapter.
    const m = createCopyMachine({ adapter: { write: () => Promise.resolve() } });
    const asyncSource = () => Promise.resolve('content') as unknown as string;
    const outcome = await m.copy(asyncSource);
    expect(outcome).toMatchObject({ status: 'error', error: { type: 'invalid-payload' } });
    if (outcome.status === 'error') expect(outcome.error.message).toContain('synchronous');
  });

  it('treats resetAfterMs: NaN as the default delay', async () => {
    vi.useFakeTimers();
    const m = createCopyMachine({ adapter: { write: () => Promise.resolve() }, resetAfterMs: NaN });
    await m.copy('x');
    vi.advanceTimersByTime(1999);
    expect(m.getSnapshot().status).toBe('copied');
    vi.advanceTimersByTime(1);
    expect(m.getSnapshot().status).toBe('idle');
  });

  it('rethrows callback errors on a timer when reportError is unavailable', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('reportError', undefined);
    const m = createCopyMachine({
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- platform-shaped error
      adapter: { write: () => Promise.reject(permissionDenied) },
      onError: () => {
        throw new Error('callback bug');
      },
    });
    await m.copy('x');
    expect(() => vi.runAllTimers()).toThrow('callback bug');
    expect(m.getSnapshot().status).toBe('error');
  });
});

describe('useMediaQuery', () => {
  it('subscribes to changes and unsubscribes on unmount', () => {
    let matches = false;
    const media = installMatchMedia(() => matches);
    const { result, unmount } = renderHook(() => useMediaQuery('(hover: none)'));
    expect(result.current).toBe(false);
    matches = true;
    act(() => {
      media.fire();
    });
    expect(result.current).toBe(true);
    unmount();
    expect(media.listeners.size).toBe(0);
  });
});

describe('LiveRegion', () => {
  it('supports assertive announcements and visible rendering', () => {
    render(<LiveRegion message="Saved" politeness="assertive" visuallyHidden={false} style={{ color: 'red' }} />);
    // We use role="status" (not "alert") for all politeness levels per WCAG 4.1.3:
    // role="alert" interrupts any currently-spoken sentence even in polite mode.
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('assertive');
    expect(region.style.position).toBe('');
    expect(region.style.color).toBe('red');
  });

  it('writes message text imperatively after mount (not as children)', async () => {
    const { rerender } = render(<LiveRegion message="" />);
    const region = screen.getByRole('status');
    // Message is written via useEffect, not via children — so it starts empty.
    expect(region.textContent).toBe('');
    rerender(<LiveRegion message="Copied" />);
    // After update the text is written to the DOM.
    expect(region.textContent).toBe('Copied');
  });
});

describe('useRevealOnInteraction', () => {
  const pointer = (pointerType: string) => ({ pointerType }) as PointerEvent<HTMLDivElement>;

  it('ignores touch hover, and reveals on touch until the user touches elsewhere', () => {
    const { result } = renderHook(() => useRevealOnInteraction<HTMLDivElement>());
    const node = document.createElement('div');
    const inside = document.createElement('span');
    node.append(inside);
    document.body.append(node);
    act(() => {
      result.current.targetProps.ref(node);
      result.current.targetProps.onPointerEnter(pointer('touch'));
    });
    expect(result.current.visible).toBe(false);

    act(() => {
      result.current.targetProps.onPointerDown(pointer('mouse'));
    });
    expect(result.current.visible).toBe(false);
    act(() => {
      result.current.targetProps.onPointerDown(pointer('touch'));
    });
    expect(result.current.reason).toBe('touch');

    fireEvent.pointerDown(inside);
    expect(result.current.reason).toBe('touch');
    fireEvent.pointerDown(document.body);
    expect(result.current.visible).toBe(false);
    act(() => {
      result.current.targetProps.onPointerLeave(pointer('touch'));
    });
    node.remove();
  });

  it('dismisses a touch reveal after the node is detached', () => {
    const { result } = renderHook(() => useRevealOnInteraction<HTMLDivElement>());
    act(() => {
      result.current.targetProps.ref(null);
      result.current.targetProps.onPointerDown(pointer('touch'));
    });
    fireEvent.pointerDown(document.body);
    expect(result.current.visible).toBe(false);
  });

  it('reveals on focus for non-element targets and engines without :focus-visible', () => {
    const { result } = renderHook(() => useRevealOnInteraction<HTMLDivElement>());
    act(() => {
      result.current.targetProps.onFocus({ target: new EventTarget() } as unknown as FocusEvent<HTMLDivElement>);
    });
    expect(result.current.reason).toBe('focus');

    const old = document.createElement('button');
    Object.defineProperty(old, 'matches', {
      value: () => {
        throw new SyntaxError("':focus-visible' is not a valid selector");
      },
    });
    act(() => {
      result.current.targetProps.onBlur({ relatedTarget: null, currentTarget: document.body } as unknown as FocusEvent<HTMLDivElement>);
    });
    expect(result.current.visible).toBe(false);
    act(() => {
      result.current.targetProps.onFocus({ target: old } as unknown as FocusEvent<HTMLDivElement>);
    });
    expect(result.current.reason).toBe('focus');
  });

  it('is always visible on devices that cannot hover', () => {
    installMatchMedia((query) => query === '(hover: none)');
    const { result } = renderHook(() => useRevealOnInteraction());
    expect(result.current.reason).toBe('no-hover-device');
  });
});

describe('CopyField options', () => {
  it('renders a descriptive label for non-text payloads (a11y A1 fix), honours display timings and announce={false}', () => {
    render(
      <CopyField.Root
        value={{ kind: 'html', html: '<b>x</b>', text: 'x' }}
        label="Rich"
        announce={false}
        pendingDelayMs={0}
        minPendingMs={0}
        data-testid="root"
      >
        <CopyField.Value data-testid="value" />
        <CopyField.Trigger />
      </CopyField.Root>,
    );
    // A1 fix: non-text payloads now render a human-readable description so
    // screen-reader users understand what will be copied ("Rich text" for HTML,
    // "Image" for image, "JSON data" for json, "Mixed content" for multi).
    expect(screen.getByTestId('value').textContent).toBe('Rich text');
    // announce={false} suppresses the live region entirely.
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('falls back to null display value for unknown payload kinds (A1 branch)', () => {
    // An unknown payload kind (not text/html/image/json/multi) has no label entry —
    // KIND_LABELS[value.kind] returns undefined, so getDisplayValue returns null.
    // The Value renders nothing (children is null).
    const unknownKindValue: Parameters<typeof CopyField.Root>[0]['value'] = { kind: 'custom', blob: new Blob() } as unknown as Parameters<typeof CopyField.Root>[0]['value'];
    render(
      <CopyField.Root
        value={unknownKindValue}
        label="Custom"
      >
        <CopyField.Value data-testid="value" />
        <CopyField.Trigger />
      </CopyField.Root>,
    );
    expect(screen.getByTestId('value').textContent).toBe('');
  });

  it('falls back to a safe aria-label when triggerLabel returns an empty string (A4 guard)', () => {
    render(
      <CopyField.Root
        value="x"
        label="Field"
        messages={{ triggerLabel: () => '' }}
      >
        <CopyField.Trigger data-testid="trigger" />
      </CopyField.Root>,
    );
    // When triggerLabel returns '', safeAriaLabel falls back to `Copy ${label}`.
    expect(screen.getByTestId('trigger').getAttribute('aria-label')).toBe('Copy Field');
  });

  it('drops label transitions for users who prefer reduced motion', () => {
    installMatchMedia((query) => query === '(prefers-reduced-motion: reduce)');
    render(
      <CopyField.Root value="x" label="X">
        <CopyField.Trigger />
      </CopyField.Root>,
    );
    const label = document.querySelector<HTMLElement>('[data-trigger-label="idle"]');
    expect(label?.style.transition).toBe('');
  });
});

describe('clipboard adapter branches', () => {
  const rich = (write = vi.fn(() => Promise.resolve())) => {
    class Item {
      constructor(readonly items: Record<string, unknown>) {}
    }
    return { write, env: { isSecureContext: true, navigator: { clipboard: { write, writeText: vi.fn(() => Promise.resolve()) } }, ClipboardItem: Item } };
  };

  it('uses window by default', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await createBrowserClipboardAdapter().write({ kind: 'text', value: 'hi' });
    expect(writeText).toHaveBeenCalledWith('hi');
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('rejects image sources that resolve to non-Blobs or untyped Blobs', async () => {
    const { env } = rich();
    const adapter = createBrowserClipboardAdapter({ getEnvironment: () => env });
    await expect(adapter.write({ kind: 'image', blob: () => 'nope' as unknown as Blob })).rejects.toMatchObject({
      copyError: { type: 'blob-generation-failed' },
    });
    await expect(adapter.write({ kind: 'image', blob: new Blob(['x']) })).rejects.toMatchObject({
      copyError: { type: 'unsupported-format', message: expect.stringContaining('"unknown"') },
    });
  });

  it('surfaces the browser error when the image itself was fine', async () => {
    const browserError = { name: 'NotAllowedError', message: 'denied' };
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- platform-shaped error
    const { env } = rich(vi.fn(() => Promise.reject(browserError)));
    const adapter = createBrowserClipboardAdapter({ getEnvironment: () => env });
    await expect(adapter.write({ kind: 'image', blob: new Blob(['x'], { type: 'image/png' }) })).rejects.toBe(browserError);
  });

  it('writes Blob items in multi payloads and requires ClipboardItem for them', async () => {
    const { env, write } = rich();
    const blob = new Blob(['x'], { type: 'image/png' });
    await createBrowserClipboardAdapter({ getEnvironment: () => env }).write({
      kind: 'multi',
      items: [{ mimeType: 'image/png', data: blob }],
    });
    expect(write).toHaveBeenCalledOnce();

    const noItem = createBrowserClipboardAdapter({ getEnvironment: () => ({ navigator: { clipboard: { writeText: vi.fn() } } }) });
    await expect(noItem.write({ kind: 'multi', items: [{ mimeType: 'text/plain', data: 'x' }] })).rejects.toMatchObject({
      copyError: { type: 'unsupported-format' },
    });
  });
});

describe('copy machine branches', () => {
  it('uses the browser adapter by default', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    expect(await createCopyMachine().copy('x')).toMatchObject({ status: 'copied' });
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('allows unlimited retries with maxRetries: Infinity', async () => {
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- platform-shaped error
    const m = createCopyMachine({ adapter: { write: () => Promise.reject(permissionDenied) }, maxRetries: Infinity });
    await m.copy('x');
    for (let attempt = 0; attempt < 10; attempt++) await m.retry();
    expect(m.getSnapshot()).toMatchObject({ status: 'error', retryCount: 10, error: { type: 'permission-denied' } });
  });

  it('honours a numeric resetAfterMs', async () => {
    vi.useFakeTimers();
    const m = createCopyMachine({ adapter: { write: () => Promise.resolve() }, resetAfterMs: 500 });
    await m.copy('x');
    vi.advanceTimersByTime(500);
    expect(m.getSnapshot().status).toBe('idle');
  });

  it('does not notify for no-op transitions and drops stale failures', async () => {
    let fail!: (reason: unknown) => void;
    const m = createCopyMachine({
      adapter: {
        write: () =>
          new Promise<void>((_resolve, reject) => {
            fail = reject;
          }),
      },
    });
    const listener = vi.fn();
    m.subscribe(listener);
    m.reset();
    expect(listener).not.toHaveBeenCalled();

    const outcome = m.copy('x');
    m.reset();
    fail(permissionDenied);
    expect(await outcome).toMatchObject({ status: 'error' });
    expect(m.getSnapshot().status).toBe('idle');
  });

  it('a custom coordinator releasing a member that is no longer copied is a no-op', async () => {
    let member: { release: () => void } | undefined;
    const m = createCopyMachine({
      adapter: { write: () => Promise.resolve() },
      coordinator: {
        activate: (joined) => {
          member = joined;
        },
        deactivate: vi.fn(),
        getActive: () => member ?? null,
      },
    });
    await m.copy('x');
    const retry = m.copy('y'); // copying: not copied any more
    member?.release();
    expect(m.getSnapshot().status).toBe('copying');
    await retry;
    expect(m.getSnapshot().status).toBe('copied');
  });
});

describe('remaining UI branches', () => {
  it('pretty-prints JSON with pretty: true', () => {
    expect(serializeJson({ kind: 'json', value: { a: 1 }, pretty: true })).toBe('{\n  "a": 1\n}');
    expect(serializeJson({ kind: 'json', value: { a: 1 }, pretty: 4 })).toBe('{\n    "a": 1\n}');
  });

  it('shows the text of a text payload object', () => {
    render(
      <CopyField.Root value={{ kind: 'text', value: 'PLT-29018' }} label="ID">
        <CopyField.Value data-testid="value" />
      </CopyField.Root>,
    );
    expect(screen.getByTestId('value').textContent).toBe('PLT-29018');
  });

  it('keeps a focus reveal while focus moves inside the container', () => {
    const { result } = renderHook(() => useRevealOnInteraction<HTMLDivElement>());
    const container = document.createElement('div');
    const child = document.createElement('button');
    container.append(child);
    act(() => {
      result.current.targetProps.onFocus({ target: new EventTarget() } as unknown as FocusEvent<HTMLDivElement>);
    });
    act(() => {
      result.current.targetProps.onBlur({ relatedTarget: child, currentTarget: container } as unknown as FocusEvent<HTMLDivElement>);
    });
    expect(result.current.reason).toBe('focus');
  });
});

describe('regression: React 18 + useSyncExternalStore', () => {
  it('a fast CopyField copy auto-resets to idle (was stuck on "Copied" in React 18)', async () => {
    vi.useFakeTimers();
    render(
      <CopyField.Root value="x" label="X" copyOptions={{ adapter: { write: () => Promise.resolve() } }} data-testid="root">
        <CopyField.Trigger>go</CopyField.Trigger>
      </CopyField.Root>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('go'));
      await Promise.resolve();
    });
    expect(screen.getByTestId('root').getAttribute('data-state')).toBe('copied');
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByTestId('root').getAttribute('data-state')).toBe('idle');
    expect(screen.getByTestId('root').getAttribute('data-display-state')).toBe('idle');
  });
});
