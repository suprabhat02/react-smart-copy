import { describe, expectTypeOf, it } from 'vitest';
import type { HtmlPayload, TextPayload } from '../../src/core/payload';
import { colorPayload, contrastLevel, formatColor, parseColor, readColor, type Color, type ColorFormat, type ContrastLevel } from '../../src/color';

describe('color types', () => {
  it('types parsing, formatting and payloads', () => {
    expectTypeOf(parseColor('red')).toEqualTypeOf<Color | null>();
    expectTypeOf(readColor({ text: 'red' })).toEqualTypeOf<Color | null>();
    expectTypeOf(formatColor('red', 'oklch')).toEqualTypeOf<string>();
    expectTypeOf(colorPayload({ r: 1, g: 0, b: 0, alpha: 1 })).toEqualTypeOf<HtmlPayload | TextPayload>();
    expectTypeOf(contrastLevel(4.5, { large: true })).toEqualTypeOf<ContrastLevel>();
    expectTypeOf<ColorFormat>().toEqualTypeOf<'hex' | 'rgb' | 'hsl' | 'hwb' | 'oklch' | 'oklab' | 'lab' | 'lch' | 'p3'>();
    // @ts-expect-error: not a format
    void formatColor('red', 'cmyk');
    // @ts-expect-error: a colour needs alpha
    void formatColor({ r: 1, g: 0, b: 0 });
  });
});
