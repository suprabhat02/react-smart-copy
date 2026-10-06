import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import type { PasteOutcome, PasteState, PasteStatus } from '../core/paste-machine';
import { describePasteError, type CopyError } from '../core/errors';
import type { PasteResult } from '../core/paste-reader';
import { LiveRegion } from './LiveRegion';
import { TriggerLabel } from './TriggerLabel';
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
 * A focusable paste target. Accepts keyboard paste (Ctrl/⌘+V) without a
 * permission prompt and renders `data-zone` for styling.
 *
 * Accessible name: `aria-label` prop, else `messages.zoneLabel(label)`
 * ("Paste area for Notes"). Pass `aria-labelledby` explicitly to name it from
 * another element instead.
 */
const Zone = /* @__PURE__ */ forwardRef<HTMLDivElement, PasteFieldZoneProps>(function PasteFieldZone(
  { children, focusable = true, onPaste, 'aria-label': ariaLabel, tabIndex, ...rest },
  ref,
) {
  const field = usePasteField();
  const { targetProps } = field;

  // Guard: a custom `zoneLabel` returning '' must not leave the region unnamed.
  const safeAriaLabel =
    (ariaLabel ?? field.messages.zoneLabel(field.label)) || defaultPasteFieldMessages.zoneLabel(field.label);

  return (
    <div
      // Default shortcut hint; a consumer value in `rest` overrides it.
      aria-keyshortcuts="Control+V Meta+V"
      {...rest}
      ref={ref}
      id={field.zoneId}
      role="region"
      aria-label={safeAriaLabel}
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
  /** Whether `retry()` could help after the current error. */
  readonly canRetry: boolean;
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
    canRetry: field.canRetry,
  };

  const safeAriaLabel =
    (ariaLabel ?? field.messages.triggerLabel(field.label)) || defaultPasteFieldMessages.triggerLabel(field.label);

  return (
    <button
      {...rest}
      ref={ref}
      type="button"
      aria-label={safeAriaLabel}
      aria-busy={field.status === 'reading' ? true : undefined}
      data-state={field.status}
      data-display-state={field.displayStatus}
      data-revealed={field.revealed ? '' : undefined}
      onClick={composeEventHandlers(onClick, () => {
        void field.doPaste();
      })}
    >
      {typeof children === 'function'
        ? children(renderProps)
        : (children ?? <TriggerLabel status={field.displayStatus} labels={DEFAULT_TRIGGER_TEXT} />)}
    </button>
  );
});

/* ----------------------------------------------------------------- Preview */

export interface PasteFieldPreviewRenderProps {
  readonly result: PasteResult;
  /**
   * Object URLs for `result.images`, in order, revoked automatically. Empty on
   * the server and for the first render after a paste, until they are created.
   */
  readonly imageUrls: readonly string[];
}

export interface PasteFieldPreviewProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Custom rendering of the latest result. Replaces the default text / image / file preview. */
  readonly children?: (props: PasteFieldPreviewRenderProps) => ReactNode;
  /** Shown while there is no pasted result (idle, reading, error). */
  readonly placeholder?: ReactNode;
  /** Pasted text longer than this is cut and ends with "…". Default 2000. */
  readonly maxTextLength?: number;
  /** Alt text for each pasted image. Default "Pasted image 1 of 2". */
  readonly imageAlt?: (index: number, total: number) => string;
}

const NO_URLS: readonly string[] = [];

/**
 * Object URLs for blobs, revoked when the blobs change or the component
 * unmounts. URLs are only returned for the blobs they were made from, so they
 * never pair with the wrong result.
 */
function useObjectUrls(blobs: readonly Blob[] | undefined): readonly string[] {
  const [entry, setEntry] = useState<{ readonly blobs?: readonly Blob[]; readonly urls: readonly string[] }>({
    urls: NO_URLS,
  });
  useEffect(() => {
    if (!blobs?.length || typeof URL.createObjectURL !== 'function') return undefined;
    const urls = blobs.map((blob) => URL.createObjectURL(blob));
    setEntry({ blobs, urls });
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [blobs]);
  return entry.blobs === blobs ? entry.urls : NO_URLS;
}

const defaultImageAlt = (index: number, total: number): string => `Pasted image ${String(index + 1)} of ${String(total)}`;

/**
 * Shows what was pasted: text (never HTML, which is untrusted), image
 * thumbnails and file names. Renders `placeholder` until there is a result.
 * Pass a function child to render the result yourself.
 */
const Preview = /* @__PURE__ */ forwardRef<HTMLDivElement, PasteFieldPreviewProps>(function PasteFieldPreview(
  { children, placeholder = null, maxTextLength = 2000, imageAlt = defaultImageAlt, ...rest },
  ref,
) {
  const { result, status } = usePasteField();
  const imageUrls = useObjectUrls(result?.images);

  let content: ReactNode = placeholder;
  if (result) {
    if (children) {
      content = children({ result, imageUrls });
    } else {
      const { text } = result;
      const files = result.files.filter((file) => !file.type.startsWith('image/'));
      content = (
        <>
          {text ? (
            <pre data-preview-text="">{text.length > maxTextLength ? `${text.slice(0, maxTextLength)}…` : text}</pre>
          ) : null}
          {imageUrls.map((url, index) => (
            <img key={url} data-preview-image="" src={url} alt={imageAlt(index, imageUrls.length)} />
          ))}
          {files.length > 0 ? (
            <ul data-preview-files="">
              {files.map((file, index) => (
                <li key={`${String(index)}-${file.name}`}>{file.name}</li>
              ))}
            </ul>
          ) : null}
        </>
      );
    }
  }

  return (
    <div {...rest} ref={ref} data-preview="" data-state={status} data-empty={result ? undefined : ''}>
      {content}
    </div>
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
 *   <PasteField.Preview placeholder="Nothing pasted yet" />
 * </PasteField.Root>
 * ```
 */
export const PasteField = { Root, Label, Status, Zone, Trigger, Preview } as const;
