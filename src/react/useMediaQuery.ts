import { useCallback, useRef, useSyncExternalStore } from 'react';

const getServerSnapshot = (): boolean => false;

/** SSR-safe media query subscription. Server and hydration render `false`. */
export function useMediaQuery(query: string): boolean {
  // Cache the MediaQueryList so `subscribe` always attaches to the same
  // object. We call `matchMedia()` once per query string (per mount / query
  // change) and hold the reference for the duration. The `.matches` accessor
  // on the real MediaQueryList is live, so `getSnapshot` reads the current
  // value without re-calling `matchMedia()` on every render.
  const listRef = useRef<MediaQueryList | null>(null);
  const queryRef = useRef<string>('');

  const getList = useCallback((): MediaQueryList | null => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
    // Invalidate the cache when the query string changes.
    if (listRef.current === null || queryRef.current !== query) {
      listRef.current = window.matchMedia(query);
      queryRef.current = query;
    }
    return listRef.current;
  }, [query]);

  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = getList();
      if (!list) return () => undefined;
      list.addEventListener('change', onChange);
      return () => {
        list.removeEventListener('change', onChange);
      };
    },
    [getList],
  );

  const getSnapshot = useCallback(() => getList()?.matches ?? false, [getList]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
