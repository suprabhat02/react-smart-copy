import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ClipboardEventHandler,
  type DragEventHandler,
} from 'react';
import type { CopyError } from '../core/errors';
import {
  PASTE_IDLE_STATE,
  canRetryPasteState,
  createPasteMachine,
  type PasteMachine,
  type PasteMachineOptions,
  type PasteState,
  type PasteStatus,
} from '../core/paste-machine';
import { canAcceptDrag, resolvePasteReadOptions, type DataTransferLike, type PasteResult } from '../core/paste-reader';
import { useIsomorphicLayoutEffect } from './utils';

export interface UsePasteOptions extends PasteMachineOptions {
  /**
   * Also handle Ctrl/⌘+V anywhere on the page (chat-style "paste a screenshot").
   * Events an element already handled (`defaultPrevented`) are skipped. Default `false`.
   */
  readonly listenOnDocument?: boolean;
}

export interface PasteTargetProps<T extends Element> {
  readonly onPaste: ClipboardEventHandler<T>;
}

export interface PasteDropTargetProps<T extends Element> {
  readonly onDragEnter: DragEventHandler<T>;
  readonly onDragOver: DragEventHandler<T>;
  readonly onDragLeave: DragEventHandler<T>;
  readonly onDrop: DragEventHandler<T>;
}

export interface UsePasteResult<T extends Element = HTMLElement> {
  /** Full discriminated state; narrow on `state.status`. */
  readonly state: PasteState;
  readonly status: PasteStatus;
  /** The latest result while `status === 'read'`, otherwise `null`. */
  readonly result: PasteResult | null;
  readonly error: CopyError | null;
  /** Whether `retry()` can do anything right now. */
  readonly canRetry: boolean;
  /** Stable identity. Reads the clipboard from a user gesture. Never rejects. */
  readonly paste: PasteMachine['paste'];
  /** Stable identity. Handles a paste event you received yourself. Never rejects. */
  readonly pasteEvent: PasteMachine['pasteEvent'];
  /** Stable identity. Handles a drop event you received yourself. Never rejects. */
  readonly dropEvent: PasteMachine['dropEvent'];
  /** Stable identity. Re-reads the clipboard after a retryable failure, up to `maxRetries`. */
  readonly retry: PasteMachine['retry'];
  /** Stable identity. Back to `idle`, discarding and aborting any in-flight read. */
  readonly reset: PasteMachine['reset'];
  /** Spread onto an element (drop zone, textarea, editor) to accept Ctrl/⌘+V there. */
  readonly targetProps: PasteTargetProps<T>;
  /**
   * Spread onto one element to accept drag-and-drop there, through the same
   * `accept` and limits as paste. Only drags carrying accepted types show the
   * drop cursor. Separate from `targetProps` so text fields keep native drops.
   */
  readonly dropTargetProps: PasteDropTargetProps<T>;
  /** An accepted drag is over the `dropTargetProps` element. Style the drop zone with it. */
  readonly isDragOver: boolean;
}

const getServerSnapshot = (): PasteState => PASTE_IDLE_STATE;

/**
 * Paste state machine bound to a component. Supports a "Paste" button
 * (`paste()`, may prompt for permission), keyboard paste (`targetProps` or
 * `listenOnDocument`, no prompt) and drag-and-drop (`dropTargetProps`).
 * Options may change on every render.
 *
 * Everything in the result is untrusted user input.
 */
export function usePaste<T extends Element = HTMLElement>(options: UsePasteOptions = {}): UsePasteResult<T> {
  const optionsRef = useRef(options);
  useIsomorphicLayoutEffect(() => {
    optionsRef.current = options;
  });

  const [machine] = useState(() => createPasteMachine(() => optionsRef.current));
  useEffect(() => machine.connect(), [machine]);

  const listenOnDocument = options.listenOnDocument === true;
  useEffect(() => {
    if (!listenOnDocument) return undefined;
    const onPaste = (event: ClipboardEvent): void => {
      if (!event.defaultPrevented) void machine.pasteEvent(event);
    };
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('paste', onPaste);
    };
  }, [listenOnDocument, machine]);

  const state = useSyncExternalStore(machine.subscribe, machine.getSnapshot, getServerSnapshot);
  const canRetry = canRetryPasteState(state, options.maxRetries);

  const targetProps = useMemo<PasteTargetProps<T>>(
    () => ({
      onPaste: (event) => {
        void machine.pasteEvent(event);
      },
    }),
    [machine],
  );

  const [isDragOver, setIsDragOver] = useState(false);
  // dragenter/dragleave also fire for every child crossed; count them so moving inside doesn't flicker.
  const dragDepth = useRef(0);
  const dropTargetProps = useMemo<PasteDropTargetProps<T>>(() => {
    const accepts = (data: DataTransferLike): boolean => {
      try {
        return canAcceptDrag(data, resolvePasteReadOptions(optionsRef.current));
      } catch {
        return true; // Invalid options: let the drop through so it reports `invalid-payload`.
      }
    };
    return {
      onDragEnter: (event) => {
        dragDepth.current += 1;
        if (accepts(event.dataTransfer)) setIsDragOver(true);
      },
      onDragOver: (event) => {
        if (!accepts(event.dataTransfer)) return;
        event.preventDefault(); // Required for `drop` to fire.
        event.dataTransfer.dropEffect = 'copy';
      },
      onDragLeave: () => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setIsDragOver(false);
      },
      onDrop: (event) => {
        dragDepth.current = 0;
        setIsDragOver(false);
        void machine.dropEvent(event);
      },
    };
  }, [machine]);

  return useMemo(
    () => ({
      state,
      status: state.status,
      result: state.status === 'read' ? state.result : null,
      error: state.status === 'error' ? state.error : null,
      canRetry,
      paste: machine.paste,
      pasteEvent: machine.pasteEvent,
      dropEvent: machine.dropEvent,
      retry: machine.retry,
      reset: machine.reset,
      targetProps,
      dropTargetProps,
      isDragOver,
    }),
    [state, canRetry, machine, targetProps, dropTargetProps, isDragOver],
  );
}
