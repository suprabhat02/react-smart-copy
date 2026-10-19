import { describe, expectTypeOf, it } from 'vitest';
import type { CopyError } from '../../src/core/errors';
import { useShare, type ShareStatus, type UseShareOutcome } from '../../src';
import { shareMethod, shareOrCopy, type ShareMethod, type ShareOutcome } from '../../src/share';

describe('share types', () => {
  it('returns typed outcomes', () => {
    expectTypeOf(shareOrCopy({ url: 'https://x' })).toEqualTypeOf<Promise<ShareOutcome>>();
    expectTypeOf(shareMethod()).toEqualTypeOf<ShareMethod>();
    expectTypeOf<Extract<ShareOutcome, { status: 'copied' }>['reason']>().toEqualTypeOf<'preferred' | 'unsupported' | 'fallback'>();
    expectTypeOf<Extract<ShareOutcome, { status: 'error' }>['error']>().toEqualTypeOf<CopyError>();
    // @ts-expect-error: not a mode
    void shareOrCopy({ url: 'https://x' }, { mode: 'sheet' });
    // @ts-expect-error: files must be Files
    void shareOrCopy({ files: ['a.jpg'] });
  });

  it('types the hook', () => {
    const result = useShare({ resetAfterMs: false, clean: true });
    expectTypeOf(result.status).toEqualTypeOf<ShareStatus>();
    expectTypeOf(result.method).toEqualTypeOf<ShareMethod>();
    expectTypeOf(result.share).returns.toEqualTypeOf<Promise<UseShareOutcome>>();
  });
});
