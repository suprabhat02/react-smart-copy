import type { CSSProperties, HTMLAttributes } from 'react';

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
 */
export function LiveRegion({
  message,
  politeness = 'polite',
  visuallyHidden = true,
  style,
  ...rest
}: LiveRegionProps) {
  return (
    <span
      {...rest}
      role={politeness === 'assertive' ? 'alert' : 'status'}
      aria-live={politeness}
      aria-atomic="true"
      style={visuallyHidden ? { ...visuallyHiddenStyle, ...style } : style}
    >
      {message}
    </span>
  );
}
