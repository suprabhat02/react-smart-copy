import { useEffect, useState } from 'react';
import type { CopyStatus } from '../core/copy-machine';

export const DEFAULT_PENDING_DELAY_MS = 150;
export const DEFAULT_MIN_PENDING_MS = 400;

export interface UseDisplayStatusOptions {
  /** Only show `copying` if the copy takes longer than this. Default 150 ms. */
  readonly pendingDelayMs?: number;
  /** Once `copying` is shown, keep it visible at least this long. Default 400 ms. */
  readonly minPendingMs?: number;
}

type SettledStatus = Exclude<CopyStatus, 'copying'>;

/**
 * Presentation-only view of a copy status that never flickers.
 *
 * The real `status` is honest and can be `copying` for a single frame (text
 * copies take ~1-5 ms). Rendering that directly flashes a "Copying…" label.
 * This hook keeps showing the previous state during fast copies, and when a
 * copy is genuinely slow it shows `copying` for a minimum time instead of a blink.
 *
 * It never changes the state machine: use `status` for logic, this for pixels.
 */
export function useDisplayStatus(status: CopyStatus, options: UseDisplayStatusOptions = {}): CopyStatus {
  const pendingDelayMs = Math.max(0, options.pendingDelayMs ?? DEFAULT_PENDING_DELAY_MS);
  const minPendingMs = Math.max(0, options.minPendingMs ?? DEFAULT_MIN_PENDING_MS);

  // Last non-copying status, shown while a fast copy is in flight.
  const [settled, setSettled] = useState<SettledStatus>(status === 'copying' ? 'idle' : status);
  if (status !== 'copying' && status !== settled) setSettled(status);

  // When the pending indicator became visible, or null while it is hidden.
  const [pendingShownAt, setPendingShownAt] = useState<number | null>(null);

  useEffect(() => {
    if (status !== 'copying') return undefined;
    const timer = setTimeout(() => {
      setPendingShownAt(Date.now());
    }, pendingDelayMs);
    return () => {
      clearTimeout(timer);
    };
  }, [status, pendingDelayMs]);

  useEffect(() => {
    if (status === 'copying' || pendingShownAt === null) return undefined;
    const remaining = Math.max(0, minPendingMs - (Date.now() - pendingShownAt));
    const timer = setTimeout(() => {
      setPendingShownAt(null);
    }, remaining);
    return () => {
      clearTimeout(timer);
    };
  }, [status, pendingShownAt, minPendingMs]);

  if (pendingShownAt !== null) return 'copying';
  return status === 'copying' ? settled : status;
}
