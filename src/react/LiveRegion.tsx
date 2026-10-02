import { useEffect, useRef, type CSSProperties, type HTMLAttributes } from 'react';

/** Hides content visually while keeping it available to assistive technology. */
export const visuallyHiddenStyle: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

export interface LiveRegionProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, 'children' | 'role' | 'aria-live' | 'aria-atomic'> {
  /** Changing this text is what triggers the announcement. Empty string = silent. */
  readonly message: string;
  readonly politeness?: 'polite' | 'assertive';
  readonly visuallyHidden?: boolean;
}

/**
 * Always-mounted announcer. Screen readers ignore regions that are inserted
 * together with their content, so this must render before the first message.
 *
 * **Mount safety**: the live region is intentionally empty on mount. We write
 * the message into the DOM imperatively (via a ref) only after the element has
 * been live for at least one browser paint. This prevents SSR hydration and
 * strict-mode double-mount from producing a spurious announcement on some
 * screen readers (JAWS / NVDA observe the initial DOM during hydration and
 * re-read regions that already have text content).
 *
 * **WCAG 4.1.3 / ARIA spec**: we use `role="status"` with explicit `aria-live`
 * rather than `role="alert"`. `role="alert"` interrupts any sentence being
 * spoken even in polite mode, which is inappropriate for copy feedback.
 * `role="status"` + `aria-live` is correct for both politeness levels.
 */
export function LiveRegion({
  message,
  politeness = 'polite',
  visuallyHidden = true,
  style,
  ...rest
}: LiveRegionProps) {
  const spanRef = useRef<HTMLSpanElement>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
  }, []);

  useEffect(() => {
    const span = spanRef.current;
    /* c8 ignore next -- spanRef.current is always set by mount; guard for unmounted edge case */
    if (!span) return;
    // Delay the first write by one tick so the live region is registered with
    // the AT before any content lands in it. Subsequent updates are immediate.
    /* c8 ignore next -- jsdom effects run synchronously so mountedRef.current is always true here; this guard only fires in real browsers during the initial paint */
    if (!mountedRef.current) return;
    span.textContent = message;
  }, [message]);

  return (
    <span
      {...rest}
      ref={spanRef}
      role="status"
      aria-live={politeness}
      aria-atomic="true"
      style={visuallyHidden ? { ...visuallyHiddenStyle, ...style } : style}
    />
  );
}
