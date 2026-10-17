import type { ClipboardEvent as ReactClipboardEvent } from 'react';
import { describe, expectTypeOf, it } from 'vitest';
import type { PasteResult } from '../../src/core/paste-reader';
import {
  htmlToMarkdown,
  insertText,
  pasteAsMarkdown,
  pasteToMarkdown,
  type MarkdownResult,
  type PasteMarkdown,
} from '../../src/markdown';

describe('markdown types', () => {
  it('htmlToMarkdown takes strings and nodes', () => {
    expectTypeOf(htmlToMarkdown('<p>x</p>')).toEqualTypeOf<MarkdownResult>();
    expectTypeOf(htmlToMarkdown(document.body, { images: 'keep', bullet: '*', hardBreak: 'spaces' })).toEqualTypeOf<MarkdownResult>();
    // @ts-expect-error: not an option value
    htmlToMarkdown('x', { images: 'inline' });
    // @ts-expect-error: not a source
    htmlToMarkdown(42);
  });

  it('pasteToMarkdown takes a PasteResult directly', () => {
    const result: PasteResult = { source: 'event', items: [], text: null, html: null, images: [], files: [], imageFiles: [] };
    expectTypeOf(pasteToMarkdown(result)).toEqualTypeOf<PasteMarkdown | null>();
    expectTypeOf(pasteToMarkdown({ html: '<b>x</b>' }, { codeAsText: false })).toEqualTypeOf<PasteMarkdown | null>();
  });

  it('pasteAsMarkdown is a React onPaste handler and a DOM listener', () => {
    expectTypeOf(pasteAsMarkdown).toExtend<(event: ReactClipboardEvent<HTMLTextAreaElement>) => void>();
    document.addEventListener('paste', (event) => {
      pasteAsMarkdown(event);
    });
  });

  it('insertText takes text fields only', () => {
    expectTypeOf(insertText(document.createElement('textarea'), 'x')).toEqualTypeOf<boolean>();
    // @ts-expect-error: a div is not a text field
    insertText(document.createElement('div'), 'x');
  });
});
