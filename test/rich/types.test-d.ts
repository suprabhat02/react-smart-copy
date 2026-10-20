import { describe, expectTypeOf, it } from 'vitest';
import type { CopyInterceptTransform } from '../../src/core/copy-interceptor';
import type { HtmlPayload } from '../../src/core/payload';
import type { ClipboardEvent as ReactClipboardEvent } from 'react';
import {
  pasteAsRich,
  pasteToRich,
  prepareRich,
  RICH_PASTE_FORMATS,
  richPayload,
  richTransform,
  type RichPaste,
  type RichPasteFormat,
  type RichRemovalReason,
  type RichResult,
} from '../../src/rich';

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

  it('pastes from clipboard flavours, with typed formats, into editors and contenteditable', () => {
    expectTypeOf(pasteToRich({ html: '<p>x</p>', text: 'x' })).toEqualTypeOf<RichPaste | null>();
    expectTypeOf(pasteToRich({ html: null }, { formats: ['bold', 'list'], base: new URL('https://e.test'), maxNodes: 10 })).toEqualTypeOf<RichPaste | null>();
    expectTypeOf<RichPaste['source']>().toEqualTypeOf<'html' | 'text'>();
    expectTypeOf<RichPaste>().toExtend<RichResult>();
    expectTypeOf(RICH_PASTE_FORMATS).toEqualTypeOf<readonly RichPasteFormat[]>();
    // A React paste event and a DOM one both fit, as onPaste handlers.
    expectTypeOf(pasteAsRich).toBeCallableWith({} as ReactClipboardEvent<HTMLDivElement>);
    expectTypeOf(pasteAsRich).toBeCallableWith(new ClipboardEvent('paste'), { onPaste: (pasted: RichPaste) => pasted.html !== '' });
    expectTypeOf(pasteAsRich).returns.toEqualTypeOf<boolean>();
    // @ts-expect-error: not a format
    void pasteToRich({ html: '' }, { formats: ['blink'] });
    // @ts-expect-error: the copy-side options are not paste options
    void pasteToRich({ html: '' }, { colors: 'keep' });
  });
});
