import { useCallback, useEffect, useRef, useState, type RefCallback } from 'react';
import {
  applyDragCopy,
  type DragCopyOptions,
  type DragCopyOutcome,
  type DragCopyState,
  type DragCopyStatus,
  type DragStartEventLike,
} from '../core/drag-copy';
import { useIsomorphicLayoutEffect } from './utils';
import { invoke } from '../core/machine-shared';

export interface UseDragCopyOptions extends Omit<DragCopyOptions, 'onDrag'> {
  /**
   * Set `false` to disable drag without unmounting. Removes the `draggable`
   * attribute and listener while `false`. Default `true`.
   */
  readonly enabled?: boolean;
  /** Called each time a drag starts or ends. */
  readonly onDrag?: (state: DragCopyState) => void;
}

export interface UseDragCopyResult<T extends HTMLElement = HTMLElement> {
  /**
   * Attach to any element you want to make draggable. The hook sets
   * `draggable="true"` automatically while `enabled` is `true`.
   */
  readonly ref: RefCallback<T>;
  /** `'idle' | 'dragging' | 'done'` — the current drag status. */
  readonly status: DragCopyStatus;
  /** The last `dragstart` outcome; `null` before the first drag. */
  readonly outcome: DragCopyOutcome | null;
  /**
   * For use in React's `onDragStart` prop if you need to wire it imperatively
   * (e.g. inside a render-prop component). The `ref` alone is sufficient for
   * native HTML elements: the hook attaches its own listener.
   */
  readonly onDragStart: (event: DragStartEventLike) => void;
}

/**
 * Makes an element draggable and populates its `DataTransfer` with your data.
 *
 * ```tsx
 * const { ref } = useDragCopy({
 *   source: () => ({ kind: 'html', html: '<b>Hello</b>', text: 'Hello' }),
 * });
 * return <div ref={ref}>Drag me</div>;
 * ```
 *
 * - No Clipboard API needed — works in every browser supporting HTML5 drag-and-drop.
 * - The `source` callback always reads the latest props/state, never stale closures.
 * - `enabled={false}` removes `draggable` and the listener without unmounting.
 * - SSR-safe: no DOM access during server rendering.
 */
export function useDragCopy<T extends HTMLElement = HTMLElement>(
  options: UseDragCopyOptions,
): UseDragCopyResult<T> {
  const optionsRef = useRef(options);
  useIsomorphicLayoutEffect(() => {
    optionsRef.current = options;
  });

  const [node, setNode] = useState<HTMLElement | null>(null);
  const [state, setState] = useState<DragCopyState>({ status: 'idle', outcome: null });

  const enabled = options.enabled !== false;

  // Stable handler for the React onDragStart prop path.
  const onDragStart = useCallback((event: DragStartEventLike): void => {
    const { onDrag, onError, source, effectAllowed } = optionsRef.current;
    const coreOpts: DragCopyOptions = effectAllowed !== undefined
      ? { source, effectAllowed }
      : { source };
    const outcome = applyDragCopy(event, coreOpts);
    const next: DragCopyState = { status: 'dragging', outcome };
    setState(next);
    if (outcome.status === 'failed') invoke(onError, outcome.error);
    invoke(onDrag, next);
  }, []);

  useEffect(() => {
    if (!node || !enabled) return undefined;

    node.setAttribute('draggable', 'true');

    function handleDragStart(raw: Event): void {
      const event = raw as DragEvent;
      const { onDrag, onError, source, effectAllowed } = optionsRef.current;
      const coreOpts: DragCopyOptions = effectAllowed !== undefined
        ? { source, effectAllowed }
        : { source };
      const outcome = applyDragCopy(
        {
          type: event.type,
          dataTransfer: event.dataTransfer,
          get defaultPrevented() {
            return event.defaultPrevented;
          },
          preventDefault: () => { event.preventDefault(); },
        },
        coreOpts,
      );
      const next: DragCopyState = { status: 'dragging', outcome };
      setState(next);
      if (outcome.status === 'failed') invoke(onError, outcome.error);
      invoke(onDrag, next);
    }

    function handleDragEnd(): void {
      const opts = optionsRef.current;
      setState((prev) => {
        const next: DragCopyState = { status: 'done', outcome: prev.outcome };
        invoke(opts.onDrag, next);
        return next;
      });
    }

    node.addEventListener('dragstart', handleDragStart);
    node.addEventListener('dragend', handleDragEnd);

    return () => {
      node.removeEventListener('dragstart', handleDragStart);
      node.removeEventListener('dragend', handleDragEnd);
      node.removeAttribute('draggable');
    };
  }, [node, enabled]);

  // Reset to idle when disabled so status accurately reflects the element's state.
  useEffect(() => {
    if (!enabled) setState({ status: 'idle', outcome: null });
  }, [enabled]);

  return {
    ref: setNode,
    status: state.status,
    outcome: state.outcome,
    onDragStart,
  };
}
