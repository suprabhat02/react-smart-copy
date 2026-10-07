import { CopyFailure, copyFailure, toCopyError } from './errors';
import type { OperationContext } from './machine-shared';
import { matchesMimePattern } from './mime';
import {
  collectClipboardItems,
  enforcePasteLimits,
  finalizePaste,
  type ClipboardItemLike,
  type PasteEntry,
  type PasteReadResult,
  type ResolvedPasteReadOptions,
} from './paste-reader';

/** Minimal structural view of `navigator.clipboard` for reading. */
export interface PasteClipboardLike {
  read?(): Promise<readonly ClipboardItemLike[]>;
  readText?(): Promise<string>;
}

export interface PasteEnvironment {
  readonly isSecureContext?: boolean;
  readonly navigator?: { readonly clipboard?: PasteClipboardLike | undefined } | undefined;
}

/**
 * Reads the system clipboard. Implement it for Electron, a native bridge or tests.
 *
 * Contract: call the platform API synchronously (before any `await`) so the
 * browser still sees the user gesture, and reject with a `CopyFailure`.
 * `context.signal` aborts when the read is superseded, reset, or its host
 * unmounts; honour it to stop decoding early.
 */
export interface PasteAdapter {
  read(options: ResolvedPasteReadOptions, context?: OperationContext): Promise<PasteReadResult>;
}

export interface BrowserPasteAdapterOptions {
  /** Defaults to `window`, read lazily at paste time (SSR-safe). */
  readonly getEnvironment?: () => PasteEnvironment | undefined;
}

function defaultEnvironment(): PasteEnvironment | undefined {
  return typeof window === 'undefined' ? undefined : window;
}

type ClipboardWithRead = PasteClipboardLike & Required<Pick<PasteClipboardLike, 'read'>>;
type ClipboardWithReadText = PasteClipboardLike & Required<Pick<PasteClipboardLike, 'readText'>>;

const canRead = (clipboard: PasteClipboardLike): clipboard is ClipboardWithRead => typeof clipboard.read === 'function';
const canReadText = (clipboard: PasteClipboardLike): clipboard is ClipboardWithReadText =>
  typeof clipboard.readText === 'function';

async function readPlainText(clipboard: ClipboardWithReadText, options: ResolvedPasteReadOptions): Promise<PasteReadResult> {
  let text: string;
  try {
    text = await clipboard.readText();
  } catch (cause) {
    throw new CopyFailure(toCopyError(cause, 'read'));
  }
  const entries: PasteEntry[] = text.length > 0 ? [{ type: 'text/plain', data: text, file: false }] : [];
  enforcePasteLimits(entries, options);
  return finalizePaste(entries, 'clipboard', options);
}

async function readRich(
  clipboard: ClipboardWithRead,
  options: ResolvedPasteReadOptions,
  signal: AbortSignal | undefined,
): Promise<PasteReadResult> {
  let items: readonly ClipboardItemLike[];
  try {
    items = await clipboard.read();
  } catch (cause) {
    throw new CopyFailure(toCopyError(cause, 'read'));
  }
  const entries = await collectClipboardItems(items, options, signal);
  return finalizePaste(entries, 'clipboard', options);
}

function readFromClipboard(
  env: PasteEnvironment | undefined,
  options: ResolvedPasteReadOptions,
  signal: AbortSignal | undefined,
): Promise<PasteReadResult> {
  if (!env) throw copyFailure('unsupported', 'No browser environment: the clipboard only exists in the browser.');
  if (env.isSecureContext === false) {
    throw copyFailure('insecure-context', 'The Clipboard API requires a secure context (HTTPS or localhost).');
  }
  const clipboard = env.navigator?.clipboard;
  if (!clipboard) throw copyFailure('unsupported', 'navigator.clipboard is not available in this browser.');

  const plainOnly = options.accept.every((pattern) => pattern === 'text/plain');
  const acceptsPlain = options.accept.some((pattern) => matchesMimePattern('text/plain', pattern));

  // readText() has the widest support and the narrowest permission prompt: prefer it for plain text.
  if (canRead(clipboard) && !(plainOnly && canReadText(clipboard))) return readRich(clipboard, options, signal);
  if (canReadText(clipboard) && acceptsPlain) return readPlainText(clipboard, options);
  throw canReadText(clipboard)
    ? copyFailure('unsupported-format', 'Reading non-text clipboard content requires navigator.clipboard.read().')
    : copyFailure('unsupported', 'This browser cannot read the clipboard.');
}

/** The default paste adapter: async Clipboard API with feature detection and honest errors. */
export function createBrowserPasteAdapter(options: BrowserPasteAdapterOptions = {}): PasteAdapter {
  const getEnvironment = options.getEnvironment ?? defaultEnvironment;
  return {
    read: (resolved, context) => {
      try {
        return readFromClipboard(getEnvironment(), resolved, context?.signal);
      } catch (cause) {
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- always a CopyFailure
        return Promise.reject(cause);
      }
    },
  };
}
