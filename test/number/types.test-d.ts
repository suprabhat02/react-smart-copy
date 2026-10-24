import type { ClipboardEvent as ReactClipboardEvent } from 'react';
import { describe, expectTypeOf, it } from 'vitest';
import type { TextPayload } from '../../src/core';
import {
  formatNumber,
  numberPayload,
  numberSymbols,
  parseNumber,
  pasteAsNumber,
  type NumberCurrency,
  type NumberKind,
  type NumberPasteOutcome,
  type NumberSymbols,
  type ParsedNumber,
} from '../../src/number';

declare const reactPaste: ReactClipboardEvent<HTMLInputElement>;
declare const domPaste: ClipboardEvent;

describe('number types', () => {
  it('parses and formats', () => {
    expectTypeOf(parseNumber('x', { locale: 'de-DE', negative: false, fraction: false, currency: false, percent: false })).toEqualTypeOf<ParsedNumber | null>();
    expectTypeOf<ParsedNumber['kind']>().toEqualTypeOf<NumberKind>();
    expectTypeOf<ParsedNumber['currency']>().toEqualTypeOf<NumberCurrency | null>();
    expectTypeOf<NumberCurrency['code']>().toEqualTypeOf<string | null>();
    expectTypeOf(formatNumber(1)).toEqualTypeOf<string>();
    expectTypeOf(formatNumber('1.5', { grouping: true, fractionDigits: 2 })).toEqualTypeOf<string>();
    expectTypeOf(formatNumber(1n)).toEqualTypeOf<string>();
    expectTypeOf(numberPayload(1)).toEqualTypeOf<TextPayload>();
    expectTypeOf(numberSymbols('en')).toEqualTypeOf<NumberSymbols>();
    // @ts-expect-error: not a number
    void formatNumber(null);
    // @ts-expect-error: locales are strings
    void parseNumber('1', { locale: ['en'] });
  });

  it('handles React and DOM paste events', () => {
    expectTypeOf(pasteAsNumber(reactPaste, { locale: 'en-IN', onNumber: (parsed) => expectTypeOf(parsed).toEqualTypeOf<ParsedNumber>() })).toEqualTypeOf<NumberPasteOutcome>();
    expectTypeOf(pasteAsNumber(domPaste)).toEqualTypeOf<NumberPasteOutcome>();
    expectTypeOf<NumberPasteOutcome>().toEqualTypeOf<'pasted' | 'rejected' | 'ignored'>();
  });
});
