import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEventHandler,
  type PointerEventHandler,
  type RefCallback,
} from 'react';
import { useMediaQuery } from './useMediaQuery';

/** Why the target is currently revealed, in priority order. */
export type RevealReason = 'forced' | 'focus' | 'hover' | 'touch' | 'no-hover-device';

export interface UseRevealOnInteractionOptions {
  /** Always reveal (e.g. a "show actions" user setting). */
  readonly alwaysVisible?: boolean;
}

export interface RevealTargetProps<T extends HTMLElement> {
  readonly ref: RefCallback<T>;
  readonly onPointerEnter: PointerEventHandler<T>;
  readonly onPointerLeave: PointerEventHandler<T>;
  readonly onPointerDown: PointerEventHandler<T>;
  readonly onFocus: FocusEventHandler<T>;
  readonly onBlur: FocusEventHandler<T>;
}

export interface UseRevealOnInteractionResult<T extends HTMLElement> {
  readonly visible: boolean;
  readonly reason: RevealReason | null;
  /** Spread onto the container that owns the hidden actions. */
  readonly targetProps: RevealTargetProps<T>;
}

function isFocusVisible(element: EventTarget): boolean {
  if (!(element instanceof Element)) return true;
  try {
    return element.matches(':focus-visible');
  } catch {
    return true; // Engines without :focus-visible: reveal on any focus, the accessible default.
  }
}

/**
 * Reveals secondary actions on hover, keyboard focus and touch, and always on
 * devices that cannot hover. Hover and focus are tracked independently, so a
 * touchscreen laptop never gets stuck in a "touch only" mode.
 *
 * Keep the actions in the DOM and in the tab order; hide them visually with
 * CSS keyed off `visible` (or `data-revealed`), never with `display: none`.
 */
export function useRevealOnInteraction<T extends HTMLElement = HTMLElement>(
  options: UseRevealOnInteractionOptions = {},
): UseRevealOnInteractionResult<T> {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [touched, setTouched] = useState(false);
  const cannotHover = useMediaQuery('(hover: none)');
  const nodeRef = useRef<T | null>(null);

  // A touch reveal lasts until the user touches somewhere else.
  useEffect(() => {
    if (!touched) return undefined;
    const dismiss = (event: PointerEvent): void => {
      const node = nodeRef.current;
      if (node && event.target instanceof Node && node.contains(event.target)) return;
      setTouched(false);
    };
    document.addEventListener('pointerdown', dismiss, true);
    return () => {
      document.removeEventListener('pointerdown', dismiss, true);
    };
  }, [touched]);

  const targetProps = useMemo<RevealTargetProps<T>>(
    () => ({
      ref: (node) => {
        nodeRef.current = node;
      },
      onPointerEnter: (event) => {
        if (event.pointerType !== 'touch') setHovered(true);
      },
      onPointerLeave: (event) => {
        if (event.pointerType !== 'touch') setHovered(false);
      },
      onPointerDown: (event) => {
        if (event.pointerType === 'touch') setTouched(true);
      },
      onFocus: (event) => {
        // Mouse clicks focus buttons too; only keyboard-style focus should pin the reveal.
        setFocused(isFocusVisible(event.target));
      },
      onBlur: (event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        setFocused(false);
      },
    }),
    [],
  );

  const reason: RevealReason | null = options.alwaysVisible
    ? 'forced'
    : focused
      ? 'focus'
      : hovered
        ? 'hover'
        : touched
          ? 'touch'
          : cannotHover
            ? 'no-hover-device'
            : null;

  return { visible: reason !== null, reason, targetProps };
}
