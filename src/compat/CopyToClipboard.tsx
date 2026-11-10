import { Children, cloneElement, memo, useCallback, useRef, useState, type MemoExoticComponent, type MouseEvent, type ReactElement, type ReactNode } from 'react';
import { createBrowserClipboardAdapter } from '../core/clipboard-adapter';
import { createCopyMachine, type CopyOutcome } from '../core/copy-machine';
import { parseInertHtml } from '../core/inert-html';
import type { CopyPayload } from '../core/payload';
import { plainText } from '../rich/text';
import { useIsomorphicLayoutEffect, windowOf } from '../react/utils';

/** `react-copy-to-clipboard`'s `options`, as it typed them. */
export interface CopyToClipboardOptions {
  /** @deprecated Ignored. Failures reach `onCopy` with the reason; nothing is logged. */
  readonly debug?: boolean | undefined;
  /** @deprecated Ignored. No prompt is ever shown: a failed copy reports `false` to `onCopy`. */
  readonly message?: string | undefined;
  /**
   * `"text/html"` writes `text` as HTML, with its plain text alongside for targets that read only
   * text. Any other value, or none, writes `text` as plain text.
   */
  readonly format?: string | undefined;
}

export interface CopyToClipboardProps {
  /** What to copy. */
  readonly text: string;
  /**
   * One element; its click copies. It receives the other props you pass, as before, and its own
   * `onClick` still runs, in the same click.
   */
  readonly children?: ReactNode;
  /**
   * Called once the copy is written (`result` true) or has failed (`false`): after the click, not
   * during it, because the clipboard is written asynchronously. Still called if this component
   * has unmounted since (a menu that closes on click). `outcome` says why it failed
   * (`outcome.error.type`, and `describeCopyError(outcome.error)` for a message).
   */
  readonly onCopy?: ((text: string, result: boolean, outcome: CopyFinishedOutcome) => void) | undefined;
  readonly options?: CopyToClipboardOptions | undefined;
}

/** The outcome `onCopy` receives: written, or failed with a typed error. */
export type CopyFinishedOutcome = Extract<CopyOutcome, { status: 'copied' | 'error' }>;

type Clickable = ReactElement<{ onClick?: (event: MouseEvent) => void }>;

/** Props of this component, not passed on to the child. */
const OWN = new Set(['text', 'onCopy', 'options', 'children']);

/** Elements whose content a page never shows as text. */
const UNSHOWN = 'script, style, template, noscript, iframe, object, embed, [hidden]';

/** What `react-copy-to-clipboard` would have copied, as a payload this library writes. */
export function compatPayload(text: unknown, options: CopyToClipboardOptions | undefined): CopyPayload {
  // Typed as a string, but JavaScript callers pass numbers, as the original allowed. Anything else
  // (an object would have copied "[object Object]") copies nothing, and `onCopy` gets `false`.
  const value = typeof text === 'string' ? text : typeof text === 'number' || typeof text === 'bigint' || typeof text === 'boolean' ? String(text) : '';
  if (options?.format?.toLowerCase() !== 'text/html' || value === '') return { kind: 'text', value };
  // The original wrote only `text/html`, so plain-text targets (a terminal, an input) got nothing.
  const body = parseInertHtml(value).body;
  // What a page never shows is not text: a script's source or a style sheet would otherwise be.
  for (const hidden of Array.from(body.querySelectorAll(UNSHOWN))) hidden.remove();
  const fallback = plainText(body);
  return { kind: 'html', html: value, text: fallback === '' ? value : fallback };
}

function CopyToClipboardBase(props: CopyToClipboardProps): ReactElement {
  // As before: exactly one element, or React's own error, and every other prop goes to it.
  const child = Children.only(props.children) as Clickable;
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) if (!OWN.has(key)) rest[key] = value;

  const latest = useRef(props);
  useIsomorphicLayoutEffect(() => {
    latest.current = props;
  });
  // The window the click happened in, so a button in a pop-out window uses that window's clipboard.
  const target = useRef<Element | null>(null);
  const [machine] = useState(() =>
    createCopyMachine({
      adapter: createBrowserClipboardAdapter({ getEnvironment: () => windowOf(target.current) }),
      resetAfterMs: false,
    }),
  );
  // Not connected, on purpose: unmounting does not cancel a copy. A menu item that closes its menu
  // on click unmounts at once, and its `onCopy` must still say the text was copied, as it did.

  const onClick = useCallback(
    (event: MouseEvent) => {
      const { text, onCopy, options } = latest.current;
      target.current = event.currentTarget;
      // Started inside the click, so Safari counts the write as the user's action.
      const pending = machine.copy(compatPayload(text, options));
      // The child's own handler runs in the same click, so `preventDefault()` there still works.
      const own = (Children.only(latest.current.children) as Clickable).props.onClick;
      if (typeof own === 'function') own(event);
      void pending.then((outcome) => {
        // A click while the last copy is still being written writes nothing: that copy reports, once.
        if (outcome.status === 'ignored' || onCopy === undefined) return;
        onCopy(text, outcome.status === 'copied', outcome);
      });
    },
    [machine],
  );

  return cloneElement(child, { ...rest, onClick });
}

/**
 * A drop-in replacement for `react-copy-to-clipboard`'s `CopyToClipboard`: change the import, keep
 * the props. It copies through this library (the Clipboard API, with a fallback on plain HTTP and
 * in embedded apps), never shows a prompt, and tells `onCopy` why a copy failed.
 *
 * ```tsx
 * import { CopyToClipboard } from "react-smart-copy/compat";
 *
 * <CopyToClipboard text={invoiceId} onCopy={(text, ok) => setCopied(ok)}>
 *   <button type="button">Copy</button>
 * </CopyToClipboard>
 * ```
 */
export const CopyToClipboard: MemoExoticComponent<(props: CopyToClipboardProps) => ReactElement> = memo(CopyToClipboardBase);
