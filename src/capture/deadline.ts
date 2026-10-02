import { copyFailure, type CopyFailure } from '../core/errors';

export interface DeadlineOptions {
  readonly timeoutMs: number;
  readonly signal?: AbortSignal | undefined;
  /** Used in messages: "<label> timed out". */
  readonly label: string;
}

/**
 * Runs `task` with a timeout and an optional caller `AbortSignal`. The task
 * receives a signal that fires on either, so cooperative work can stop early.
 * Rejects with classified `timeout` / `aborted` failures.
 */
export function withDeadline<T>(task: (signal: AbortSignal) => PromiseLike<T> | T, options: DeadlineOptions): Promise<T> {
  const { timeoutMs, label } = options;
  const external = options.signal;
  if (external?.aborted) {
    return Promise.reject(copyFailure('aborted', `${label} was aborted.`, external.reason));
  }

  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    const finish = (abort: boolean): void => {
      clearTimeout(timer);
      external?.removeEventListener('abort', onAbort);
      // Always signal downstream cooperative work to stop — whether we timed
      // out, were aborted, or resolved successfully. Without this, a task
      // that started a long operation keeps that operation alive after we've
      // already resolved, leaking resources until GC.
      /* c8 ignore next -- abort=false path is never used; kept for future API flexibility */
      if (abort) controller.abort();
    };
    const fail = (failure: CopyFailure): void => {
      finish(true);
      reject(failure);
    };
    const onAbort = (): void => {
      fail(copyFailure('aborted', `${label} was aborted.`, (external as AbortSignal).reason));
    };
    const timer =
      timeoutMs === Infinity
        ? undefined
        : setTimeout(() => {
            fail(copyFailure('timeout', `${label} timed out after ${String(timeoutMs)} ms.`));
          }, timeoutMs);
    external?.addEventListener('abort', onAbort, { once: true });

    new Promise<T>((run) => {
      run(task(controller.signal));
    }).then(
      (value) => {
        finish(true);
        resolve(value);
      },
      (cause: unknown) => {
        finish(true);
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- classified by the caller
        reject(cause);
      },
    );
  });
}
