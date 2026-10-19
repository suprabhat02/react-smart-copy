import { createBrowserClipboardAdapter, type ClipboardAdapter } from '../core/clipboard-adapter';
import { createCopyError, describeCopyError, toCopyError, type CopyError, type CopyErrorType } from '../core/errors';
import { normalizePayload, validatePayload, type CopyInput, type CopyPayload } from '../core/payload';
import { cleanTitle, DEFAULT_LINK_TITLE_LENGTH, linkPayload } from '../link/payload';
import { linkUrlResolver, type LinkUrlOptions } from '../link/url';

/** What to share: a link, a message, files, or any mix of them. */
export interface ShareContent {
  /** Validated like every link in this package: allowed schemes only, credentials removed. */
  readonly url?: string | URL;
  readonly title?: string;
  /** A message to share alongside (or instead of) the link. */
  readonly text?: string;
  /** Files for the share sheet, where the browser can share them (`navigator.canShare({ files })`). Never copied. */
  readonly files?: readonly File[];
}

/** The content after validation: what the share sheet or the clipboard receives. */
export interface ResolvedShare {
  readonly url: string | null;
  /** Cleaned of hidden characters; `null` when there is none. */
  readonly title: string | null;
  readonly text: string | null;
  readonly files: readonly File[];
}

/**
 * How to share:
 * - `auto` (default): the share sheet on phones and tablets, where people expect it; copy elsewhere.
 * - `native`: the share sheet wherever the browser has one (also desktop Safari, Edge and Chrome on Windows and macOS).
 * - `copy`: always copy.
 */
export type ShareMode = 'auto' | 'native' | 'copy';

export type ShareMethod = 'native' | 'copy';

/** Structural view of what sharing needs from the browser; `window` by default. */
export interface ShareEnvironment {
  readonly navigator?: {
    readonly share?: (data: ShareData) => Promise<void>;
    readonly canShare?: (data: ShareData) => boolean;
  };
  readonly matchMedia?: (query: string) => { readonly matches: boolean };
}

export interface ShareOptions extends LinkUrlOptions {
  /** Default `"auto"`. */
  readonly mode?: ShareMode;
  /** When the share sheet fails for a reason other than the user closing it, copy instead. Default `true`. */
  readonly fallback?: boolean;
  /**
   * What to copy. Default: a titled link (`linkPayload`) when there is a URL,
   * otherwise the text. Return a string or any copy payload.
   */
  readonly copy?: (content: ResolvedShare) => CopyInput;
  /** Default: the browser Clipboard API, as `useCopy` uses. */
  readonly adapter?: ClipboardAdapter;
  /** Default: `window`. For tests, webviews and other hosts. */
  readonly environment?: ShareEnvironment;
  /** Aborting it stops a copy in progress; the share sheet itself can only be closed by the user. */
  readonly signal?: AbortSignal;
}

/**
 * Why the content was copied rather than shared: `preferred` (the mode chose
 * copy, as on desktop in `auto`), `unsupported` (no share sheet, or it can't
 * take this content) or `fallback` (the share sheet failed).
 */
export type CopyReason = 'preferred' | 'unsupported' | 'fallback';

/** What `shareOrCopy` resolves to. It never rejects. */
export type ShareOutcome =
  | { readonly status: 'shared'; readonly method: 'native'; readonly content: ResolvedShare }
  | { readonly status: 'copied'; readonly method: 'copy'; readonly reason: CopyReason; readonly payload: CopyPayload; readonly content: ResolvedShare }
  /** The user closed the share sheet. Nothing to report. */
  | { readonly status: 'cancelled'; readonly method: 'native' }
  | { readonly status: 'error'; readonly method: ShareMethod; readonly error: CopyError };

/** Phones and tablets: a touch screen is the main input and nothing hovers. */
export const TOUCH_FIRST = '(hover: none) and (pointer: coarse)';

const defaultEnvironment = (): ShareEnvironment | undefined => (typeof window === 'undefined' ? undefined : window);

const invalid = (message: string): CopyError => createCopyError('invalid-payload', message);

/** Validates and cleans what to share, or returns the typed error for invalid input. */
function resolveContent(content: ShareContent, options: LinkUrlOptions): ResolvedShare | CopyError {
  const value: unknown = content;
  if (typeof value !== 'object' || value === null) return invalid('Share content must be an object with a url, text or files.');
  const { url, title, text, files } = value as Record<string, unknown>;
  let href: string | null = null;
  if (url !== undefined && url !== null) {
    try {
      href = linkUrlResolver(options)(url as string | URL);
    } catch (error) {
      return toCopyError(error);
    }
  }
  if (title !== undefined && typeof title !== 'string') return invalid('`title` must be a string.');
  if (text !== undefined && typeof text !== 'string') return invalid('`text` must be a string.');
  const list: unknown = files ?? [];
  if (!Array.isArray(list) || !list.every((file: unknown) => typeof File !== 'undefined' && file instanceof File)) {
    return invalid('`files` must be a list of File objects.');
  }
  const cleanName = title === undefined ? '' : cleanTitle(title, DEFAULT_LINK_TITLE_LENGTH);
  const message = text === undefined || text.trim() === '' ? null : text;
  if (href === null && message === null && list.length === 0) return invalid('There is nothing to share: give a url, text or files.');
  return { url: href, title: cleanName === '' ? null : cleanName, text: message, files: list as File[] };
}

/** The `ShareData` the browser receives: only the fields that are set. */
function shareData(content: ResolvedShare): ShareData {
  return {
    ...(content.url === null ? {} : { url: content.url }),
    ...(content.title === null ? {} : { title: content.title }),
    ...(content.text === null ? {} : { text: content.text }),
    ...(content.files.length === 0 ? {} : { files: [...content.files] }),
  };
}

/** Whether this browser can open its share sheet for `data`. */
function canShareNatively(environment: ShareEnvironment | undefined, data: ShareData | null): boolean {
  const nav = environment?.navigator;
  if (typeof nav?.share !== 'function') return false;
  if (data === null) return true;
  // Without canShare (older Safari), only links and text can be shared.
  return typeof nav.canShare === 'function' ? nav.canShare(data) : data.files === undefined;
}

function isTouchFirst(environment: ShareEnvironment | undefined): boolean {
  return typeof environment?.matchMedia === 'function' && environment.matchMedia(TOUCH_FIRST).matches;
}

function resolveMode(mode: unknown): ShareMode | CopyError {
  if (mode === undefined) return 'auto';
  return mode === 'auto' || mode === 'native' || mode === 'copy' ? mode : invalid('`mode` must be "auto", "native" or "copy".');
}

/**
 * How {@link shareOrCopy} would share right now: `"native"` (the share sheet) or
 * `"copy"`. Use it to label the button ("Share…" or "Copy link"). Pass the
 * content when it has files, since not every share sheet takes them.
 */
export function shareMethod(options: Pick<ShareOptions, 'mode' | 'environment'> = {}, content?: ShareContent): ShareMethod {
  const mode = resolveMode(options.mode);
  if (typeof mode !== 'string' || mode === 'copy') return 'copy';
  const environment = options.environment ?? defaultEnvironment();
  if (mode === 'auto' && !isTouchFirst(environment)) return 'copy';
  const resolved = content === undefined ? null : resolveContent(content, {});
  const data = resolved === null ? null : 'type' in resolved ? undefined : shareData(resolved);
  return data !== undefined && canShareNatively(environment, data) ? 'native' : 'copy';
}

/** The default copy: a titled link when there is a URL, otherwise the text (one of them is always set here). */
function defaultCopy(content: ResolvedShare): CopyInput {
  if (content.url !== null) return linkPayload({ url: content.url, ...(content.title === null ? {} : { title: content.title }) });
  return content.text as string;
}

async function copyContent(content: ResolvedShare, reason: CopyReason, options: ShareOptions): Promise<ShareOutcome> {
  if (options.copy === undefined && content.url === null && content.text === null) {
    return { status: 'error', method: 'copy', error: createCopyError('unsupported-format', 'Files can only be shared through a share sheet, and this browser has none for them.') };
  }
  let payload: CopyPayload;
  try {
    payload = normalizePayload((options.copy ?? defaultCopy)(content));
  } catch (error) {
    return { status: 'error', method: 'copy', error: toCopyError(error) };
  }
  const problem = validatePayload(payload);
  if (problem !== null) return { status: 'error', method: 'copy', error: problem };
  if (options.signal?.aborted === true) return { status: 'error', method: 'copy', error: createCopyError('aborted', 'The share was aborted.') };
  try {
    await (options.adapter ?? createBrowserClipboardAdapter()).write(payload, options.signal === undefined ? undefined : { signal: options.signal });
  } catch (error) {
    return { status: 'error', method: 'copy', error: toCopyError(error) };
  }
  return { status: 'copied', method: 'copy', reason, payload, content };
}

/**
 * Shares through the device's share sheet where people expect one, and copies a
 * titled link everywhere else. Call it directly in a click handler: the share
 * sheet needs the user's gesture.
 *
 * It never rejects. It resolves to `shared`, `copied` (with why), `cancelled`
 * (the user closed the share sheet: nothing to report) or `error` with a typed
 * {@link CopyError}.
 *
 * @example
 * button.addEventListener('click', async () => {
 *   const outcome = await shareOrCopy({ url: location.href, title: document.title });
 *   if (outcome.status === 'copied') toast('Link copied');
 * });
 */
export async function shareOrCopy(content: ShareContent, options: ShareOptions = {}): Promise<ShareOutcome> {
  const mode = resolveMode(options.mode);
  if (typeof mode !== 'string') return { status: 'error', method: 'copy', error: mode };
  const resolved = resolveContent(content, options);
  if ('type' in resolved) return { status: 'error', method: 'copy', error: resolved };
  const environment = options.environment ?? defaultEnvironment();
  if (mode === 'copy' || (mode === 'auto' && !isTouchFirst(environment))) return copyContent(resolved, 'preferred', options);
  const data = shareData(resolved);
  if (!canShareNatively(environment, data)) return copyContent(resolved, 'unsupported', options);
  try {
    // Called before any await: the share sheet needs the click's user activation.
    await (environment?.navigator?.share as (data: ShareData) => Promise<void>)(data);
    return { status: 'shared', method: 'native', content: resolved };
  } catch (error) {
    if (readName(error) === 'AbortError') return { status: 'cancelled', method: 'native' };
    if (options.fallback === false) return { status: 'error', method: 'native', error: shareError(error) };
    return copyContent(resolved, 'fallback', options);
  }
}

function readName(error: unknown): string | undefined {
  const name: unknown = typeof error === 'object' && error !== null ? (error as { name?: unknown }).name : undefined;
  return typeof name === 'string' ? name : undefined;
}

/** Classifies a share sheet failure. */
function shareError(cause: unknown): CopyError {
  switch (readName(cause)) {
    case 'NotAllowedError':
      return createCopyError('permission-denied', 'The share sheet was blocked: it needs a click, and an iframe needs the web-share permission.', cause);
    case 'InvalidStateError':
      return createCopyError('unknown', 'Another share sheet is already open.', cause);
    case 'DataError':
    case 'TypeError':
      return createCopyError('unsupported-format', 'The share sheet rejected this content.', cause);
    default:
      return toCopyError(cause);
  }
}

const SHARE_DESCRIPTIONS: Partial<Readonly<Record<CopyErrorType, string>>> = {
  'permission-denied': "Sharing isn't allowed here.",
  'unsupported-format': "This can't be shared from this browser.",
  timeout: 'Sharing took too long. Try again.',
};

/**
 * Default English, user-facing sentence for a failed share: a share sheet
 * failure is described as sharing, a failed copy as copying. Replace for i18n.
 */
export function describeShareError(error: CopyError, method: ShareMethod): string {
  if (method === 'copy') return describeCopyError(error);
  return SHARE_DESCRIPTIONS[error.type] ?? "Couldn't share. Try again.";
}
