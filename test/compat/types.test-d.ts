import type { ComponentProps } from 'react';
import { describe, expectTypeOf, it } from 'vitest';
import type { CopyError } from '../../src/core';
import type { CopyToClipboard } from '../../src/compat';
import { compatPayload, type CopyFinishedOutcome, type CopyToClipboardOptions, type CopyToClipboardProps } from '../../src/compat';

describe('compat types', () => {
  it("has react-copy-to-clipboard's props, so a migration needs no type changes", () => {
    expectTypeOf<ComponentProps<typeof CopyToClipboard>>().toEqualTypeOf<CopyToClipboardProps>();
    expectTypeOf<CopyToClipboardProps['text']>().toEqualTypeOf<string>();
    expectTypeOf<CopyToClipboardOptions>().toEqualTypeOf<{
      readonly debug?: boolean | undefined;
      readonly message?: string | undefined;
      readonly format?: string | undefined;
    }>();
    // The original's two-argument callback still fits.
    expectTypeOf<(text: string, result: boolean) => void>().toExtend<NonNullable<CopyToClipboardProps['onCopy']>>();
  });

  it('adds the outcome, a written copy or a typed error, and nothing else', () => {
    expectTypeOf<CopyFinishedOutcome['status']>().toEqualTypeOf<'copied' | 'error'>();
    expectTypeOf<Extract<CopyFinishedOutcome, { status: 'error' }>['error']>().toEqualTypeOf<CopyError>();
    expectTypeOf(compatPayload).parameter(0).toEqualTypeOf<unknown>();
  });

  it('rejects what the original rejected', () => {
    // @ts-expect-error `text` is required.
    const missing: CopyToClipboardProps = {};
    // @ts-expect-error `text` is a string.
    const numeric: CopyToClipboardProps = { text: 42 };
    expectTypeOf(missing).toEqualTypeOf<CopyToClipboardProps>();
    expectTypeOf(numeric).toEqualTypeOf<CopyToClipboardProps>();
  });
});
