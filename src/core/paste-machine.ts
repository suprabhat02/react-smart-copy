import { CopyFailure, createCopyError, toCopyError, type CopyError, type CopyErrorType } from './errors';

// ---------------------------------------------------------------------------
// Paste result types
// ---------------------------------------------------------------------------

export interface TextPasteResult {
  readonly kind: 'text';
  readonly value: string;
}

export interface ImagePasteResult {
  readonly kind: 'image';
  readonly blob: Blob;
  readonly mimeType: string;
}

export interface RawPasteItem {
  readonly mimeType: string;
  /** String for text/* types, Blob for binary types. */
  readonly data: string | Blob;
}

export interface MultiPasteResult {
  readonly kind: 'multi';
  readonly items: readonly RawPasteItem[];
  /** Convenience: text/plain content if present in items. */
  readonly text: string | null;
}

export type PasteResult = TextPasteResult | ImagePasteResult | MultiPasteResult;
export type PasteResultKind = PasteResult['kind'];

// ---------------------------------------------------------------------------
// Paste state
// ---------------------------------------------------------------------------

export interface PasteIdleState {
  readonly status: 'idle';
}

export interface PasteReadingState {
  readonly status: 'reading';
}

export interface PasteReadState {
  readonly status: 'read';
  readonly result: PasteResult;
  /** Epoch ms when the read resolved. */
  readonly at: number;
}

export interface PasteErrorState {
  readonly status: 'error';
  readonly error: CopyError;
}

export type PasteState = PasteIdleState | PasteReadingState | PasteReadState | PasteErrorState;
export type PasteStatus = PasteState['status'];

export type PasteOutcome =
  | { readonly status: 'read'; readonly result: PasteResult }
  | { readonly status: 'error'; readonly error: CopyError }
  | { readonly status: 'ignored'; readonly reason: 'in-flight' };

// ---------------------------------------------------------------------------
// Adapter (mirrors ClipboardAdapter)
// ---------------------------------------------------------------------------

export interface PasteAdapter {
  read(accept?: readonly string[]): Promise<PasteResult>;
}

// ---------------------------------------------------------------------------
// Machine options
// ---------------------------------------------------------------------------

export const DEFAULT_PASTE_RESET_AFTER_MS = 0; // paste results don't auto-clear by default

export interface PasteMachineOptions {
  readonly adapter?: PasteAdapter;
  /**
   * MIME types to accept, in priority order. First supported type wins.
   * Defaults to `['text/plain']`.
   * Pass `['*']` or leave undefined for text-only fallback.
   */
  readonly accept?: readonly string[];
  /** Auto-reset `read` → `idle` after this many ms. `false`/`Infinity` disables (default). */
  readonly resetAfterMs?: number | false;
  readonly onPaste?: (result: PasteResult) => void;
  readonly onError?: (error: CopyError) => void;
  readonly now?: () => number;
}

export type PasteMachineOptionsSource = PasteMachineOptions | (() => PasteMachineOptions);

// ---------------------------------------------------------------------------
// Clipboard read adapter
// ---------------------------------------------------------------------------

function defaultPasteEnvironment() {
  return typeof window === 'undefined' ? undefined : window;
}

function resolveResetDelay(value: number | false | undefined): number | null {
  if (value === false || value === Infinity || value === undefined) return null;
  if (Number.isNaN(value)) return null;
  return Math.max(0, value);
}

function reportCallbackError(error: unknown): void {
  const scope = globalThis as { reportError?: (error: unknown) => void };
  if (typeof scope.reportError === 'function') {
    scope.reportError(error);
  } else {
    setTimeout(() => { throw error; }, 0);
  }
}

function invoke<A extends unknown[]>(fn: ((...a: A) => void) | undefined, ...args: A): void {
  if (!fn) return;
  try { fn(...args); } catch (e) { reportCallbackError(e); }
}

const fail = (type: CopyErrorType, message: string): CopyFailure =>
  new CopyFailure(createCopyError(type, message));

async function readFromBrowserClipboard(accept: readonly string[]): Promise<PasteResult> {
  const env = defaultPasteEnvironment();
  if (!env) {
    throw fail('unsupported', 'No browser environment: the clipboard only exists in the browser.');
  }
  if ((env as { isSecureContext?: boolean }).isSecureContext === false) {
    throw fail('insecure-context', 'The Clipboard API requires a secure context (HTTPS or localhost).');
  }

  const clipboard = (env as { navigator?: { clipboard?: unknown } }).navigator?.clipboard as {
    readText?: () => Promise<string>;
    read?: () => Promise<unknown[]>;
  } | undefined;

  if (!clipboard) {
    throw fail('unsupported', 'navigator.clipboard is not available in this browser.');
  }

  // Try rich read first (ClipboardItem) when caller wants more than plain text
  const wantsRich = accept.some((t) => t !== 'text/plain' && t !== 'text');

  interface ClipboardItemLike {
    readonly types: readonly string[];
    getType(t: string): Promise<Blob>;
  }

  if (wantsRich && typeof clipboard.read === 'function') {
    try {
      const items = (await clipboard.read()) as ClipboardItemLike[];
      const item: ClipboardItemLike | undefined = items[0];
      if (item !== undefined) {
        // Collect all available types for multi result
        const rawItems: RawPasteItem[] = [];
        let textContent: string | null = null;

        for (const mimeType of item.types) {
          // Only collect types the caller accepts (or all if accept contains '*')
          const accepted =
            accept.includes('*') ||
            accept.some((a) => a === mimeType || (a === 'image' && mimeType.startsWith('image/')));

          if (!accepted && !mimeType.startsWith('text/')) continue;

          try {
            const blob = await item.getType(mimeType);
            if (mimeType.startsWith('text/')) {
              const text = await blob.text();
              rawItems.push({ mimeType, data: text });
              if (mimeType === 'text/plain') textContent = text;
            } else {
              rawItems.push({ mimeType, data: blob });
            }
          } catch {
            // Skip unavailable types silently
          }
        }

        if (rawItems.length === 1) {
          const single: RawPasteItem | undefined = rawItems[0];
          if (single !== undefined) {
            if (single.mimeType === 'text/plain' && typeof single.data === 'string') {
              return { kind: 'text', value: single.data };
            }
            if (single.mimeType.startsWith('image/') && single.data instanceof Blob) {
              return { kind: 'image', blob: single.data, mimeType: single.mimeType };
            }
          }
        }

        if (rawItems.length > 0) {
          return { kind: 'multi', items: rawItems, text: textContent };
        }
      }
    } catch (cause) {
      // Fall through to readText if rich read fails (e.g. permission)
      if (
        typeof cause === 'object' &&
        cause !== null &&
        (cause as { name?: string }).name === 'NotAllowedError'
      ) {
        throw new CopyFailure(toCopyError(cause));
      }
    }
  }

  // Plain text fallback
  if (typeof clipboard.readText !== 'function') {
    throw fail('unsupported', 'navigator.clipboard.readText() is not available in this browser.');
  }

  let text: string;
  try {
    text = await clipboard.readText();
  } catch (cause) {
    throw new CopyFailure(toCopyError(cause));
  }
  return { kind: 'text', value: text };
}

export function createBrowserPasteAdapter(): PasteAdapter {
  return {
    read: (accept = ['text/plain']) => readFromBrowserClipboard(accept),
  };
}

// ---------------------------------------------------------------------------
// Paste machine
// ---------------------------------------------------------------------------

export interface PasteMachine {
  readonly getSnapshot: () => PasteState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly paste: () => Promise<PasteOutcome>;
  readonly reset: () => void;
  readonly connect: () => () => void;
}

export const PASTE_IDLE_STATE: PasteIdleState = /* @__PURE__ */ Object.freeze({ status: 'idle' });
const IGNORED_IN_FLIGHT: PasteOutcome = /* @__PURE__ */ Object.freeze({ status: 'ignored', reason: 'in-flight' });

export function createPasteMachine(options: PasteMachineOptionsSource = {}): PasteMachine {
  const read = typeof options === 'function' ? options : (): PasteMachineOptions => options;
  const listeners = new Set<() => void>();
  let state: PasteState = PASTE_IDLE_STATE;
  let generation = 0;
  let resetTimer: ReturnType<typeof setTimeout> | undefined;

  const now = (): number => (read().now ?? Date.now)();

  const setState = (next: PasteState): void => {
    if (next === state) return;
    state = next;
    for (const listener of Array.from(listeners)) listener();
  };

  const clearResetTimer = (): void => {
    if (resetTimer !== undefined) {
      clearTimeout(resetTimer);
      resetTimer = undefined;
    }
  };

  const scheduleReset = (readState: PasteReadState): void => {
    clearResetTimer();
    const delay = resolveResetDelay(read().resetAfterMs);
    if (delay === null) return;
    const remaining = Math.max(0, delay - (now() - readState.at));
    resetTimer = setTimeout(() => {
      resetTimer = undefined;
      if (state === readState) setState(PASTE_IDLE_STATE);
    }, remaining);
  };

  let defaultAdapter: PasteAdapter | undefined;
  const getAdapter = (): PasteAdapter =>
    read().adapter ?? (defaultAdapter ??= createBrowserPasteAdapter());

  const paste = (): Promise<PasteOutcome> => {
    if (state.status === 'reading') return Promise.resolve(IGNORED_IN_FLIGHT);

    clearResetTimer();
    const current = ++generation;
    setState({ status: 'reading' });

    const accept = read().accept ?? ['text/plain'];

    return getAdapter()
      .read(accept)
      .then(
        (result): PasteOutcome => {
          if (current !== generation) return { status: 'ignored', reason: 'in-flight' };
          const readState: PasteReadState = { status: 'read', result, at: now() };
          setState(readState);
          scheduleReset(readState);
          invoke(read().onPaste, result);
          return { status: 'read', result };
        },
        (cause: unknown): PasteOutcome => {
          const error = toCopyError(cause);
          if (current === generation) {
            setState({ status: 'error', error });
            invoke(read().onError, error);
          }
          return { status: 'error', error };
        },
      );
  };

  const reset = (): void => {
    ++generation;
    clearResetTimer();
    setState(PASTE_IDLE_STATE);
  };

  const connect = (): (() => void) => {
    if (state.status === 'read') scheduleReset(state);
    return () => {
      ++generation;
      clearResetTimer();
      if (state.status === 'reading') setState(PASTE_IDLE_STATE);
    };
  };

  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    paste,
    reset,
    connect,
  };
}
