import { useEffect, useState } from 'react';
import type { PasteStatus } from '../core/paste-machine';
import { useIsomorphicLayoutEffect } from './utils';

export const DEFAULT_PASTE_PENDING_DELAY_MS = 150;
export const DEFAULT_PASTE_MIN_PENDING_MS = 400;

export interface UsePasteDisplayStatusOptions {
  /** Only show `reading` if the paste takes longer than this. Default 150 ms. */
  readonly pendingDelayMs?: number;
  /** Once `reading` is shown, keep it visible at least this long. Default 400 ms. */
  readonly minPendingMs?: number;
}

type SettledPasteStatus = Exclude<PasteStatus, 'reading'>;

/**
 * Presentation-only view of a paste status that never flickers.
 *
 * The real `status` is honest and can be `reading` for a single render frame
 * (plain-text reads take ~1-5 ms). Rendering that directly flashes a "Reading…"
 * label. This hook keeps showing the previous settled status during fast pastes,
 * and when a paste is genuinely slow it shows `reading` for a minimum time
 * instead of a blink.
 *
 * It never changes the state machine: use `status` for logic, this for pixels.
 */
export function usePasteDisplayStatus(status: PasteStatus, options: UsePasteDisplayStatusOptions = {}): PasteStatus {
  const pendingDelayMs = Math.max(0, options.pendingDelayMs ?? DEFAULT_PASTE_PENDING_DELAY_MS);
  const minPendingMs = Math.max(0, options.minPendingMs ?? DEFAULT_PASTE_MIN_PENDING_MS);

  // Last non-reading status, shown while a fast paste is in flight. Only read
  // while `reading`, so synced in a layout effect to avoid useSyncExternalStore
  // snapshot-tracking corruption on React 18.
  const [settled, setSettled] = useState<SettledPasteStatus>(status === 'reading' ? 'idle' : status);
  useIsomorphicLayoutEffect(() => {
    if (status !== 'reading') setSettled(status);
  }, [status]);

  // When the pending indicator became visible, or null while it is hidden.
  const [pendingShownAt, setPendingShownAt] = useState<number | null>(null);

  useEffect(() => {
    if (status !== 'reading') return undefined;
    const timer = setTimeout(() => {
      setPendingShownAt(Date.now());
    }, pendingDelayMs);
    return () => {
      clearTimeout(timer);
    };
  }, [status, pendingDelayMs]);

  useEffect(() => {
    if (status === 'reading' || pendingShownAt === null) return undefined;
    const remaining = Math.max(0, minPendingMs - (Date.now() - pendingShownAt));
    const timer = setTimeout(() => {
      setPendingShownAt(null);
    }, remaining);
    return () => {
      clearTimeout(timer);
    };
  }, [status, pendingShownAt, minPendingMs]);

  if (pendingShownAt !== null) return 'reading';
  return status === 'reading' ? settled : status;
}
