import { CopyFailure, createCopyError, type CopyErrorType } from './errors';
import { legacyCopy, legacyEntries } from './legacy-copy';
import type { OperationContext } from './machine-shared';
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
  /** For the `execCommand('copy')` fallback; `window` has it. */
  readonly document?: Document | undefined;
  readonly navigator?: { readonly clipboard?: ClipboardLike | undefined } | undefined;
  readonly ClipboardItem?: ClipboardItemConstructorLike | undefined;
}

/**
 * The only thing the state machine needs. Implement it to target Electron,
 * a native bridge, a test double, or anything else.
 *
 * Contract: start the platform write synchronously (before any `await`) so the
 * browser still sees the user gesture, and reject with a `CopyFailure` when you
 * can classify the error. `context.signal` aborts when the copy is reset or its
 * host unmounts; honour it to stop expensive work early.
 */
export interface ClipboardAdapter {
  write(payload: CopyPayload, context?: OperationContext): Promise<void>;
  /**
   * Optional: write text that is still being produced (an async copy source), starting the
   * platform write now so the user's gesture is kept. Without it, the machine waits for the
   * text and calls `write`, which suits clipboards with no gesture rules (Electron, tests).
   */
  writeDeferred?(text: Promise<string>, context?: OperationContext): Promise<void>;
}

export interface BrowserClipboardAdapterOptions {
  /** Defaults to `window`, read lazily at copy time (SSR-safe). */
  readonly getEnvironment?: () => ClipboardEnvironment | undefined;
  /** When rich HTML copy is unavailable, fall back to its plain text. Default `true`. */
  readonly degradeHtmlToText?: boolean;
  /**
   * When the async Clipboard API is unavailable (a plain-HTTP page, a webview without
   * `navigator.clipboard`, no `ClipboardItem` for HTML), copy text, HTML and JSON through the
   * browser's `copy` command instead, as `react-copy-to-clipboard` does. Images still need the
   * async API. Default `true`; `false` reports `insecure-context` / `unsupported` instead.
   */
  readonly legacyFallback?: boolean;
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

async function resolveImageBlob(source: BlobSource, context: OperationContext | undefined): Promise<Blob> {
  let blob: unknown;
  try {
    // Invoked before the first await, i.e. synchronously inside the gesture.
    blob = await (typeof source === 'function' ? source(context ?? { signal: new AbortController().signal }) : source);
  } catch (cause) {
    if (context?.signal.aborted) throw fail('aborted', 'The image copy was cancelled.', cause);
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

async function writeImage(
  rich: RichClipboard,
  source: BlobSource,
  context: OperationContext | undefined,
): Promise<void> {
  if (!isTypeSupported(rich.Item, IMAGE_MIME_TYPE)) {
    throw fail('unsupported-format', `This browser cannot write ${IMAGE_MIME_TYPE} to the clipboard.`);
  }
  // Hand ClipboardItem a *promise* so Safari keeps the gesture while the blob is produced.
  const blob = resolveImageBlob(source, context);
  blob.catch(noop); // Never an unhandled rejection, whichever side fails first.
  try {
    await rich.write([new rich.Item({ [IMAGE_MIME_TYPE]: blob })]);
  } catch (error) {
    // Browsers replace our classified reason with a generic DOMException. Prefer ours.
    const reason = await blob.then(noop, (inner: unknown) => inner);
    throw reason ?? error;
  }
  // Conforming browsers have consumed `blob` by now. Lax polyfills/webviews may resolve
  // without reading it: never report an image that failed to generate as copied.
  await blob;
}

async function writeToClipboard(
  payload: CopyPayload,
  env: ClipboardEnvironment | undefined,
  settings: Required<Omit<BrowserClipboardAdapterOptions, 'getEnvironment'>>,
  context: OperationContext | undefined,
): Promise<void> {
  if (!env) throw fail('unsupported', 'No browser environment: the clipboard only exists in the browser.');
  /** Without the async API: the copy command if it can carry this payload, else `failure`. */
  const legacy = (failure: unknown): void => {
    const entries = settings.legacyFallback && env.document ? legacyEntries(payload) : null;
    if (entries && legacyCopy(env.document as Document, entries)) return;
    throw failure;
  };
  /**
   * A write the browser refused with `NotAllowedError`, most often a permissions policy: a
   * Microsoft Teams tab, a SharePoint web part or a Storybook canvas is an iframe without
   * `allow="clipboard-write"`. The copy command is not gated by that policy, so it is tried while
   * the user's gesture is still fresh; when it cannot help, the browser's own error stands.
   */
  const orLegacy = (write: Promise<void>): Promise<void> =>
    write.catch((cause: unknown) => {
      if ((cause as { name?: unknown } | null)?.name !== 'NotAllowedError' || context?.signal.aborted === true) throw cause;
      legacy(cause);
    });
  if (env.isSecureContext === false) {
    legacy(fail('insecure-context', 'The Clipboard API requires a secure context (HTTPS or localhost).'));
    return;
  }
  const clipboard = env.navigator?.clipboard;
  if (!clipboard) {
    legacy(fail('unsupported', 'navigator.clipboard is not available in this browser.'));
    return;
  }

  switch (payload.kind) {
    case 'text':
    case 'json': {
      const text = payload.kind === 'text' ? payload.value : serializeJson(payload);
      if (typeof clipboard.writeText === 'function') return orLegacy(clipboard.writeText(text));
      legacy(fail('unsupported', 'navigator.clipboard.writeText() is not available.'));
      return;
    }

    case 'html': {
      const rich = getRichClipboard(env, clipboard);
      if (!rich || !isTypeSupported(rich.Item, 'text/html')) {
        const failure = fail('unsupported-format', 'Rich HTML copy requires ClipboardItem and navigator.clipboard.write().');
        try {
          legacy(failure);
          return;
        } catch {
          if (settings.degradeHtmlToText && typeof clipboard.writeText === 'function') return clipboard.writeText(payload.text);
          throw failure;
        }
      }
      return orLegacy(
        rich.write([
          new rich.Item({
          'text/html': new Blob([payload.html], { type: 'text/html' }),
            'text/plain': new Blob([payload.text], { type: 'text/plain' }),
          }),
        ]),
      );
    }

    case 'image': {
      const rich = getRichClipboard(env, clipboard);
      if (!rich) throw fail('unsupported-format', 'Image copy requires ClipboardItem and navigator.clipboard.write().');
      return writeImage(rich, payload.blob, context);
    }

    case 'multi': {
      const rich = getRichClipboard(env, clipboard);
      if (!rich) {
        legacy(fail('unsupported-format', 'Multi-format copy requires ClipboardItem and navigator.clipboard.write().'));
        return;
      }
      const record: Record<string, ClipboardItemData> = Object.create(null) as Record<string, ClipboardItemData>;
      let written = 0;
      for (const { mimeType, data, optional } of payload.items) {
        // Optional items need positive confirmation: an unknown type can make the whole write reject.
        if (optional === true && !(typeof rich.Item.supports === 'function' && rich.Item.supports(mimeType))) continue;
        if (!isTypeSupported(rich.Item, mimeType)) {
          throw fail('unsupported-format', `This browser cannot write "${mimeType}" to the clipboard.`);
        }
        record[mimeType] = typeof data === 'string' ? new Blob([data], { type: mimeType }) : data;
        written += 1;
      }
      if (written === 0) throw fail('unsupported-format', 'This browser can write none of the payload types.');
      return orLegacy(rich.write([new rich.Item(record)]));
    }
  }
}

/**
 * Text that is still being produced. Where `ClipboardItem` exists, the write starts now with a
 * *promise* of the text, so Safari keeps the user's gesture while it arrives. Elsewhere (and
 * when that write is refused), the text is awaited and written as usual: Chromium and Firefox
 * keep the gesture for several seconds, and the copy-command fallbacks still apply.
 */
async function writeDeferredText(
  text: Promise<string>,
  env: ClipboardEnvironment | undefined,
  settings: Required<Omit<BrowserClipboardAdapterOptions, 'getEnvironment'>>,
  context: OperationContext | undefined,
): Promise<void> {
  text.catch(noop); // Never an unhandled rejection, whichever side fails first.
  const afterwards = async (): Promise<void> => writeToClipboard({ kind: 'text', value: await text }, env, settings, context);
  const clipboard = env?.isSecureContext === false ? undefined : env?.navigator?.clipboard;
  const rich = env && clipboard ? getRichClipboard(env, clipboard) : null;
  if (!rich || !isTypeSupported(rich.Item, 'text/plain')) return afterwards();
  const blob = text.then((value) => new Blob([value], { type: 'text/plain' }));
  blob.catch(noop);
  try {
    await rich.write([new rich.Item({ 'text/plain': blob })]);
  } catch (error) {
    // The source's own failure explains more than the browser's generic one.
    const reason = await text.then(noop, (inner: unknown) => inner);
    // Refused (an embedded iframe): the plain write and its copy-command fallback.
    if (reason === undefined && (error as { name?: unknown } | null)?.name === 'NotAllowedError') return afterwards();
    throw reason ?? error;
  }
  // As for images: never report text that failed to arrive as copied.
  await text;
}

/** The default adapter: async Clipboard API with feature detection and honest errors. */
export function createBrowserClipboardAdapter(options: BrowserClipboardAdapterOptions = {}): ClipboardAdapter {
  const getEnvironment = options.getEnvironment ?? defaultEnvironment;
  const settings = { degradeHtmlToText: options.degradeHtmlToText ?? true, legacyFallback: options.legacyFallback ?? true };
  return {
    write: (payload, context) => writeToClipboard(payload, getEnvironment(), settings, context),
    writeDeferred: (text, context) => writeDeferredText(text, getEnvironment(), settings, context),
  };
}
