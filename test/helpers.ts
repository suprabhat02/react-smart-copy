import type { ClipboardAdapter } from '../src/core/clipboard-adapter';
import type { CopyPayload } from '../src/core/payload';

export interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
}

export function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** An adapter whose writes stay pending until the test settles them. */
export function createControllableAdapter() {
  const calls: CopyPayload[] = [];
  const writes: Deferred<void>[] = [];
  const adapter: ClipboardAdapter = {
    write: (payload) => {
      calls.push(payload);
      const d = deferred();
      writes.push(d);
      return d.promise;
    },
  };
  const at = (index: number): Deferred<void> => {
    const d = index < 0 ? writes[writes.length + index] : writes[index];
    if (!d) throw new Error(`No write #${String(index)}`);
    return d;
  };
  return {
    adapter,
    calls,
    resolve: (index = -1) => {
      at(index).resolve();
    },
    reject: (reason: unknown, index = -1) => {
      at(index).reject(reason);
    },
  };
}

export const permissionDenied = { name: 'NotAllowedError', message: 'Write permission denied.' };

/** Lets pending promise callbacks run. */
export const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};
