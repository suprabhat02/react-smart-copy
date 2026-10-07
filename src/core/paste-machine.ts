import { createCopyError, isRetryableError, toCopyError, type CopyError } from './errors';
import { createOperations, invoke, resolveMaxRetries, type OperationContext } from './machine-shared';
import { createBrowserPasteAdapter, type PasteAdapter } from './paste-adapter';
import {
  completePasteResult,
  enforcePasteLimits,
  finalizePaste,
  resolvePasteReadOptions,
  snapshotDataTransfer,
  type DataTransferLike,
  type PasteReadOptions,
  type PasteReadResult,
  type PasteResult,
  type PasteSource,
} from './paste-reader';

/* ------------------------------------------------------------------ State */

export interface PasteIdleState {
  readonly status: 'idle';
}
export interface PasteReadingState {
  readonly status: 'reading';
}
export interface PasteReadState {
  readonly status: 'read';
  readonly result: PasteResult;
  /** Epoch ms when the read resolved. */
  readonly at: number;
}
export interface PasteErrorState {
  readonly status: 'error';
  readonly error: CopyError;
  /** Where the failed read came from. Only `'clipboard'` reads can be retried. */
  readonly source: PasteSource;
  /** `retry()` calls made since the last fresh `paste()`. */
  readonly retryCount: number;
}

export type PasteState = PasteIdleState | PasteReadingState | PasteReadState | PasteErrorState;
export type PasteStatus = PasteState['status'];

/**
 * `cancelled`: the read was superseded, reset, or its host unmounted before it
 * finished, so its work was aborted. Nothing to report to the user.
 */
export type PasteIgnoredReason = 'in-flight' | 'no-accepted-content' | 'nothing-to-retry' | 'not-retryable' | 'cancelled';

/**
 * Why an in-flight read was cancelled: `reset` (`reset()` was called),
 * `disconnect` (its host disconnected, e.g. the React component unmounted) or
 * `superseded` (a paste event arrived while a clipboard read was pending).
 */
export type PasteCancelReason = 'reset' | 'disconnect' | 'superseded';

/** What `paste()` / `pasteEvent()` / `retry()` resolve to. They never reject. */
export type PasteOutcome =
  | { readonly status: 'read'; readonly result: PasteResult }
  | { readonly status: 'error'; readonly error: CopyError }
  | { readonly status: 'ignored'; readonly reason: PasteIgnoredReason };

/** Structural view of a DOM / React `paste` event. */
export interface PasteEventLike {
  readonly clipboardData: DataTransferLike | null | undefined;
  preventDefault(): void;
}

/* ---------------------------------------------------------------- Options */

export interface PasteMachineOptions extends PasteReadOptions {
  /** Defaults to the browser Clipboard API adapter. */
  readonly adapter?: PasteAdapter;
  /** Return from `read` to `idle` after this many ms. `false` / `Infinity` / omitted = keep the result. */
  readonly resetAfterMs?: number | false;
  /**
   * Paste events only: call `event.preventDefault()` when the event carried
   * accepted content, so the browser doesn't also insert it. Default `true`.
   */
  readonly preventDefault?: boolean;
  /**
   * Max `retry()` calls after a failed clipboard read. Default 3. `0`
   * disables retry; `Infinity` allows unlimited retries.
   */
  readonly maxRetries?: number;
  readonly onPaste?: (result: PasteResult) => void;
  readonly onError?: (error: CopyError) => void;
  /**
   * `reset()` moved the machine back to `idle` from any other state. Not
   * called for the automatic return after `resetAfterMs`, or when already `idle`.
   */
  readonly onReset?: () => void;
  /**
   * A read in flight was cancelled before it settled: its `signal` aborted
   * and its result will not reach state or `onPaste` / `onError`. Fires
   * before `onReset` when `reset()` cancels a read.
   */
  readonly onCancel?: (reason: PasteCancelReason) => void;
  /** Clock injection for tests and deterministic environments. */
  readonly now?: () => number;
}

/** Options object, or a getter so hosts (like React) can supply the latest options. */
export type PasteMachineOptionsSource = PasteMachineOptions | (() => PasteMachineOptions);

export interface PasteMachine {
  readonly getSnapshot: () => PasteState;
  readonly subscribe: (listener: () => void) => () => void;
  /**
   * Reads the system clipboard via the adapter. Call it from a user gesture
   * (click, keypress). May show a permission prompt. Ignored while `reading`.
   */
  readonly paste: () => Promise<PasteOutcome>;
  /**
   * Handles a `paste` event (Ctrl/⌘+V). No permission prompt: the data is
   * already in the event. Supersedes any read in flight. Events without
   * accepted content are ignored and left untouched for the browser.
   */
  readonly pasteEvent: (event: PasteEventLike) => Promise<PasteOutcome>;
  /**
   * Re-reads the clipboard after a retryable failure (e.g. permission denied,
   * page not focused), up to `maxRetries`. Call it from a user gesture.
   * Paste-event failures can't be retried: their data is gone after dispatch.
   */
  readonly retry: () => Promise<PasteOutcome>;
  /** Back to `idle`. Discards any in-flight result and aborts its `signal`. */
  readonly reset: () => void;
  /**
   * Lifecycle hook for hosts. Re-arms a pending auto-reset; the returned
   * cleanup clears timers, drops in-flight results, aborts in-flight work and
   * unsticks `reading`.
   * Safe to call repeatedly (React StrictMode).
   */
  readonly connect: () => () => void;
}

export const PASTE_IDLE_STATE: PasteIdleState = /* @__PURE__ */ Object.freeze({ status: 'idle' });
const PASTE_READING_STATE: PasteReadingState = /* @__PURE__ */ Object.freeze({ status: 'reading' });
const IGNORED_IN_FLIGHT: PasteOutcome = /* @__PURE__ */ Object.freeze({ status: 'ignored', reason: 'in-flight' });
const IGNORED_NO_CONTENT: PasteOutcome = /* @__PURE__ */ Object.freeze({
  status: 'ignored',
  reason: 'no-accepted-content',
});
const IGNORED_NOTHING: PasteOutcome = /* @__PURE__ */ Object.freeze({ status: 'ignored', reason: 'nothing-to-retry' });
const IGNORED_NOT_RETRYABLE: PasteOutcome = /* @__PURE__ */ Object.freeze({ status: 'ignored', reason: 'not-retryable' });
const IGNORED_CANCELLED: PasteOutcome = /* @__PURE__ */ Object.freeze({ status: 'ignored', reason: 'cancelled' });

function resolveResetDelay(value: number | false | undefined): number | null {
  if (value === undefined || value === false || value === Infinity || Number.isNaN(value)) return null;
  return Math.max(0, value);
}

/** Pure helper: can `retry()` do anything from this state? */
export function canRetryPasteState(state: PasteState, maxRetries?: number): boolean {
  return (
    state.status === 'error' &&
    state.source === 'clipboard' &&
    isRetryableError(state.error) &&
    state.retryCount < resolveMaxRetries(maxRetries)
  );
}

let defaultAdapter: PasteAdapter | undefined;
const getDefaultAdapter = (): PasteAdapter => (defaultAdapter ??= createBrowserPasteAdapter());

/** Framework-agnostic paste state machine. */
export function createPasteMachine(options: PasteMachineOptionsSource = {}): PasteMachine {
  const read = typeof options === 'function' ? options : (): PasteMachineOptions => options;
  const listeners = new Set<() => void>();
  let state: PasteState = PASTE_IDLE_STATE;
  let generation = 0;
  let resetTimer: ReturnType<typeof setTimeout> | undefined;
  const operations = createOperations();

  const now = (): number => (read().now ?? Date.now)();

  const setState = (next: PasteState): void => {
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

  const scheduleReset = (readState: PasteReadState): void => {
    clearResetTimer();
    const delay = resolveResetDelay(read().resetAfterMs);
    if (delay === null) return;
    const remaining = Math.max(0, delay - (now() - readState.at));
    // Invariant: every transition out of `read` clears this timer, so it only ever fires while still in `readState`.
    resetTimer = setTimeout(() => {
      resetTimer = undefined;
      setState(PASTE_IDLE_STATE);
    }, remaining);
  };

  const settleError = (error: CopyError, source: PasteSource, retryCount: number): void => {
    setState({ status: 'error', error, source, retryCount });
    invoke(read().onError, error);
  };

  /** Runs one read. `produce` is invoked synchronously so the user gesture is preserved. */
  const run = (
    produce: (context: OperationContext) => Promise<PasteReadResult>,
    source: PasteSource,
    retryCount: number,
  ): Promise<PasteOutcome> => {
    clearResetTimer();
    const current = ++generation;
    const superseded = operations.abort();
    const context = operations.start();
    setState(PASTE_READING_STATE);
    if (superseded) invoke(read().onCancel, 'superseded');

    let pending: Promise<PasteReadResult>;
    try {
      pending = produce(context);
    } catch (cause) {
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- classified below
      pending = Promise.reject(cause);
    }

    return pending.then(
      (raw): PasteOutcome => {
        operations.end(context);
        const result = completePasteResult(raw);
        if (current === generation) {
          const readState: PasteReadState = { status: 'read', result, at: now() };
          setState(readState);
          scheduleReset(readState);
          invoke(read().onPaste, result);
        }
        return { status: 'read', result };
      },
      (cause: unknown): PasteOutcome => {
        operations.end(context);
        // Work we aborted ourselves (superseded, reset, unmount) is not a failure to report.
        // Invariant: superseding an in-flight read always aborts it, so past
        // this line the read is still the current one.
        if (context.signal.aborted) return IGNORED_CANCELLED;
        const error = toCopyError(cause, 'read');
        settleError(error, source, retryCount);
        return { status: 'error', error };
      },
    );
  };

  const readClipboard = (retryCount: number): Promise<PasteOutcome> =>
    run(
      (context) => (read().adapter ?? getDefaultAdapter()).read(resolvePasteReadOptions(read()), context),
      'clipboard',
      retryCount,
    );

  const paste = (): Promise<PasteOutcome> =>
    state.status === 'reading' ? Promise.resolve(IGNORED_IN_FLIGHT) : readClipboard(0);

  const retry = (): Promise<PasteOutcome> => {
    if (state.status !== 'error') return Promise.resolve(IGNORED_NOTHING);
    if (state.source !== 'clipboard' || !isRetryableError(state.error)) return Promise.resolve(IGNORED_NOT_RETRYABLE);
    if (state.retryCount >= resolveMaxRetries(read().maxRetries)) {
      const error = createCopyError(
        'max-retries-exceeded',
        `Paste failed after ${String(state.retryCount)} retries.`,
        state.error,
      );
      settleError(error, 'clipboard', state.retryCount);
      return Promise.resolve({ status: 'error', error });
    }
    return readClipboard(state.retryCount + 1);
  };

  const pasteEvent = (event: PasteEventLike): Promise<PasteOutcome> => {
    const data = event.clipboardData;
    if (!data) return Promise.resolve(IGNORED_NO_CONTENT);

    const current = read();
    let resolved: ReturnType<typeof resolvePasteReadOptions>;
    try {
      resolved = resolvePasteReadOptions(current);
    } catch (cause) {
      // Transition straight to `error` without a ghost `reading` frame.
      // `run()` would momentarily set state to `reading` before resolving the
      // error, which observers would see as a spurious state transition.
      const error = toCopyError(cause, 'read');
      ++generation;
      const superseded = operations.abort();
      clearResetTimer();
      settleError(error, 'event', 0);
      if (superseded) invoke(current.onCancel, 'superseded');
      return Promise.resolve({ status: 'error', error });
    }

    // DataTransfer is only readable during dispatch: snapshot before anything async.
    const entries = snapshotDataTransfer(data, resolved);
    if (entries.length === 0) return Promise.resolve(IGNORED_NO_CONTENT);
    if (current.preventDefault !== false) event.preventDefault();

    return run(
      () => {
        enforcePasteLimits(entries, resolved);
        return finalizePaste(entries, 'event', resolved);
      },
      'event',
      0,
    );
  };

  const reset = (): void => {
    ++generation;
    const cancelled = operations.abort();
    clearResetTimer();
    const wasIdle = state.status === 'idle';
    setState(PASTE_IDLE_STATE);
    if (cancelled) invoke(read().onCancel, 'reset');
    if (!wasIdle) invoke(read().onReset);
  };

  const connect = (): (() => void) => {
    if (state.status === 'read') scheduleReset(state);
    return () => {
      ++generation;
      const cancelled = operations.abort();
      clearResetTimer();
      if (state.status === 'reading') setState(PASTE_IDLE_STATE);
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
    paste,
    pasteEvent,
    retry,
    reset,
    connect,
  };
}
