import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ClipboardEventHandler } from 'react';
import type { CopyError } from '../core/errors';
import {
  PASTE_IDLE_STATE,
  createPasteMachine,
  type PasteMachine,
  type PasteMachineOptions,
  type PasteState,
  type PasteStatus,
} from '../core/paste-machine';
import type { PasteResult } from '../core/paste-reader';
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

export interface UsePasteResult<T extends Element = HTMLElement> {
  /** Full discriminated state; narrow on `state.status`. */
  readonly state: PasteState;
  readonly status: PasteStatus;
  /** The latest result while `status === 'read'`, otherwise `null`. */
  readonly result: PasteResult | null;
  readonly error: CopyError | null;
  /** Stable identity. Reads the clipboard from a user gesture. Never rejects. */
  readonly paste: PasteMachine['paste'];
  /** Stable identity. Handles a paste event you received yourself. Never rejects. */
  readonly pasteEvent: PasteMachine['pasteEvent'];
  /** Stable identity. Back to `idle`, discarding any in-flight result. */
  readonly reset: PasteMachine['reset'];
  /** Spread onto an element (drop zone, textarea, editor) to accept Ctrl/⌘+V there. */
  readonly targetProps: PasteTargetProps<T>;
}

const getServerSnapshot = (): PasteState => PASTE_IDLE_STATE;

/**
 * Paste state machine bound to a component. Supports a "Paste" button
 * (`paste()`, may prompt for permission) and keyboard paste (`targetProps`
 * or `listenOnDocument`, no prompt). Options may change on every render.
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

  const targetProps = useMemo<PasteTargetProps<T>>(
    () => ({
      onPaste: (event) => {
        void machine.pasteEvent(event);
      },
    }),
    [machine],
  );

  return useMemo(
    () => ({
      state,
      status: state.status,
      result: state.status === 'read' ? state.result : null,
      error: state.status === 'error' ? state.error : null,
      paste: machine.paste,
      pasteEvent: machine.pasteEvent,
      reset: machine.reset,
      targetProps,
    }),
    [state, machine, targetProps],
  );
}
