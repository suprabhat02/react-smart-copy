import { describe, expectTypeOf, it } from 'vitest';
import type { CopyInterceptTransform } from '../../src/core';
import {
  pasteWithoutSecrets,
  redactSecrets,
  scanSecrets,
  secretRedactor,
  type RedactedText,
  type SecretFinding,
  type SecretKind,
  type SecretPasteOutcome,
  type SecretScan,
} from '../../src/secrets';

declare const paste: ClipboardEvent & { currentTarget: EventTarget | null };

describe('secrets types', () => {
  it('scans and redacts strings', () => {
    expectTypeOf(scanSecrets('x', { kinds: ['github-token', 'card-number'], minConfidence: 'high' })).toEqualTypeOf<SecretScan>();
    expectTypeOf(redactSecrets('x', { replace: (finding) => finding.masked })).toEqualTypeOf<RedactedText>();
    expectTypeOf<SecretScan['findings'][number]>().toEqualTypeOf<SecretFinding>();
    expectTypeOf<SecretFinding['kind']>().toEqualTypeOf<SecretKind>();
    // @ts-expect-error: not a kind
    void scanSecrets('x', { kinds: ['password'] });
    // @ts-expect-error: not a confidence
    void scanSecrets('x', { minConfidence: 'low' });
  });

  it('handles pastes and copies', () => {
    expectTypeOf(pasteWithoutSecrets(paste, { action: 'block' })).toEqualTypeOf<SecretPasteOutcome>();
    expectTypeOf(secretRedactor()).toEqualTypeOf<CopyInterceptTransform>();
    // @ts-expect-error: not an action
    void pasteWithoutSecrets(paste, { action: 'warn' });
  });
});
