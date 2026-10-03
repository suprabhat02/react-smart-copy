import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useId,
  useMemo,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import type { PasteOutcome, PasteState, PasteStatus } from '../core/paste-machine';
import { describePasteError, type CopyError } from '../core/errors';
import type { PasteResult } from '../core/paste-reader';
import { LiveRegion } from './LiveRegion';
import { usePasteDisplayStatus, type UsePasteDisplayStatusOptions } from './usePasteDisplayStatus';
import { usePaste, type UsePasteOptions, type UsePasteResult } from './usePaste';
import { useRevealOnInteraction, type RevealReason } from './useRevealOnInteraction';
import { composeEventHandlers, mergeRefs } from './utils';

/* ---------------------------------------------------------------- Messages */

export interface PasteFieldMessages {
  /** Announced to screen readers on successful paste. */
  readonly pasted: string | ((result: PasteResult) => string);
  /** Announced on failure. Defaults to {@link describePasteError}. */
  readonly error: (error: CopyError) => string;
  /**
   * Accessible name of the trigger button. Receives the field's `label` prop.
   * The returned string must not be empty.
   */
  readonly triggerLabel: (label: string) => string;
  /**
   * Accessible name of the drop zone / paste target area.
   * Receives the field's `label` prop.
   */
  readonly zoneLabel: (label: string) => string;
}

export const defaultPasteFieldMessages: PasteFieldMessages = {
  pasted: 'Pasted from clipboard',
  error: describePasteError,
  triggerLabel: (label) => `Paste ${label}`,
  zoneLabel: (label) => `Paste area for ${label}`,
};

/* ----------------------------------------------------------------- Context */

export interface PasteFieldContextValue extends UsePasteResult {
  readonly label: string;
  readonly labelId: string;
  readonly zoneId: string;
  readonly revealed: boolean;
  readonly revealReason: RevealReason | null;
  readonly messages: PasteFieldMessages;
  /** Flicker-free status for rendering. Use `status` for logic, this for pixels. */
  readonly displayStatus: PasteStatus;
  /** Triggers a programmatic paste (via Clipboard API, may prompt for permission). */
  readonly doPaste: () => Promise<PasteOutcome>;
}

const PasteFieldContext = /* @__PURE__ */ createContext<PasteFieldContextValue | null>(null);

/** Access field state to build custom parts. Must be used inside `<PasteField.Root>`. */
export function usePasteField(): PasteFieldContextValue {
  const context = useContext(PasteFieldContext);
  if (!context) throw new Error('usePasteField() must be used inside <PasteField.Root>.');
  return context;
}

/* -------------------------------------------------------------------- Root */

export interface PasteFieldRootProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'onPaste' | 'onError'>,
    UsePasteDisplayStatusOptions {
  /** Human label — used for the trigger's and zone's accessible names. */
  readonly label: string;
  readonly pasteOptions?: UsePasteOptions;
  readonly messages?: Partial<PasteFieldMessages>;
  /** Skip hover/focus reveal and always show the trigger. */
  readonly alwaysVisible?: boolean;
  /** Render the built-in live region. Disable if your app has a global announcer. Default `true`. */
  readonly announce?: boolean;
}

const Root = /* @__PURE__ */ forwardRef<HTMLDivElement, PasteFieldRootProps>(function PasteFieldRoot(
  {
    label,
    pasteOptions,
    messages: messageOverrides,
    alwaysVisible = false,
    announce = true,
    pendingDelayMs,
    minPendingMs,
    children,
    onPointerEnter,
    onPointerLeave,
    onPointerDown,
    onFocus,
    onBlur,
    ...rest
  },
  forwardedRef,
) {
  const pasteState = usePaste(pasteOptions);
  const displayStatus = usePasteDisplayStatus(pasteState.status, {
    ...(pendingDelayMs === undefined ? {} : { pendingDelayMs }),
    ...(minPendingMs === undefined ? {} : { minPendingMs }),
  });
  const reveal = useRevealOnInteraction<HTMLDivElement>({ alwaysVisible });
  const baseId = useId();
  const labelId = `${baseId}-label`;
  const zoneId = `${baseId}-zone`;

  const messages = useMemo<PasteFieldMessages>(
    () => ({ ...defaultPasteFieldMessages, ...messageOverrides }),
    [messageOverrides],
  );

  const { paste: machinePaste } = pasteState;
  const doPaste = useCallback(() => machinePaste(), [machinePaste]);
  const { targetProps } = reveal;
  const ref = useMemo(() => mergeRefs(targetProps.ref, forwardedRef), [targetProps.ref, forwardedRef]);

  const context = useMemo<PasteFieldContextValue>(
    () => ({
      ...pasteState,
      label,
      labelId,
      zoneId,
      revealed: reveal.visible,
      revealReason: reveal.reason,
      messages,
      displayStatus,
      doPaste,
    }),
    [pasteState, label, labelId, zoneId, reveal.visible, reveal.reason, messages, displayStatus, doPaste],
  );

  const { state } = pasteState;

  const announcement =
    state.status === 'read'
      ? typeof messages.pasted === 'function'
        ? messages.pasted(state.result)
        : messages.pasted
      : state.status === 'error'
        ? messages.error(state.error)
        : '';

  return (
    <PasteFieldContext.Provider value={context}>
      <div
        {...rest}
        ref={ref}
        data-state={state.status}
        data-display-state={displayStatus}
        data-revealed={reveal.visible ? '' : undefined}
        onPointerEnter={composeEventHandlers(onPointerEnter, targetProps.onPointerEnter)}
        onPointerLeave={composeEventHandlers(onPointerLeave, targetProps.onPointerLeave)}
        onPointerDown={composeEventHandlers(onPointerDown, targetProps.onPointerDown)}
        onFocus={composeEventHandlers(onFocus, targetProps.onFocus)}
        onBlur={composeEventHandlers(onBlur, targetProps.onBlur)}
      >
        {children}
        {announce ? <LiveRegion message={announcement} /> : null}
      </div>
    </PasteFieldContext.Provider>
  );
});

/* ------------------------------------------------------------ Label/Status */

export type PasteFieldLabelProps = HTMLAttributes<HTMLSpanElement>;

const Label = /* @__PURE__ */ forwardRef<HTMLSpanElement, PasteFieldLabelProps>(function PasteFieldLabel(
  { children, ...rest },
  ref,
) {
  const field = usePasteField();
  return (
    <span {...rest} ref={ref} id={field.labelId}>
      {children ?? field.label}
    </span>
  );
});

export interface PasteFieldStatusProps extends HTMLAttributes<HTMLSpanElement> {
  /** Map each paste status to a label. Defaults to English strings. */
  readonly labels?: Partial<Readonly<Record<PasteStatus, string>>>;
}

const DEFAULT_STATUS_LABELS: Readonly<Record<PasteStatus, string>> = {
  idle: 'Ready',
  reading: 'Reading…',
  read: 'Pasted',
  error: 'Error',
};

const Status = /* @__PURE__ */ forwardRef<HTMLSpanElement, PasteFieldStatusProps>(function PasteFieldStatus(
  { children, labels, ...rest },
  ref,
) {
  const field = usePasteField();
  const resolved = labels ? { ...DEFAULT_STATUS_LABELS, ...labels } : DEFAULT_STATUS_LABELS;
  return (
    <span {...rest} ref={ref} data-state={field.status} data-display-state={field.displayStatus}>
      {children ?? resolved[field.displayStatus]}
    </span>
  );
});

/* ------------------------------------------------------------------- Zone */

export interface PasteFieldZoneProps extends HTMLAttributes<HTMLDivElement> {
  /** When true, the zone is always focusable (tabIndex=0). Default true. */
  readonly focusable?: boolean;
}

/**
 * A drop/paste target area. Spread `usePaste`'s `targetProps` here so the
 * zone accepts keyboard paste events.  Also renders a `data-zone` attribute
 * so it can be styled separately from the root.
 */
const Zone = /* @__PURE__ */ forwardRef<HTMLDivElement, PasteFieldZoneProps>(function PasteFieldZone(
  { children, focusable = true, onPaste, 'aria-label': ariaLabel, tabIndex, ...rest },
  ref,
) {
  const field = usePasteField();
  const { targetProps } = field;

  const computedAriaLabel = ariaLabel ?? field.messages.zoneLabel(field.label);
  const safeAriaLabel = computedAriaLabel.length > 0 ? computedAriaLabel : `Paste area for ${field.label}`;

  return (
    <div
      {...rest}
      ref={ref}
      id={field.zoneId}
      role="region"
      aria-label={safeAriaLabel}
      aria-labelledby={field.labelId}
      data-zone=""
      data-state={field.status}
      data-display-state={field.displayStatus}
      tabIndex={tabIndex ?? (focusable ? 0 : undefined)}
      onPaste={composeEventHandlers(onPaste, targetProps.onPaste)}
    >
      {children}
    </div>
  );
});

/* ----------------------------------------------------------------- Trigger */

export interface PasteFieldTriggerRenderProps {
  /** The real state. Use for logic. */
  readonly status: PasteStatus;
  /** Flicker-free state. Use for what you render. */
  readonly displayStatus: PasteStatus;
  readonly state: PasteState;
  readonly revealed: boolean;
}

export interface PasteFieldTriggerProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'type'> {
  /** Static content, or a render function receiving the live state. */
  readonly children?: ReactNode | ((props: PasteFieldTriggerRenderProps) => ReactNode);
}

const DEFAULT_TRIGGER_TEXT: Readonly<Record<PasteStatus, string>> = {
  idle: 'Paste',
  reading: 'Pasting…',
  read: 'Pasted',
  error: 'Retry',
};

const PASTE_STATUSES: readonly PasteStatus[] = ['idle', 'reading', 'read', 'error'];

function DefaultTriggerLabel({ status }: { readonly status: PasteStatus }) {
  return (
    <span style={{ display: 'inline-grid' }}>
      {PASTE_STATUSES.map((candidate) => {
        const active = candidate === status;
        return (
          <span
            key={candidate}
            data-trigger-label={candidate}
            data-active={active ? '' : undefined}
            aria-hidden={active ? undefined : true}
            style={{
              gridArea: '1 / 1',
              opacity: active ? 1 : 0,
              visibility: active ? 'visible' : 'hidden',
              transition: 'opacity 150ms ease, visibility 150ms',
            }}
          >
            {DEFAULT_TRIGGER_TEXT[candidate]}
          </span>
        );
      })}
    </span>
  );
}

const Trigger = /* @__PURE__ */ forwardRef<HTMLButtonElement, PasteFieldTriggerProps>(function PasteFieldTrigger(
  { children, onClick, 'aria-label': ariaLabel, ...rest },
  ref,
) {
  const field = usePasteField();
  const renderProps: PasteFieldTriggerRenderProps = {
    status: field.status,
    displayStatus: field.displayStatus,
    state: field.state,
    revealed: field.revealed,
  };

  const computedAriaLabel = ariaLabel ?? field.messages.triggerLabel(field.label);
  const safeAriaLabel = computedAriaLabel.length > 0 ? computedAriaLabel : `Paste ${field.label}`;

  return (
    <button
      {...rest}
      ref={ref}
      type="button"
      aria-label={safeAriaLabel}
      data-state={field.status}
      data-display-state={field.displayStatus}
      data-revealed={field.revealed ? '' : undefined}
      onClick={composeEventHandlers(onClick, () => {
        void field.doPaste();
      })}
    >
      {typeof children === 'function'
        ? children(renderProps)
        : (children ?? <DefaultTriggerLabel status={field.displayStatus} />)}
    </button>
  );
});

/**
 * Headless compound component for a labelled, paste-ready field.
 *
 * Styling hooks on Root, Zone and Trigger:
 * - `data-display-state="idle|reading|read|error"`: flicker-free, style with this
 * - `data-state`: the real, instantaneous state, for logic and tests
 * - `data-revealed`: present while the trigger should be visible
 *
 * @example
 * ```tsx
 * <PasteField.Root label="Notes">
 *   <PasteField.Label />
 *   <PasteField.Zone />
 *   <PasteField.Trigger />
 * </PasteField.Root>
 * ```
 */
export const PasteField = { Root, Label, Status, Zone, Trigger } as const;
