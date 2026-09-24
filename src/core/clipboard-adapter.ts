import { CopyFailure, createCopyError, type CopyErrorType } from './errors';
import { IMAGE_MIME_TYPE, isBlob, serializeJson, type BlobSource, type CopyPayload } from './payload';

/** Minimal structural view of `navigator.clipboard`, so fakes and polyfills fit. */
export interface ClipboardLike {
  writeText?(text: string): Promise<void>;
  write?(items: readonly unknown[]): Promise<void>;
}

export type ClipboardItemData = Blob | PromiseLike<Blob>;

export interface ClipboardItemConstructorLike {
  new (items: Record<string, ClipboardItemData>): unknown;
  supports?(type: string): boolean;
}

export interface ClipboardEnvironment {
  readonly isSecureContext?: boolean;
  readonly navigator?: { readonly clipboard?: ClipboardLike | undefined } | undefined;
  readonly ClipboardItem?: ClipboardItemConstructorLike | undefined;
}

/**
 * The only thing the state machine needs. Implement it to target Electron,
 * a native bridge, a test double, or anything else.
 *
 * Contract: start the platform write synchronously (before any `await`) so the
 * browser still sees the user gesture, and reject with a `CopyFailure` when you
 * can classify the error.
 */
export interface ClipboardAdapter {
  write(payload: CopyPayload): Promise<void>;
}

export interface BrowserClipboardAdapterOptions {
  /** Defaults to `window`, read lazily at copy time (SSR-safe). */
  readonly getEnvironment?: () => ClipboardEnvironment | undefined;
  /** When rich HTML copy is unavailable, fall back to its plain text. Default `true`. */
  readonly degradeHtmlToText?: boolean;
}

interface RichClipboard {
  readonly Item: ClipboardItemConstructorLike;
  readonly write: (items: readonly unknown[]) => Promise<void>;
}

const fail = (type: CopyErrorType, message: string, cause?: unknown): CopyFailure =>
  new CopyFailure(createCopyError(type, message, cause));

const noop = (): void => undefined;

function defaultEnvironment(): ClipboardEnvironment | undefined {
  return typeof window === 'undefined' ? undefined : window;
}

function getRichClipboard(env: ClipboardEnvironment, clipboard: ClipboardLike): RichClipboard | null {
  const Item = env.ClipboardItem;
  if (!Item || typeof clipboard.write !== 'function') return null;
  return { Item, write: clipboard.write.bind(clipboard) };
}

function isTypeSupported(Item: ClipboardItemConstructorLike, type: string): boolean {
  return typeof Item.supports !== 'function' || Item.supports(type);
}

function writeText(clipboard: ClipboardLike, text: string): Promise<void> {
  if (typeof clipboard.writeText !== 'function') {
    throw fail('unsupported', 'navigator.clipboard.writeText() is not available.');
  }
  return clipboard.writeText(text);
}

async function resolveImageBlob(source: BlobSource): Promise<Blob> {
  let blob: unknown;
  try {
    // Invoked before the first await, i.e. synchronously inside the gesture.
    blob = await (typeof source === 'function' ? source() : source);
  } catch (cause) {
    throw fail('blob-generation-failed', 'The image source threw or rejected while producing a Blob.', cause);
  }
  if (!isBlob(blob)) throw fail('blob-generation-failed', 'The image source did not produce a Blob.');
  if (blob.type !== IMAGE_MIME_TYPE) {
    throw fail(
      'unsupported-format',
      `Only ${IMAGE_MIME_TYPE} can be written to the clipboard (received "${blob.type || 'unknown'}"). ` +
        `Convert with canvas.toBlob(cb, "${IMAGE_MIME_TYPE}").`,
    );
  }
  return blob;
}

async function writeImage(rich: RichClipboard, source: BlobSource): Promise<void> {
  if (!isTypeSupported(rich.Item, IMAGE_MIME_TYPE)) {
    throw fail('unsupported-format', `This browser cannot write ${IMAGE_MIME_TYPE} to the clipboard.`);
  }
  // Hand ClipboardItem a *promise* so Safari keeps the gesture while the blob is produced.
  const blob = resolveImageBlob(source);
  blob.catch(noop); // Never an unhandled rejection, whichever side fails first.
  try {
    await rich.write([new rich.Item({ [IMAGE_MIME_TYPE]: blob })]);
  } catch (error) {
    // Browsers replace our classified reason with a generic DOMException. Prefer ours.
    const reason = await blob.then(noop, (inner: unknown) => inner);
    throw reason ?? error;
  }
}

async function writeToClipboard(
  payload: CopyPayload,
  env: ClipboardEnvironment | undefined,
  degradeHtmlToText: boolean,
): Promise<void> {
  if (!env) throw fail('unsupported', 'No browser environment: the clipboard only exists in the browser.');
  if (env.isSecureContext === false) {
    throw fail('insecure-context', 'The Clipboard API requires a secure context (HTTPS or localhost).');
  }
  const clipboard = env.navigator?.clipboard;
  if (!clipboard) throw fail('unsupported', 'navigator.clipboard is not available in this browser.');

  switch (payload.kind) {
    case 'text':
      return writeText(clipboard, payload.value);

    case 'json':
      return writeText(clipboard, serializeJson(payload));

    case 'html': {
      const rich = getRichClipboard(env, clipboard);
      if (!rich || !isTypeSupported(rich.Item, 'text/html')) {
        if (degradeHtmlToText) return writeText(clipboard, payload.text);
        throw fail('unsupported-format', 'Rich HTML copy requires ClipboardItem and navigator.clipboard.write().');
      }
      return rich.write([
        new rich.Item({
          'text/html': new Blob([payload.html], { type: 'text/html' }),
          'text/plain': new Blob([payload.text], { type: 'text/plain' }),
        }),
      ]);
    }

    case 'image': {
      const rich = getRichClipboard(env, clipboard);
      if (!rich) throw fail('unsupported-format', 'Image copy requires ClipboardItem and navigator.clipboard.write().');
      return writeImage(rich, payload.blob);
    }

    case 'multi': {
      const rich = getRichClipboard(env, clipboard);
      if (!rich) throw fail('unsupported-format', 'Multi-format copy requires ClipboardItem and navigator.clipboard.write().');
      const record: Record<string, ClipboardItemData> = {};
      for (const { mimeType, data } of payload.items) {
        if (!isTypeSupported(rich.Item, mimeType)) {
          throw fail('unsupported-format', `This browser cannot write "${mimeType}" to the clipboard.`);
        }
        record[mimeType] = typeof data === 'string' ? new Blob([data], { type: mimeType }) : data;
      }
      return rich.write([new rich.Item(record)]);
    }
  }
}

/** The default adapter: async Clipboard API with feature detection and honest errors. */
export function createBrowserClipboardAdapter(options: BrowserClipboardAdapterOptions = {}): ClipboardAdapter {
  const getEnvironment = options.getEnvironment ?? defaultEnvironment;
  const degradeHtmlToText = options.degradeHtmlToText ?? true;
  return {
    write: (payload) => writeToClipboard(payload, getEnvironment(), degradeHtmlToText),
  };
}
