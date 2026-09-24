import { createBrowserClipboardAdapter, type ClipboardAdapter } from './clipboard-adapter';
import { createCopyError, isRetryableError, toCopyError, type CopyError } from './errors';
import { normalizePayload, validatePayload, type CopyPayload, type CopySource } from './payload';

export const DEFAULT_RESET_AFTER_MS = 2000;
export const DEFAULT_MAX_RETRIES = 3;

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

export type CopyIgnoredReason = 'in-flight' | 'nothing-to-retry' | 'not-retryable';

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
  /** Max `retry()` calls after the first failure. Default 3. */
  readonly maxRetries?: number;
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
  readonly reset: () => void;
  /**
   * Lifecycle hook for hosts. Re-arms a pending auto-reset; the returned
   * cleanup clears timers, drops in-flight results and unsticks `copying`.
   * Safe to call repeatedly (React StrictMode).
   */
  readonly connect: () => () => void;
}

export const IDLE_STATE: IdleState = /* @__PURE__ */ Object.freeze({ status: 'idle' });

const IGNORED_IN_FLIGHT: CopyOutcome = /* @__PURE__ */ Object.freeze({ status: 'ignored', reason: 'in-flight' });
const IGNORED_NOTHING: CopyOutcome = /* @__PURE__ */ Object.freeze({ status: 'ignored', reason: 'nothing-to-retry' });
const IGNORED_NOT_RETRYABLE: CopyOutcome = /* @__PURE__ */ Object.freeze({ status: 'ignored', reason: 'not-retryable' });

export function resolveMaxRetries(value: number | undefined): number {
  if (value === Infinity) return Infinity;
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_MAX_RETRIES;
  return Math.max(0, Math.floor(value));
}

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

function reportCallbackError(error: unknown): void {
  const scope = globalThis as { reportError?: (error: unknown) => void };
  if (typeof scope.reportError === 'function') {
    scope.reportError(error);
  } else {
    setTimeout(() => {
      throw error;
    }, 0);
  }
}

/** User callbacks must never corrupt machine state; their errors are reported, not swallowed. */
function invoke<Args extends unknown[]>(fn: ((...args: Args) => void) | undefined, ...args: Args): void {
  if (!fn) return;
  try {
    fn(...args);
  } catch (error) {
    reportCallbackError(error);
  }
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

  const now = (): number => (read().now ?? Date.now)();

  const setState = (next: CopyState): void => {
    if (next === state) return;
    state = next;
    for (const listener of Array.from(listeners)) listener();
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
    resetTimer = setTimeout(() => {
      resetTimer = undefined;
      if (state === copied) setState(IDLE_STATE);
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
      payload = normalizePayload(typeof source === 'function' ? source() : source);
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

    // The adapter is called synchronously: no await may precede it, or the
    // browser loses the transient user activation and rejects the write.
    let pending: Promise<void>;
    try {
      pending = (read().adapter ?? getDefaultAdapter()).write(payload);
    } catch (cause) {
      // Keep the raw reason: toCopyError() classifies it (DOMException names, CopyFailure brand).
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      pending = Promise.reject(cause);
    }

    return pending.then(
      (): CopyOutcome => {
        if (current === generation) {
          const copied: CopiedState = { status: 'copied', payload, at: now() };
          setState(copied);
          scheduleReset(copied);
          invoke(read().onCopy, payload);
        }
        return { status: 'copied', payload };
      },
      (cause: unknown): CopyOutcome => {
        const error = toCopyError(cause);
        if (current === generation) settleError(error, payload, retryCount);
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
    clearResetTimer();
    setState(IDLE_STATE);
  };

  const connect = (): (() => void) => {
    if (state.status === 'copied') scheduleReset(state);
    return () => {
      ++generation;
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
