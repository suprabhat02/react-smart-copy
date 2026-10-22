/**
 * `react-smart-copy/secrets`
 *
 * Keep secrets from travelling through the clipboard: find API keys, tokens, private keys,
 * passwords, card numbers and IBANs in text people paste or copy, and redact or block them.
 * Framework-agnostic and free of dependencies; works on servers too.
 *
 * - {@link scanSecrets}: where each secret is, its kind and confidence, and a masked preview.
 * - {@link redactSecrets}: the text with each secret replaced.
 * - {@link pasteWithoutSecrets}: a paste handler that redacts or blocks secrets, undo intact.
 * - {@link secretRedactor}: a `useCopyInterceptor` transform that redacts what people copy.
 *
 * @module
 */

export { pasteWithoutSecrets, type PasteWithoutSecretsOptions, type SecretPasteEvent, type SecretPasteOutcome } from './paste';
export { redactSecrets, secretRedactor, type RedactedText, type RedactSecretsOptions } from './redact';
export { DEFAULT_SECRET_SCAN_LENGTH, scanSecrets, type ScanSecretsOptions, type SecretScan } from './scan';
export { SECRET_KINDS, SECRET_LABELS, type SecretConfidence, type SecretFinding, type SecretKind } from './types';
