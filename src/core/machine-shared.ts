/**
 * Internals shared by the copy and paste state machines. Kept in one module so
 * apps that use both don't ship two copies.
 */

export const DEFAULT_MAX_RETRIES = 3;

/**
 * Passed to adapters and lazy sources as their last argument. `signal` aborts
 * when the operation is superseded, `reset()`, or its host unmounts, so
 * expensive work (rasterising, decoding) can stop early.
 */
export interface OperationContext {
  readonly signal: AbortSignal;
}

export function resolveMaxRetries(value: number | undefined): number {
  if (value === Infinity) return Infinity;
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_MAX_RETRIES;
  return Math.max(0, Math.floor(value));
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
export function invoke<Args extends unknown[]>(fn: ((...args: Args) => void) | undefined, ...args: Args): void {
  if (!fn) return;
  try {
    fn(...args);
  } catch (error) {
    reportCallbackError(error);
  }
}

export interface Operations {
  /** Aborts the operation in flight (if any) and starts a new one. */
  readonly start: () => OperationContext;
  /** Marks `context` finished, so a later `abort()` never fires its signal. */
  readonly end: (context: OperationContext) => void;
  /** Cancels the operation in flight, if any. Returns whether one was cancelled. */
  readonly abort: () => boolean;
}

/** One cancellable operation at a time. Signals only fire while their operation is unfinished. */
export function createOperations(): Operations {
  let controller: AbortController | undefined;
  const abort = (): boolean => {
    if (!controller) return false;
    controller.abort();
    controller = undefined;
    return true;
  };
  return {
    start: () => {
      abort();
      controller = new AbortController();
      return { signal: controller.signal };
    },
    end: (context) => {
      if (controller?.signal === context.signal) controller = undefined;
    },
    abort,
  };
}
