import { describe, expectTypeOf, it } from 'vitest';
import type { CopyInterceptTransform } from '../../src/core/copy-interceptor';
import type { HtmlPayload } from '../../src/core/payload';
import { prepareRich, richPayload, richTransform, type RichRemovalReason, type RichResult } from '../../src/rich';

describe('rich types', () => {
  it('takes elements, ranges, fragments and HTML text', () => {
    expectTypeOf(prepareRich(document.body)).toEqualTypeOf<RichResult>();
    expectTypeOf(prepareRich(document.createRange(), { colors: 'keep', images: 'alt' })).toEqualTypeOf<RichResult>();
    expectTypeOf(richPayload('<p>x</p>', { styles: 'inline', maxElements: 100 })).toEqualTypeOf<HtmlPayload>();
    expectTypeOf(richTransform()).toEqualTypeOf<CopyInterceptTransform>();
    expectTypeOf<RichResult['removed'][number]['reason']>().toEqualTypeOf<RichRemovalReason>();
    // @ts-expect-error: not a colour policy
    void prepareRich('<p>x</p>', { colors: 'dark' });
    // @ts-expect-error: not a source
    void prepareRich(42);
  });
});
