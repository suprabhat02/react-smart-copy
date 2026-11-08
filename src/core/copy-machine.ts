import { createBrowserClipboardAdapter, type ClipboardAdapter } from './clipboard-adapter';
import type { CopyCoordinator, CopyCoordinatorMember } from './copy-coordinator';
import { copyFailure, createCopyError, CopyFailure, isRetryableError, toCopyError, type CopyError } from './errors';
import { createOperations, invoke, resolveMaxRetries } from './machine-shared';
import {
  normalizePayload,
  serializeJson,
  validatePayload,
  type AsyncCopyInput,
  type CopyInput,
  type CopyPayload,
  type CopySource,
} from './payload';
import { sourceError } from './source-error';

export { DEFAULT_MAX_RETRIES, resolveMaxRetries } from './machine-shared';

export const DEFAULT_RESET_AFTER_MS = 2000;

const noop = (): void => undefined;

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof value === 'object' && value !== null && typeof (value as { then?: unknown }).then === 'function';
}

export interface IdleState {
  readonly status: 'idle';
}
export interface CopyingState {
  readonly status: 'copying';
  /** `null` while an async source is still producing its text. */
  readonly payload: CopyPayload | null;
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

/**
 * Why an in-flight copy was cancelled: `reset` (`reset()` was called) or
 * `disconnect` (its host disconnected, e.g. the React component unmounted).
 */
export type CopyCancelReason = 'reset' | 'disconnect';

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
  /**
   * `reset()` moved the machine back to `idle` from any other state. Not
   * called for the automatic return after `resetAfterMs`, for a `<CopyGroup>`
   * handing "Copied" to another member, or when already `idle`.
   */
  readonly onReset?: () => void;
  /**
   * A copy in flight was cancelled before it settled: its `signal` aborted
   * and its result will not reach state or `onCopy` / `onError`. Fires
   * before `onReset` when `reset()` cancels a copy.
   */
  readonly onCancel?: (reason: CopyCancelReason) => void;
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
    // Started before the source runs, so an async source gets the copy's abort signal.
    const context = operations.start();
    const fail = (error: CopyError, payload: CopyPayload | null): Promise<CopyOutcome> => {
      operations.end(context);
      settleError(error, payload, retryCount);
      return Promise.resolve({ status: 'error', error });
    };

    let resolved: CopyInput | PromiseLike<AsyncCopyInput>;
    try {
      resolved = typeof source === 'function' ? source(context) : source;
    } catch (cause) {
      return fail(sourceError(cause, 'The copy source function threw.'), null);
    }

    const adapter = read().adapter ?? getDefaultAdapter();
    // Known now for a value, once it arrives for an async source.
    let payload: CopyPayload | null = null;
    // The adapter is called synchronously: no await may precede it, or the
    // browser loses the transient user activation and rejects the write.
    let pending: Promise<void>;
    if (isThenable(resolved)) {
      // Text still being made (a share link from the server). The write starts now with a
      // promise of it, so the gesture is kept; the text is checked like any payload on arrival.
      const arrived = Promise.resolve(resolved).then(
        (input): string => {
          if (context.signal.aborted) throw copyFailure('aborted', 'Copying was cancelled.');
          const made = normalizePayload(input);
          if (made.kind !== 'text' && made.kind !== 'json') {
            throw copyFailure('invalid-payload', 'An async copy source must resolve to text or JSON.');
          }
          const invalid = validatePayload(made);
          if (invalid) throw new CopyFailure(invalid);
          payload = made;
          return made.kind === 'text' ? made.value : serializeJson(made);
        },
        (cause: unknown): never => {
          throw new CopyFailure(sourceError(cause, 'The copy source rejected.'));
        },
      );
      setState({ status: 'copying', payload: null, retryCount });
      try {
        const written = adapter.writeDeferred ? adapter.writeDeferred(arrived, context) : arrived.then(() => adapter.write(payload as CopyPayload, context));
        // Copied only once the text has arrived, whatever the adapter resolves first.
        pending = written.then(() => arrived).then(noop);
      } catch (cause) {
        arrived.catch(noop);
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- classified by toCopyError()
        pending = Promise.reject(cause);
      }
    } else {
      payload = normalizePayload(resolved);
      const invalid = validatePayload(payload);
      if (invalid) return fail(invalid, payload);
      setState({ status: 'copying', payload, retryCount });
      try {
        pending = adapter.write(payload, context);
      } catch (cause) {
        // Keep the raw reason: toCopyError() classifies it (DOMException names, CopyFailure brand).
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- classified by toCopyError()
        pending = Promise.reject(cause);
      }
    }

    return pending.then(
      (): CopyOutcome => {
        operations.end(context);
        const done = payload as CopyPayload; // Set by now: an async source's text has arrived.
        if (current === generation) {
          const copied: CopiedState = { status: 'copied', payload: done, at: now() };
          setState(copied);
          joinCoordinator();
          scheduleReset(copied);
          invoke(read().onCopy, done);
        }
        return { status: 'copied', payload: done };
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
    const cancelled = operations.abort();
    clearResetTimer();
    const wasIdle = state.status === 'idle';
    setState(IDLE_STATE);
    if (cancelled) invoke(read().onCancel, 'reset');
    if (!wasIdle) invoke(read().onReset);
  };

  const connect = (): (() => void) => {
    if (state.status === 'copied') scheduleReset(state);
    return () => {
      ++generation;
      const cancelled = operations.abort();
      clearResetTimer();
      if (state.status === 'copying') setState(IDLE_STATE);
      if (cancelled) invoke(read().onCancel, 'disconnect');
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
