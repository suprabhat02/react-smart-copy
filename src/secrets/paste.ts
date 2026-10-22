import { asTextField, insertText } from '../core/text-field';
import { redactSecrets, type RedactSecretsOptions } from './redact';
import type { SecretFinding } from './types';

/** What {@link pasteWithoutSecrets} did. */
export type SecretPasteOutcome =
  /** No secrets (or nothing to read): the browser pasted as usual. */
  | 'clean'
  /** The paste was inserted with its secrets redacted. */
  | 'redacted'
  /** The paste was stopped: nothing was inserted. */
  | 'blocked';

export interface PasteWithoutSecretsOptions extends RedactSecretsOptions {
  /**
   * `'redact'` (default) inserts the paste with its secrets replaced, into a `<textarea>` or
   * text `<input>`, with undo intact. `'block'` inserts nothing. Where text can't be inserted
   * (another element), a paste with secrets is blocked.
   */
  readonly action?: 'redact' | 'block';
  /** Called when a paste held secrets, with what was found and what was done. */
  readonly onSecrets?: (findings: readonly SecretFinding[], outcome: Exclude<SecretPasteOutcome, 'clean'>) => void;
}

/** Structural paste event: a DOM `ClipboardEvent` and React's `onPaste` event both fit. */
export interface SecretPasteEvent {
  readonly clipboardData: { getData(format: string): string } | null;
  readonly currentTarget: EventTarget | null;
  readonly target: EventTarget | null;
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}

/**
 * A paste handler that keeps secrets out of a field: chat boxes, comments, tickets and
 * forms where an API key or a password pasted by mistake would be seen or stored. A paste
 * without secrets is left to the browser.
 *
 * @example
 * <textarea onPaste={(event) => pasteWithoutSecrets(event, { onSecrets: (found) => toast(`Removed a ${found[0].label}.`) })} />
 */
export function pasteWithoutSecrets(event: SecretPasteEvent, options: PasteWithoutSecretsOptions = {}): SecretPasteOutcome {
  if (event.defaultPrevented || event.clipboardData === null) return 'clean';
  const text = event.clipboardData.getData('text/plain');
  if (text === '') return 'clean';
  const redacted = redactSecrets(text, options);
  if (redacted.findings.length === 0 && !redacted.truncated) return 'clean';
  event.preventDefault();
  const field = asTextField(event.currentTarget) ?? asTextField(event.target);
  const outcome = options.action !== 'block' && field !== null && insertText(field, redacted.text) ? 'redacted' : 'blocked';
  options.onSecrets?.(redacted.findings, outcome);
  return outcome;
}
