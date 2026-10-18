import type { ClipboardEvent as ReactClipboardEvent } from 'react';
import { describe, expectTypeOf, it } from 'vitest';
import type { HtmlPayload, TextPayload } from '../../src/core';
import type { PasteResult } from '../../src/core/paste-reader';
import {
  cleanCode,
  codeFromElement,
  codePayload,
  inspectCode,
  normalizeCode,
  pasteAsCode,
  pasteToCode,
  type CodeFinding,
  type CodeFindingKind,
  type PasteCode,
} from '../../src/code';

describe('code types', () => {
  it('codePayload takes strings and elements and returns a copy payload', () => {
    expectTypeOf(codePayload('x')).toEqualTypeOf<HtmlPayload | TextPayload>();
    expectTypeOf(codePayload(document.body, { language: 'ts', prompt: 'shell', diff: 'after', clean: ['invisible'] })).toEqualTypeOf<HtmlPayload | TextPayload>();
    // @ts-expect-error: not a source
    codePayload(42);
    // @ts-expect-error: not a prompt style
    codePayload('x', { prompt: 'zsh' });
    // @ts-expect-error: not a diff side
    codePayload('x', { diff: 'both' });
    // @ts-expect-error: not a finding kind
    normalizeCode('x', { clean: ['emoji'] });
    expectTypeOf(normalizeCode('x', { prompt: { command: /^% / } })).toEqualTypeOf<string>();
    expectTypeOf(codeFromElement(document.body)).toEqualTypeOf<string>();
  });

  it('findings are a closed union', () => {
    expectTypeOf<CodeFinding['kind']>().toEqualTypeOf<CodeFindingKind>();
    expectTypeOf(inspectCode('x').findings).toEqualTypeOf<readonly CodeFinding[]>();
    expectTypeOf(cleanCode('x').remaining[0]?.replacement).toEqualTypeOf<string | null | undefined>();
  });

  it('pasteToCode takes a PasteResult directly; pasteAsCode is an onPaste handler', () => {
    const result: PasteResult = { source: 'event', items: [], text: null, html: null, images: [], files: [], imageFiles: [] };
    expectTypeOf(pasteToCode(result)).toEqualTypeOf<PasteCode | null>();
    expectTypeOf(pasteAsCode).toExtend<(event: ReactClipboardEvent<HTMLTextAreaElement>) => boolean>();
    pasteAsCode({} as ReactClipboardEvent<HTMLTextAreaElement>, { onPaste: (pasted) => !pasted.danger });
    pasteAsCode({} as ReactClipboardEvent<HTMLTextAreaElement>, { onPaste: () => undefined });
    // @ts-expect-error: indent comes from the cursor
    pasteAsCode({} as ReactClipboardEvent<HTMLTextAreaElement>, { indent: '  ' });
  });
});
