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
import type { CopyOutcome, CopyState, CopyStatus } from '../core/copy-machine';
import { describeCopyError, type CopyError } from '../core/errors';
import type { CopySource } from '../core/payload';
import { LiveRegion } from './LiveRegion';
import { useDisplayStatus, type UseDisplayStatusOptions } from './useDisplayStatus';
import { useMediaQuery } from './useMediaQuery';
import { useCopy, type UseCopyOptions, type UseCopyResult } from './useCopy';
import { useRevealOnInteraction, type RevealReason } from './useRevealOnInteraction';
import { composeEventHandlers, mergeRefs } from './utils';

export interface CopyFieldMessages {
  /** Announced to screen readers on success. */
  readonly copied: string;
  /** Announced on failure. Defaults to {@link describeCopyError}. */
  readonly error: (error: CopyError) => string;
  /** Accessible name of the trigger. */
  readonly triggerLabel: (label: string) => string;
}

export const defaultCopyFieldMessages: CopyFieldMessages = {
  copied: 'Copied to clipboard',
  error: describeCopyError,
  triggerLabel: (label) => `Copy ${label}`,
};

export interface CopyFieldContextValue extends UseCopyResult {
  readonly label: string;
  readonly labelId: string;
  readonly valueId: string;
  readonly revealed: boolean;
  readonly revealReason: RevealReason | null;
  readonly messages: CopyFieldMessages;
  /** Text shown by `<CopyField.Value>` when the value is plain text; otherwise `null`. */
  readonly displayValue: string | null;
  /** Flicker-free status for rendering. Use `status` for logic, this for pixels. */
  readonly displayStatus: CopyStatus;
  /** Copies the field's current value. */
  readonly copyValue: () => Promise<CopyOutcome>;
}

const CopyFieldContext = /* @__PURE__ */ createContext<CopyFieldContextValue | null>(null);

/** Access field state to build custom parts. Must be used inside `<CopyField.Root>`. */
export function useCopyField(): CopyFieldContextValue {
  const context = useContext(CopyFieldContext);
  if (!context) throw new Error('useCopyField() must be used inside <CopyField.Root>.');
  return context;
}

function getDisplayValue(value: CopySource): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value.kind === 'text') return value.value;
  return null;
}

/* ------------------------------------------------------------------ Root */

export interface CopyFieldRootProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'onCopy' | 'onError'>,
    UseDisplayStatusOptions {
  /** What to copy. Pass a function to read the latest value at click time. */
  readonly value: CopySource;
  /** Human label, used for the trigger's accessible name ("Copy Email"). */
  readonly label: string;
  readonly copyOptions?: UseCopyOptions;
  readonly messages?: Partial<CopyFieldMessages>;
  /** Skip hover/focus reveal and always show the trigger. */
  readonly alwaysVisible?: boolean;
  /** Render the built-in live region. Disable if your app has a global announcer. Default `true`. */
  readonly announce?: boolean;
}

const Root = /* @__PURE__ */ forwardRef<HTMLDivElement, CopyFieldRootProps>(function CopyFieldRoot(
  {
    value,
    label,
    copyOptions,
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
  const copyState = useCopy(copyOptions);
  const displayStatus = useDisplayStatus(copyState.status, {
    ...(pendingDelayMs === undefined ? {} : { pendingDelayMs }),
    ...(minPendingMs === undefined ? {} : { minPendingMs }),
  });
  const reveal = useRevealOnInteraction<HTMLDivElement>({ alwaysVisible });
  const baseId = useId();
  const labelId = `${baseId}-label`;
  const valueId = `${baseId}-value`;

  const messages = useMemo<CopyFieldMessages>(
    () => ({ ...defaultCopyFieldMessages, ...messageOverrides }),
    [messageOverrides],
  );

  const { copy } = copyState;
  const copyValue = useCallback(() => copy(value), [copy, value]);
  const { targetProps } = reveal;
  const ref = useMemo(() => mergeRefs(targetProps.ref, forwardedRef), [targetProps.ref, forwardedRef]);

  const context = useMemo<CopyFieldContextValue>(
    () => ({
      ...copyState,
      label,
      labelId,
      valueId,
      revealed: reveal.visible,
      revealReason: reveal.reason,
      messages,
      displayValue: getDisplayValue(value),
      displayStatus,
      copyValue,
    }),
    [copyState, label, labelId, valueId, reveal.visible, reveal.reason, messages, value, displayStatus, copyValue],
  );

  const { state } = copyState;
  const announcement =
    state.status === 'copied' ? messages.copied : state.status === 'error' ? messages.error(state.error) : '';

  return (
    <CopyFieldContext.Provider value={context}>
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
    </CopyFieldContext.Provider>
  );
});

/* ----------------------------------------------------------- Label/Value */

export type CopyFieldLabelProps = HTMLAttributes<HTMLSpanElement>;

const Label = /* @__PURE__ */ forwardRef<HTMLSpanElement, CopyFieldLabelProps>(function CopyFieldLabel(
  { children, ...rest },
  ref,
) {
  const field = useCopyField();
  return (
    <span {...rest} ref={ref} id={field.labelId}>
      {children ?? field.label}
    </span>
  );
});

export type CopyFieldValueProps = HTMLAttributes<HTMLSpanElement>;

const Value = /* @__PURE__ */ forwardRef<HTMLSpanElement, CopyFieldValueProps>(function CopyFieldValue(
  { children, ...rest },
  ref,
) {
  const field = useCopyField();
  return (
    <span {...rest} ref={ref} id={field.valueId}>
      {children ?? field.displayValue}
    </span>
  );
});

/* --------------------------------------------------------------- Trigger */

export interface CopyFieldTriggerRenderProps {
  /** The real state. Use for logic. */
  readonly status: CopyStatus;
  /** Flicker-free state. Use for what you render. */
  readonly displayStatus: CopyStatus;
  readonly state: CopyState;
  readonly revealed: boolean;
  readonly canRetry: boolean;
}

export interface CopyFieldTriggerProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'type'> {
  /** Static content, or a render function receiving the live state (icons, labels, spinners). */
  readonly children?: ReactNode | ((props: CopyFieldTriggerRenderProps) => ReactNode);
}

const DEFAULT_TRIGGER_TEXT: Readonly<Record<CopyStatus, string>> = {
  idle: 'Copy',
  copying: 'Copying…',
  copied: 'Copied',
  error: 'Retry',
};

const TRIGGER_STATUSES: readonly CopyStatus[] = ['idle', 'copying', 'copied', 'error'];

/**
 * Default label: every state's text is stacked in the same grid cell, so the
 * button is always as wide as its longest label and never resizes (no layout
 * shift). Only the active one is visible; the others crossfade out.
 */
function DefaultTriggerLabel({ status }: { readonly status: CopyStatus }) {
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  return (
    <span style={{ display: 'inline-grid' }}>
      {TRIGGER_STATUSES.map((candidate) => {
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
              ...(reduceMotion ? {} : { transition: 'opacity 150ms ease, visibility 150ms' }),
            }}
          >
            {DEFAULT_TRIGGER_TEXT[candidate]}
          </span>
        );
      })}
    </span>
  );
}

const Trigger = /* @__PURE__ */ forwardRef<HTMLButtonElement, CopyFieldTriggerProps>(function CopyFieldTrigger(
  { children, onClick, 'aria-label': ariaLabel, ...rest },
  ref,
) {
  const field = useCopyField();
  const renderProps: CopyFieldTriggerRenderProps = {
    status: field.status,
    displayStatus: field.displayStatus,
    state: field.state,
    revealed: field.revealed,
    canRetry: field.canRetry,
  };

  return (
    <button
      {...rest}
      ref={ref}
      // Never `disabled` while copying: disabling a focused button drops keyboard focus.
      type="button"
      aria-label={ariaLabel ?? field.messages.triggerLabel(field.label)}
      data-state={field.status}
      data-display-state={field.displayStatus}
      data-revealed={field.revealed ? '' : undefined}
      onClick={composeEventHandlers(onClick, () => {
        void field.copyValue();
      })}
    >
      {typeof children === 'function'
        ? children(renderProps)
        : (children ?? <DefaultTriggerLabel status={field.displayStatus} />)}
    </button>
  );
});

/**
 * Headless compound component for a labelled, copyable value.
 *
 * Styling hooks on Root and Trigger:
 * - `data-display-state="idle|copying|copied|error"`: flicker-free, style with this
 * - `data-state`: the real, instantaneous state, for logic and tests
 * - `data-revealed`: present while the trigger should be visible
 */
export const CopyField = { Root, Label, Value, Trigger } as const;
