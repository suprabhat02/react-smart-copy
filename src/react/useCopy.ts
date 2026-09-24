import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  IDLE_STATE,
  canRetryState,
  createCopyMachine,
  type CopyMachine,
  type CopyMachineOptions,
  type CopyState,
  type CopyStatus,
} from '../core/copy-machine';
import type { CopyError } from '../core/errors';
import { useIsomorphicLayoutEffect } from './utils';

export type UseCopyOptions = CopyMachineOptions;

export interface UseCopyResult {
  /** Full discriminated state; narrow on `state.status`. */
  readonly state: CopyState;
  readonly status: CopyStatus;
  readonly error: CopyError | null;
  /** Whether `retry()` can do anything right now. */
  readonly canRetry: boolean;
  /** Stable identity. Never rejects; resolves to a `CopyOutcome`. */
  readonly copy: CopyMachine['copy'];
  /** Stable identity. Re-attempts the last failed payload, up to `maxRetries`. */
  readonly retry: CopyMachine['retry'];
  /** Stable identity. Back to `idle`, discarding any in-flight result. */
  readonly reset: CopyMachine['reset'];
}

const getServerSnapshot = (): CopyState => IDLE_STATE;

/**
 * Copy state machine bound to a component. Options may change on every render
 * (inline callbacks are fine); the latest ones are always used.
 */
export function useCopy(options: UseCopyOptions = {}): UseCopyResult {
  const optionsRef = useRef(options);
  useIsomorphicLayoutEffect(() => {
    optionsRef.current = options;
  });

  const [machine] = useState(() => createCopyMachine(() => optionsRef.current));
  useEffect(() => machine.connect(), [machine]);

  const state = useSyncExternalStore(machine.subscribe, machine.getSnapshot, getServerSnapshot);
  const canRetry = canRetryState(state, options.maxRetries);

  return useMemo(
    () => ({
      state,
      status: state.status,
      error: state.status === 'error' ? state.error : null,
      canRetry,
      copy: machine.copy,
      retry: machine.retry,
      reset: machine.reset,
    }),
    [state, canRetry, machine],
  );
}
