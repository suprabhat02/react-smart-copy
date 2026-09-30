import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  PASTE_IDLE_STATE,
  createPasteMachine,
  type PasteMachine,
  type PasteMachineOptions,
  type PasteState,
  type PasteStatus,
  type PasteResult,
} from '../core/paste-machine';
import type { CopyError } from '../core/errors';
import { useIsomorphicLayoutEffect } from './utils';

export type UsePasteOptions = PasteMachineOptions;

export interface UsePasteResult {
  /** Full discriminated state; narrow on `state.status`. */
  readonly state: PasteState;
  readonly status: PasteStatus;
  /** The pasted content, or `null` when status is not `'read'`. */
  readonly result: PasteResult | null;
  readonly error: CopyError | null;
  /** Stable identity. Never rejects; resolves to a `PasteOutcome`. */
  readonly paste: PasteMachine['paste'];
  /** Stable identity. Back to `idle`. */
  readonly reset: PasteMachine['reset'];
}

const getServerSnapshot = (): PasteState => PASTE_IDLE_STATE;

/**
 * Paste state machine bound to a component. Reads from the system clipboard
 * using the async Clipboard API. Only works in secure contexts (HTTPS or localhost).
 *
 * The browser will prompt the user for clipboard-read permission on first use
 * (Chromium). Safari and Firefox restrict `clipboard.read()` to user-gesture
 * events — call `paste()` from a click or keydown handler, never on mount.
 *
 * ```tsx
 * const { paste, status, result } = usePaste();
 *
 * return (
 *   <button onClick={() => void paste()}>
 *     {status === 'read' && result?.kind === 'text' ? result.value : 'Paste'}
 *   </button>
 * );
 * ```
 */
export function usePaste(options: UsePasteOptions = {}): UsePasteResult {
  const optionsRef = useRef(options);
  useIsomorphicLayoutEffect(() => {
    optionsRef.current = options;
  });

  const [machine] = useState(() => createPasteMachine(() => optionsRef.current));
  useEffect(() => machine.connect(), [machine]);

  const state = useSyncExternalStore(machine.subscribe, machine.getSnapshot, getServerSnapshot);

  return useMemo(
    () => ({
      state,
      status: state.status,
      result: state.status === 'read' ? state.result : null,
      error: state.status === 'error' ? state.error : null,
      paste: machine.paste,
      reset: machine.reset,
    }),
    [state, machine],
  );
}
