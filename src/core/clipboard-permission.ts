import { copyFailure } from './errors';
import { invoke } from './machine-shared';

/** Which clipboard permission to ask about: reading (paste buttons) or writing (copy buttons). */
export type ClipboardPermissionName = 'read' | 'write';

/**
 * What the browser says about a clipboard permission.
 *
 * - `granted`: the permission is held; no prompt will show.
 * - `prompt`: the browser will ask the user when the page next uses the clipboard.
 * - `denied`: the user (or a policy) refused it. The page cannot ask again; only the user can change it.
 * - `unsupported`: this browser cannot say. Firefox and Safari have no `clipboard-read` or `clipboard-write`
 *   permission to query, and nothing can be asked before the page runs in a browser or in a secure context.
 *   It is *not* a refusal: the clipboard may well work.
 */
export type ClipboardPermissionState = 'granted' | 'prompt' | 'denied' | 'unsupported';

interface PermissionStatusLike {
  readonly state: unknown;
  addEventListener(type: 'change', listener: () => void): void;
  removeEventListener(type: 'change', listener: () => void): void;
}

interface PermissionsLike {
  query(descriptor: { readonly name: string }): Promise<PermissionStatusLike>;
}

/** Only these two names ever reach `permissions.query`, whatever a caller passes. */
function descriptorFor(name: ClipboardPermissionName): { readonly name: string } {
  switch (name) {
    case 'read':
      return { name: 'clipboard-read' };
    case 'write':
      return { name: 'clipboard-write' };
    default:
      throw copyFailure('invalid-payload', `Clipboard permission \`${String(name)}\` must be 'read' or 'write'.`);
  }
}

function toState(value: unknown): ClipboardPermissionState {
  return value === 'granted' || value === 'prompt' || value === 'denied' ? value : 'unsupported';
}

/** The permission status, or `undefined` when this browser cannot say. Never rejects. */
async function queryStatus(name: ClipboardPermissionName): Promise<PermissionStatusLike | undefined> {
  const descriptor = descriptorFor(name);
  const permissions = (globalThis as { navigator?: { permissions?: PermissionsLike } }).navigator?.permissions;
  if (permissions === undefined) return undefined;
  try {
    return await permissions.query(descriptor);
  } catch {
    return undefined;
  }
}

/**
 * Whether the page may read or write the clipboard, without using it. It never reads the
 * clipboard, never shows a prompt and never rejects for a browser that cannot tell: that is
 * `'unsupported'`.
 *
 * @throws {CopyFailure} of type `invalid-payload` when `name` is neither `'read'` nor `'write'`.
 */
export async function readClipboardPermission(name: ClipboardPermissionName = 'read'): Promise<ClipboardPermissionState> {
  return toState((await queryStatus(name))?.state);
}

/**
 * Calls `onChange` with the permission now and again each time the user changes it (in the
 * address bar, in settings). The first call is always asynchronous, and only changes are
 * reported after it. Returns the function that stops listening; stopping before the first
 * answer arrives leaves nothing behind. A throwing `onChange` is reported, not swallowed.
 *
 * @throws {CopyFailure} of type `invalid-payload` when `name` is neither `'read'` nor `'write'`.
 */
export function watchClipboardPermission(
  name: ClipboardPermissionName,
  onChange: (state: ClipboardPermissionState) => void,
): () => void {
  descriptorFor(name);
  let active = true;
  let status: PermissionStatusLike | undefined;
  let last: ClipboardPermissionState | undefined;
  const report = (): void => {
    const state = toState(status?.state);
    if (!active || state === last) return;
    last = state;
    invoke(onChange, state);
  };
  void queryStatus(name).then((found) => {
    if (!active) return;
    status = found;
    status?.addEventListener('change', report);
    report();
  });
  return () => {
    active = false;
    status?.removeEventListener('change', report);
  };
}
