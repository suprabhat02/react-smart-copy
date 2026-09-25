import { useEffect, useLayoutEffect, type Ref, type RefCallback } from 'react';

/** `useLayoutEffect` in the browser, `useEffect` on the server (no SSR warning). */
export const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

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
