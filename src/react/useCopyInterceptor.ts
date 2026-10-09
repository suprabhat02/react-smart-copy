import { useEffect, useRef, useState, type RefCallback } from 'react';
import { registerCopyInterceptor, type CopyInterceptorOptions } from '../core/copy-interceptor';
import { useIsomorphicLayoutEffect } from './utils';

export interface UseCopyInterceptorOptions extends CopyInterceptorOptions {
  /** Set `false` to stop intercepting without unmounting. Default `true`. */
  readonly enabled?: boolean;
}

export interface UseCopyInterceptorResult<T extends Element> {
  /** Attach to the element whose content you want to control. */
  readonly ref: RefCallback<T>;
}

/**
 * Rewrites, redacts or blocks native copies (Ctrl/Cmd+C, context menu) and
 * cuts whose selection touches the referenced element.
 *
 * ```tsx
 * const { ref } = useCopyInterceptor<HTMLElement>({
 *   transform: ({ text }) => `${text}\n\nSource: ${location.href}`,
 * });
 * return <article ref={ref}>…</article>;
 * ```
 *
 * The transform runs synchronously inside the event and always sees the
 * latest props; changing it never re-subscribes. SSR-safe.
 */
export function useCopyInterceptor<T extends Element = HTMLElement>(
  options: UseCopyInterceptorOptions,
): UseCopyInterceptorResult<T> {
  const optionsRef = useRef(options);
  useIsomorphicLayoutEffect(() => {
    optionsRef.current = options;
  });

  const [node, setNode] = useState<T | null>(null);
  const enabled = options.enabled !== false;

  useEffect(() => {
    if (!node || !enabled) return undefined;
    return registerCopyInterceptor(node, () => optionsRef.current);
  }, [node, enabled]);

  return { ref: setNode };
}
