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
    const finish = (): void => {
      clearTimeout(timer);
      external?.removeEventListener('abort', onAbort);
    };
    const fail = (failure: CopyFailure): void => {
      finish();
      controller.abort(failure);
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
        finish();
        resolve(value);
      },
      (cause: unknown) => {
        finish();
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- classified by the caller
        reject(cause);
      },
    );
  });
}
