import { toCopyError, type CopyError } from './errors';
import { createBrowserPasteAdapter, type PasteAdapter } from './paste-adapter';
import {
  enforcePasteLimits,
  finalizePaste,
  resolvePasteReadOptions,
  snapshotDataTransfer,
  type DataTransferLike,
  type PasteReadOptions,
  type PasteResult,
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
}

export type PasteState = PasteIdleState | PasteReadingState | PasteReadState | PasteErrorState;
export type PasteStatus = PasteState['status'];

export type PasteIgnoredReason = 'in-flight' | 'no-accepted-content';

/** What `paste()` / `pasteEvent()` resolve to. They never reject. */
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
  readonly onPaste?: (result: PasteResult) => void;
  readonly onError?: (error: CopyError) => void;
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
  /** Back to `idle`, discarding any in-flight result. */
  readonly reset: () => void;
  /**
   * Lifecycle hook for hosts. Re-arms a pending auto-reset; the returned
   * cleanup clears timers, drops in-flight results and unsticks `reading`.
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

function resolveResetDelay(value: number | false | undefined): number | null {
  if (value === undefined || value === false || value === Infinity || Number.isNaN(value)) return null;
  return Math.max(0, value);
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

let defaultAdapter: PasteAdapter | undefined;
const getDefaultAdapter = (): PasteAdapter => (defaultAdapter ??= createBrowserPasteAdapter());

/** Framework-agnostic paste state machine. */
export function createPasteMachine(options: PasteMachineOptionsSource = {}): PasteMachine {
  const read = typeof options === 'function' ? options : (): PasteMachineOptions => options;
  const listeners = new Set<() => void>();
  let state: PasteState = PASTE_IDLE_STATE;
  let generation = 0;
  let resetTimer: ReturnType<typeof setTimeout> | undefined;

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

  /** Runs one read. `produce` is invoked synchronously so the user gesture is preserved. */
  const run = (produce: () => Promise<PasteResult>): Promise<PasteOutcome> => {
    clearResetTimer();
    const current = ++generation;
    setState(PASTE_READING_STATE);

    let pending: Promise<PasteResult>;
    try {
      pending = produce();
    } catch (cause) {
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- classified below
      pending = Promise.reject(cause);
    }

    return pending.then(
      (result): PasteOutcome => {
        if (current === generation) {
          const readState: PasteReadState = { status: 'read', result, at: now() };
          setState(readState);
          scheduleReset(readState);
          invoke(read().onPaste, result);
        }
        return { status: 'read', result };
      },
      (cause: unknown): PasteOutcome => {
        const error = toCopyError(cause, 'read');
        if (current === generation) {
          setState({ status: 'error', error });
          invoke(read().onError, error);
        }
        return { status: 'error', error };
      },
    );
  };

  const paste = (): Promise<PasteOutcome> => {
    if (state.status === 'reading') return Promise.resolve(IGNORED_IN_FLIGHT);
    return run(() => {
      const resolved = resolvePasteReadOptions(read());
      return (read().adapter ?? getDefaultAdapter()).read(resolved);
    });
  };

  const pasteEvent = (event: PasteEventLike): Promise<PasteOutcome> => {
    const data = event.clipboardData;
    if (!data) return Promise.resolve(IGNORED_NO_CONTENT);

    const current = read();
    let resolved: ReturnType<typeof resolvePasteReadOptions>;
    try {
      resolved = resolvePasteReadOptions(current);
    } catch (cause) {
      return run(() => {
        throw cause;
      });
    }

    // DataTransfer is only readable during dispatch: snapshot before anything async.
    const entries = snapshotDataTransfer(data, resolved);
    if (entries.length === 0) return Promise.resolve(IGNORED_NO_CONTENT);
    if (current.preventDefault !== false) event.preventDefault();

    return run(() => {
      enforcePasteLimits(entries, resolved);
      return finalizePaste(entries, 'event', resolved);
    });
  };

  const reset = (): void => {
    ++generation;
    clearResetTimer();
    setState(PASTE_IDLE_STATE);
  };

  const connect = (): (() => void) => {
    if (state.status === 'read') scheduleReset(state);
    return () => {
      ++generation;
      clearResetTimer();
      if (state.status === 'reading') setState(PASTE_IDLE_STATE);
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
    reset,
    connect,
  };
}
