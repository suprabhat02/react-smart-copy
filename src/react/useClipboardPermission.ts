import { useEffect, useState } from 'react';
import {
  watchClipboardPermission,
  type ClipboardPermissionName,
  type ClipboardPermissionState,
} from '../core/clipboard-permission';

export interface UseClipboardPermissionResult {
  /**
   * The permission, or `'checking'` until the browser answers. It is `'checking'` on the
   * server and on the first client render too, so hydration always matches.
   */
  readonly state: ClipboardPermissionState | 'checking';
}

/**
 * Follows a clipboard permission, so a paste button can say what to do instead of failing:
 *
 * ```tsx
 * const { state } = useClipboardPermission('read');
 * if (state === 'denied') return <p>Allow clipboard access in the address bar, then try again.</p>;
 * ```
 *
 * It never reads the clipboard and never shows a prompt. See `ClipboardPermissionState` for
 * what `'unsupported'` means. SSR-safe.
 */
export function useClipboardPermission(name: ClipboardPermissionName = 'read'): UseClipboardPermissionResult {
  const [state, setState] = useState<ClipboardPermissionState | 'checking'>('checking');
  useEffect(() => {
    setState('checking');
    return watchClipboardPermission(name, setState);
  }, [name]);
  return { state };
}
