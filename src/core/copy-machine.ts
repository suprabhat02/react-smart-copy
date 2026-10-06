import { createBrowserClipboardAdapter, type ClipboardAdapter } from './clipboard-adapter';
import type { CopyCoordinator, CopyCoordinatorMember } from './copy-coordinator';
import { createCopyError, isRetryableError, toCopyError, type CopyError } from './errors';
import { createOperations, invoke, resolveMaxRetries } from './machine-shared';
import { normalizePayload, validatePayload, type CopyPayload, type CopySource } from './payload';

export { DEFAULT_MAX_RETRIES, resolveMaxRetries } from './machine-shared';

export const DEFAULT_RESET_AFTER_MS = 2000;

export interface IdleState {
  readonly status: 'idle';
}
export interface CopyingState {
  readonly status: 'copying';
  readonly payload: CopyPayload;
  readonly retryCount: number;
}
export interface CopiedState {
  readonly status: 'copied';
  readonly payload: CopyPayload;
  /** Epoch ms when the write resolved. */
  readonly at: number;
}
export interface ErrorState {
  readonly status: 'error';
  /** `null` when the input itself could not be resolved. */
  readonly payload: CopyPayload | null;
  readonly error: CopyError;
  readonly retryCount: number;
}

export type CopyState = IdleState | CopyingState | CopiedState | ErrorState;
export type CopyStatus = CopyState['status'];

/**
 * `cancelled`: the copy was reset or its host unmounted before it finished,
 * so its work was aborted. Nothing to report to the user.
 */
export type CopyIgnoredReason = 'in-flight' | 'nothing-to-retry' | 'not-retryable' | 'cancelled';

/** What `copy()`/`retry()` resolve to. They never reject. */
export type CopyOutcome =
  | { readonly status: 'copied'; readonly payload: CopyPayload }
  | { readonly status: 'error'; readonly error: CopyError }
  | { readonly status: 'ignored'; readonly reason: CopyIgnoredReason };

export interface CopyMachineOptions {
  /** Defaults to the browser Clipboard API adapter. */
  readonly adapter?: ClipboardAdapter;
  /** Time in `copied` before returning to `idle`. `false`/`Infinity` disables. Default 2000. */
  readonly resetAfterMs?: number | false;
  /**
   * Max `retry()` calls after the first failure. Default 3. `0` disables
   * retry; `Infinity` allows unlimited retries.
   */
  readonly maxRetries?: number;
  /**
   * Share "Copied" with other machines: only one member of a coordinator
   * shows `copied` at a time. `null` explicitly opts out (e.g. of a React `<CopyGroup>`).
   */
  readonly coordinator?: CopyCoordinator | null;
  readonly onCopy?: (payload: CopyPayload) => void;
  readonly onError?: (error: CopyError, payload: CopyPayload | null) => void;
  /** Clock injection for tests and deterministic environments. */
  readonly now?: () => number;
}

/** Options object, or a getter so hosts (like React) can supply the latest options. */
export type CopyMachineOptionsSource = CopyMachineOptions | (() => CopyMachineOptions);

export interface CopyMachine {
  readonly getSnapshot: () => CopyState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly copy: (source: CopySource) => Promise<CopyOutcome>;
  readonly retry: () => Promise<CopyOutcome>;
  /** Back to `idle`. Discards any in-flight result and aborts its `signal`. */
  readonly reset: () => void;
  /**
   * Lifecycle hook for hosts. Re-arms a pending auto-reset; the returned
   * cleanup clears timers, drops in-flight results, aborts in-flight work and
   * unsticks `copying`.
   * Safe to call repeatedly (React StrictMode).
   */
  readonly connect: () => () => void;
}

export const IDLE_STATE: IdleState = /* @__PURE__ */ Object.freeze({ status: 'idle' });

const IGNORED_IN_FLIGHT: CopyOutcome = /* @__PURE__ */ Object.freeze({ status: 'ignored', reason: 'in-flight' });
const IGNORED_NOTHING: CopyOutcome = /* @__PURE__ */ Object.freeze({ status: 'ignored', reason: 'nothing-to-retry' });
const IGNORED_NOT_RETRYABLE: CopyOutcome = /* @__PURE__ */ Object.freeze({ status: 'ignored', reason: 'not-retryable' });
const IGNORED_CANCELLED: CopyOutcome = /* @__PURE__ */ Object.freeze({ status: 'ignored', reason: 'cancelled' });

function resolveResetDelay(value: number | false | undefined): number | null {
  if (value === false || value === Infinity) return null;
  if (value === undefined || Number.isNaN(value)) return DEFAULT_RESET_AFTER_MS;
  return Math.max(0, value);
}

/** Pure helper: can `retry()` do anything from this state? */
export function canRetryState(state: CopyState, maxRetries?: number): boolean {
  return (
    state.status === 'error' &&
    state.payload !== null &&
    isRetryableError(state.error) &&
    state.retryCount < resolveMaxRetries(maxRetries)
  );
}

let defaultAdapter: ClipboardAdapter | undefined;
const getDefaultAdapter = (): ClipboardAdapter => (defaultAdapter ??= createBrowserClipboardAdapter());

/** Framework-agnostic copy state machine. */
export function createCopyMachine(options: CopyMachineOptionsSource = {}): CopyMachine {
  const read = typeof options === 'function' ? options : (): CopyMachineOptions => options;
  const listeners = new Set<() => void>();
  let state: CopyState = IDLE_STATE;
  let generation = 0;
  let resetTimer: ReturnType<typeof setTimeout> | undefined;
  const operations = createOperations();

  const now = (): number => (read().now ?? Date.now)();

  // The coordinator that saw this machine's last `copied`, so leaving it is reported to the same one.
  let joined: CopyCoordinator | null = null;

  const member: CopyCoordinatorMember = {
    release: () => {
      if (state.status === 'copied') {
        clearResetTimer();
        setState(IDLE_STATE);
      }
    },
  };

  const setState = (next: CopyState): void => {
    if (next === state) return;
    const previous = state;
    state = next;
    if (previous.status === 'copied' && next.status !== 'copied' && joined) {
      joined.deactivate(member);
      joined = null;
    }
    for (const listener of Array.from(listeners)) listener();
  };

  const joinCoordinator = (): void => {
    joined = read().coordinator ?? null;
    joined?.activate(member);
  };

  const clearResetTimer = (): void => {
    if (resetTimer !== undefined) {
      clearTimeout(resetTimer);
      resetTimer = undefined;
    }
  };

  const scheduleReset = (copied: CopiedState): void => {
    clearResetTimer();
    const delay = resolveResetDelay(read().resetAfterMs);
    if (delay === null) return;
    const remaining = Math.max(0, delay - (now() - copied.at));
    // Invariant: every transition out of `copied` clears this timer, so it only ever fires while still in `copied`.
    resetTimer = setTimeout(() => {
      resetTimer = undefined;
      setState(IDLE_STATE);
    }, remaining);
  };

  const settleError = (error: CopyError, payload: CopyPayload | null, retryCount: number): void => {
    setState({ status: 'error', payload, error, retryCount });
    invoke(read().onError, error, payload);
  };

  const run = (source: CopySource, retryCount: number): Promise<CopyOutcome> => {
    clearResetTimer();
    const current = ++generation;

    let payload: CopyPayload;
    try {
      const resolved = typeof source === 'function' ? source() : source;
      // T1: the source function must be synchronous — async sources break the
      // browser's transient user-activation window. Detect and reject a Promise
      // return rather than letting it propagate as a malformed payload (a
      // thenable is not a valid CopyInput, so validatePayload would catch it,
      // but a clear error message is more useful).
      // Cast to `unknown` first so the thenable check compiles without the
      // "no overlap" lint error (the TS type already narrows `resolved` to
      // `CopyInput`, which excludes thenables, but JS callers can still pass one).
      const resolvedUnknown: unknown = resolved;
      if (
        resolvedUnknown !== null &&
        typeof resolvedUnknown === 'object' &&
        typeof (resolvedUnknown as { then?: unknown }).then === 'function'
      ) {
        const error = createCopyError(
          'invalid-payload',
          'The copy source function must be synchronous. ' +
            'Returning a Promise breaks the user-gesture window required for clipboard writes. ' +
            'Generate your content before calling copy().',
        );
        settleError(error, null, retryCount);
        return Promise.resolve({ status: 'error', error });
      }
      payload = normalizePayload(resolved);
    } catch (cause) {
      const error = createCopyError('invalid-payload', 'The copy source function threw.', cause);
      settleError(error, null, retryCount);
      return Promise.resolve({ status: 'error', error });
    }

    const invalid = validatePayload(payload);
    if (invalid) {
      settleError(invalid, payload, retryCount);
      return Promise.resolve({ status: 'error', error: invalid });
    }

    setState({ status: 'copying', payload, retryCount });
    const context = operations.start();

    // The adapter is called synchronously: no await may precede it, or the
    // browser loses the transient user activation and rejects the write.
    let pending: Promise<void>;
    try {
      pending = (read().adapter ?? getDefaultAdapter()).write(payload, context);
    } catch (cause) {
      // Keep the raw reason: toCopyError() classifies it (DOMException names, CopyFailure brand).
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      pending = Promise.reject(cause);
    }

    return pending.then(
      (): CopyOutcome => {
        operations.end(context);
        if (current === generation) {
          const copied: CopiedState = { status: 'copied', payload, at: now() };
          setState(copied);
          joinCoordinator();
          scheduleReset(copied);
          invoke(read().onCopy, payload);
        }
        return { status: 'copied', payload };
      },
      (cause: unknown): CopyOutcome => {
        operations.end(context);
        // Work we aborted ourselves (reset, unmount) is not a failure to report.
        // Invariant: superseding an in-flight copy always aborts it, so past
        // this line the copy is still the current one.
        if (context.signal.aborted) return IGNORED_CANCELLED;
        const error = toCopyError(cause);
        settleError(error, payload, retryCount);
        return { status: 'error', error };
      },
    );
  };

  const copy = (source: CopySource): Promise<CopyOutcome> =>
    state.status === 'copying' ? Promise.resolve(IGNORED_IN_FLIGHT) : run(source, 0);

  const retry = (): Promise<CopyOutcome> => {
    if (state.status !== 'error') return Promise.resolve(IGNORED_NOTHING);
    if (state.payload === null || !isRetryableError(state.error)) return Promise.resolve(IGNORED_NOT_RETRYABLE);

    if (state.retryCount >= resolveMaxRetries(read().maxRetries)) {
      const error = createCopyError(
        'max-retries-exceeded',
        `Copy failed after ${String(state.retryCount)} retries.`,
        state.error,
      );
      settleError(error, state.payload, state.retryCount);
      return Promise.resolve({ status: 'error', error });
    }
    return run(state.payload, state.retryCount + 1);
  };

  const reset = (): void => {
    ++generation;
    operations.abort();
    clearResetTimer();
    setState(IDLE_STATE);
  };

  const connect = (): (() => void) => {
    if (state.status === 'copied') scheduleReset(state);
    return () => {
      ++generation;
      operations.abort();
      clearResetTimer();
      if (state.status === 'copying') setState(IDLE_STATE);
    };
  };

  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    copy,
    retry,
    reset,
    connect,
  };
}
