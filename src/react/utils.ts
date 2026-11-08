import { useEffect, useLayoutEffect, type Ref, type RefCallback } from 'react';

/** `useLayoutEffect` in the browser, `useEffect` on the server (no SSR warning). */
export const useIsomorphicLayoutEffect: typeof useLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function mergeRefs<T>(...refs: ReadonlyArray<Ref<T> | undefined>): RefCallback<T> {
  return (node) => {
    for (const ref of refs) {
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as { current: T | null }).current = node;
    }
  };
}

/** Runs the consumer's handler first; ours is skipped if they call `preventDefault()`. */
export function composeEventHandlers<E extends { readonly defaultPrevented: boolean }>(
  theirs: ((event: E) => void) | undefined,
  ours: (event: E) => void,
): (event: E) => void {
  return (event) => {
    theirs?.(event);
    if (!event.defaultPrevented) ours(event);
  };
}

/**
 * The window an element is in: a pop-out window's (`window.open` plus a portal), not the
 * opener's. Each window's clipboard only works while its own document has focus, and the click
 * happened in this one. Falls back to the global window before the element mounts.
 */
export function windowOf(element: Element | null): (Window & typeof globalThis) | undefined {
  return element?.ownerDocument.defaultView ?? (typeof window === 'undefined' ? undefined : window);
}
