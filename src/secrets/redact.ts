import type { CopyInterceptTransform } from '../core/copy-interceptor';
import { scanSecrets, type ScanSecretsOptions } from './scan';
import type { SecretFinding } from './types';

export interface RedactSecretsOptions extends ScanSecretsOptions {
  /** What replaces each secret. Default: `[redacted <label>]`, as in `[redacted GitHub token]`. */
  readonly replace?: (finding: SecretFinding) => string;
}

export interface RedactedText {
  /** The text with each secret replaced. */
  readonly text: string;
  /** What was replaced, at its place in the original text. */
  readonly findings: readonly SecretFinding[];
  /** The text was longer than `maxLength`: the rest was neither scanned nor kept. */
  readonly truncated: boolean;
}

const defaultReplace = (finding: SecretFinding): string => `[redacted ${finding.label}]`;

/**
 * `text` with every secret {@link scanSecrets} finds replaced, by default with
 * `[redacted <label>]`. Text past `maxLength` is dropped, never passed on unscanned.
 *
 * @example
 * redactSecrets('token: ghp_...').text; // 'token: [redacted GitHub token]'
 */
export function redactSecrets(text: string, options: RedactSecretsOptions = {}): RedactedText {
  const { findings, truncated } = scanSecrets(text, options);
  const replace = options.replace ?? defaultReplace;
  let out = '';
  let at = 0;
  for (const finding of findings) {
    out += text.slice(at, finding.start) + replace(finding);
    at = finding.end;
  }
  const end = truncated ? (options.maxLength as number) : text.length;
  return { text: out + text.slice(at, end), findings, truncated };
}

/**
 * A transform for `useCopyInterceptor` and `registerCopyInterceptor`: when what people copy
 * from your page (logs, settings, a support console) holds secrets, the clipboard gets the
 * text with them redacted; other copies are left to the browser. The redacted copy is
 * plain text: formatting around a secret could carry it too.
 *
 * @example
 * useCopyInterceptor(logViewerRef, { transform: secretRedactor() });
 */
export function secretRedactor(options: RedactSecretsOptions = {}): CopyInterceptTransform {
  return (selection) => {
    const redacted = redactSecrets(selection.text, options);
    return redacted.findings.length === 0 && !redacted.truncated ? null : redacted.text;
  };
}
