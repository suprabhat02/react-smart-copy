import { describe, expectTypeOf, it } from 'vitest';
import type { ClipboardEvent as ReactClipboardEvent } from 'react';
import type { HtmlPayload, MultiPayload } from '../../src/core/payload';
import {
  linkPayload,
  readLink,
  resolveLink,
  selectionLink,
  textFragmentUrl,
  type LinkPasteEvent,
  type LinkTextFormat,
  type ResolvedLink,
  type SelectionLink,
} from '../../src/link';

describe('link types', () => {
  it('returns an HTML payload, or a multi payload for drag', () => {
    expectTypeOf(linkPayload('https://example.com')).toEqualTypeOf<HtmlPayload>();
    expectTypeOf(linkPayload({ url: 'https://example.com', title: 'x' }, { text: 'markdown', clean: true })).toEqualTypeOf<HtmlPayload>();
    expectTypeOf(linkPayload(new URL('https://example.com'), { target: 'drag' })).toEqualTypeOf<MultiPayload>();
    expectTypeOf<LinkTextFormat>().toEqualTypeOf<'url' | 'title' | 'title-and-url' | 'markdown'>();
    // @ts-expect-error: not a text format
    void linkPayload('https://x', { text: 'html' });
    // @ts-expect-error: a link needs a URL
    void linkPayload({ title: 'x' });
    // @ts-expect-error: not a payload target
    void linkPayload('https://x', { target: 'tab' });
  });

  it('reads and resolves typed links', () => {
    expectTypeOf(resolveLink(document.createElement('a'))).toEqualTypeOf<ResolvedLink>();
    expectTypeOf(readLink({ text: 'https://x' })).toEqualTypeOf<ResolvedLink | null>();
    expectTypeOf(selectionLink({ contextWords: 3 })).toEqualTypeOf<SelectionLink | null>();
    expectTypeOf(textFragmentUrl('https://x', { start: 'a', end: 'b' })).toEqualTypeOf<string>();
    // A DOM paste event and React's onPaste event both fit.
    expectTypeOf<ClipboardEvent>().toExtend<LinkPasteEvent>();
    expectTypeOf<ReactClipboardEvent<HTMLTextAreaElement>>().toExtend<LinkPasteEvent>();
    // @ts-expect-error: a fragment needs a start
    void textFragmentUrl('https://x', { end: 'b' });
  });
});
