import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { DEFAULT_RESET_AFTER_MS } from '../core/copy-machine';
import type { CopyError } from '../core/errors';
import { useIsomorphicLayoutEffect } from './utils';
import { shareMethod, shareOrCopy, TOUCH_FIRST, type ShareContent, type ShareMethod, type ShareOptions, type ShareOutcome } from '../share/share';

/** `sharing` lasts while the share sheet is open or the copy is being written. */
export type ShareStatus = 'idle' | 'sharing' | 'shared' | 'copied' | 'error';

export interface UseShareOptions extends ShareOptions {
  /** Time in `shared` or `copied` before returning to `idle`. `false` keeps it. Default 2000. */
  readonly resetAfterMs?: number | false;
  /** Called with every settled outcome, including `cancelled`. */
  readonly onShare?: (outcome: ShareOutcome) => void;
}

/** What `share()` resolves to: the outcome, or `ignored` while a share is already open. */
export type UseShareOutcome = ShareOutcome | { readonly status: 'ignored'; readonly reason: 'in-flight' };

export interface UseShareResult {
  readonly status: ShareStatus;
  readonly error: CopyError | null;
  /** The last settled outcome; `null` before the first and after `reset()`. */
  readonly outcome: ShareOutcome | null;
  /**
   * How `share()` will share: `"native"` (the share sheet) or `"copy"`. Label the
   * button with it ("Share…" or "Copy link"). `"copy"` during server rendering
   * and hydration, then updated in the browser, also when the device changes.
   */
  readonly method: ShareMethod;
  /** Stable identity. Call it in a click handler. Never rejects. */
  readonly share: (content: ShareContent) => Promise<UseShareOutcome>;
  /** Stable identity. Back to `idle`; the result of a share still open is ignored. */
  readonly reset: () => void;
}

interface State {
  readonly status: ShareStatus;
  readonly outcome: ShareOutcome | null;
}

const IDLE: State = { status: 'idle', outcome: null };
const IGNORED: UseShareOutcome = /* @__PURE__ */ Object.freeze({ status: 'ignored', reason: 'in-flight' });

function resetDelay(value: number | false | undefined): number | null {
  if (value === false || value === Infinity) return null;
  return value === undefined || Number.isNaN(value) ? DEFAULT_RESET_AFTER_MS : Math.max(0, value);
}

const statusOf = (outcome: ShareOutcome): ShareStatus => (outcome.status === 'cancelled' ? 'idle' : outcome.status);

/**
 * Share with the device's share sheet on phones and tablets, and copy a titled
 * link everywhere else, with honest state for the button. Options may change on
 * every render; the latest ones are always used.
 *
 * @example
 * const { share, status, method } = useShare();
 * <button onClick={() => share({ url, title })}>
 *   {status === 'copied' ? 'Link copied' : method === 'native' ? 'Share…' : 'Copy link'}
 * </button>
 */
export function useShare(options: UseShareOptions = {}): UseShareResult {
  const optionsRef = useRef(options);
  useIsomorphicLayoutEffect(() => {
    optionsRef.current = options;
  });

  const [state, setState] = useState<State>(IDLE);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
      clearTimeout(timer.current);
    };
  }, []);

  const subscribe = useCallback((onChange: () => void) => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => undefined;
    const list = window.matchMedia(TOUCH_FIRST);
    list.addEventListener('change', onChange);
    return () => {
      list.removeEventListener('change', onChange);
    };
  }, []);
  const method = useSyncExternalStore(
    subscribe,
    () => shareMethod(optionsRef.current),
    (): ShareMethod => 'copy',
  );

  const share = useCallback(async (content: ShareContent): Promise<UseShareOutcome> => {
    if (inFlight.current) return IGNORED;
    inFlight.current = true;
    const current = (generation.current += 1);
    clearTimeout(timer.current);
    setState({ status: 'sharing', outcome: null });
    // No await before this call: the share sheet needs the click's user activation.
    const outcome = await shareOrCopy(content, optionsRef.current);
    inFlight.current = false;
    if (!mounted.current || current !== generation.current) return outcome;
    setState({ status: statusOf(outcome), outcome });
    const delay = resetDelay(optionsRef.current.resetAfterMs);
    if ((outcome.status === 'shared' || outcome.status === 'copied') && delay !== null) {
      timer.current = setTimeout(() => {
        setState(IDLE);
      }, delay);
    }
    optionsRef.current.onShare?.(outcome);
    return outcome;
  }, []);

  const reset = useCallback(() => {
    generation.current += 1;
    clearTimeout(timer.current);
    setState(IDLE);
  }, []);

  return useMemo(
    () => ({
      status: state.status,
      error: state.outcome?.status === 'error' ? state.outcome.error : null,
      outcome: state.outcome,
      method,
      share,
      reset,
    }),
    [state, method, share, reset],
  );
}
