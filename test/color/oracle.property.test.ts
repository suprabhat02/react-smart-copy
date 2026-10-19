import fc from 'fast-check';
import { colorsNamed, converter, formatHex8, parse } from 'culori';
import { describe, expect, it } from 'vitest';
import { runs } from '../property';
import { COLOR_FORMATS, contrastRatio, formatColor, inGamut, parseColor, toGamut, type Color } from '../../src/color';
import { toLab, toOklab } from '../../src/color/convert';

const RUNS = runs(400);

const toRgb = converter('rgb');
/** culori, the reference implementation: its extended sRGB channels for a CSS colour. */
function reference(css: string): Color {
  const parsed = parse(css);
  if (parsed === undefined) throw new Error(`culori cannot parse ${css}`);
  const c = toRgb(parsed);
  return { r: c.r, g: c.g, b: c.b, alpha: c.alpha ?? 1 };
}
/**
 * Agreement within 1e-4 of a channel, a fortieth of an 8-bit step: culori's Lab and
 * D50 matrices differ from the CSS Color 4 ones in their last digits, and the cube
 * root near black magnifies that.
 */
const TOLERANCE = 1e-4;
const closeTo = (actual: Color | null, wanted: Color) => {
  expect(actual).not.toBeNull();
  for (const key of ['r', 'g', 'b', 'alpha'] as const) {
    expect(Math.abs((actual as Color)[key] - wanted[key]), `${key}: ${String((actual as Color)[key])} vs ${String(wanted[key])}`).toBeLessThanOrEqual(TOLERANCE);
  }
};

const unit = fc.double({ min: 0, max: 1, noNaN: true });
const fixed = (value: number, places = 4) => value.toFixed(places);
/** CSS colours in every notation, with components in their usual ranges. */
const css = fc.oneof(
  fc.tuple(unit, unit, unit, unit).map(([r, g, b, a]) => `rgb(${fixed(r * 255)} ${fixed(g * 255)} ${fixed(b * 255)} / ${fixed(a)})`),
  fc.tuple(fc.double({ min: -720, max: 720, noNaN: true }), unit, unit).map(([h, s, l]) => `hsl(${fixed(h)}deg ${fixed(s * 100)}% ${fixed(l * 100)}%)`),
  fc.tuple(fc.double({ min: 0, max: 360, noNaN: true }), unit, unit).map(([h, w, b]) => `hwb(${fixed(h)} ${fixed(w * 100)}% ${fixed(b * 100)}%)`),
  fc.tuple(unit, fc.double({ min: -125, max: 125, noNaN: true }), fc.double({ min: -125, max: 125, noNaN: true })).map(([l, a, b]) => `lab(${fixed(l * 100)} ${fixed(a)} ${fixed(b)})`),
  fc.tuple(unit, fc.double({ min: 0, max: 150, noNaN: true }), fc.double({ min: 0, max: 360, noNaN: true })).map(([l, c, h]) => `lch(${fixed(l * 100)} ${fixed(c)} ${fixed(h)})`),
  fc.tuple(unit, fc.double({ min: -0.4, max: 0.4, noNaN: true }), fc.double({ min: -0.4, max: 0.4, noNaN: true })).map(([l, a, b]) => `oklab(${fixed(l, 6)} ${fixed(a, 6)} ${fixed(b, 6)})`),
  fc.tuple(unit, fc.double({ min: 0, max: 0.4, noNaN: true }), fc.double({ min: 0, max: 360, noNaN: true })).map(([l, c, h]) => `oklch(${fixed(l * 100)}% ${fixed(c, 6)} ${fixed(h)})`),
  fc.tuple(unit, unit, unit).map(([r, g, b]) => `color(display-p3 ${fixed(r, 6)} ${fixed(g, 6)} ${fixed(b, 6)})`),
  fc.tuple(unit, unit, unit).map(([r, g, b]) => `color(srgb-linear ${fixed(r, 6)} ${fixed(g, 6)} ${fixed(b, 6)})`),
  fc.tuple(unit, unit, unit).map(([x, y, z]) => `color(xyz-d50 ${fixed(x, 6)} ${fixed(y, 6)} ${fixed(z, 6)})`),
);
const srgb = fc.tuple(fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 })).map(([r, g, b]) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`);

describe('react-smart-copy/color against culori (reference implementation)', () => {
  it('parses every notation to the same colour', () => {
    fc.assert(
      fc.property(css, (text) => {
        closeTo(parseColor(text), reference(text));
      }),
      RUNS,
    );
  });

  it('knows every named colour, with the same value', () => {
    for (const [name, value] of Object.entries(colorsNamed)) {
      expect(formatColor(name), name).toBe(`#${value.toString(16).padStart(6, '0')}`);
    }
  });

  it('writes formats that culori reads back as the same colour', () => {
    fc.assert(
      fc.property(css, fc.constantFrom(...COLOR_FORMATS.filter((f) => f !== 'hex' && f !== 'rgb')), (text, format) => {
        const c = parseColor(text) as Color;
        // Imaginary colours (beyond what eyes see) can have a lightness outside 0 to 100%,
        // which CSS clamps when it reads lab() or oklab(): they can't be written there.
        const inRange = (value: number, max: number) => value >= 0 && value <= max;
        fc.pre(!(format === 'lab' || format === 'lch') || inRange(toLab(c)[0], 100));
        fc.pre(!(format === 'oklab' || format === 'oklch') || inRange(toOklab(c)[0], 1));
        const written = formatColor(c, format, { precision: 8 });
        // Formats in sRGB or P3 hold the mapped colour; the others hold it exactly.
        const expected = format === 'hsl' || format === 'hwb' ? toGamut(c) : format === 'p3' ? toGamut(c, 'p3') : c;
        closeTo(reference(written), expected);
      }),
      RUNS,
    );
  });

  it('round-trips every 8-bit colour through every format at the default precision', () => {
    fc.assert(
      fc.property(srgb, fc.constantFrom(...COLOR_FORMATS), (hex, format) => {
        expect(formatColor(formatColor(hex, format))).toBe(hex);
      }),
      RUNS,
    );
  });

  it('writes the same hex as culori for colours in sRGB', () => {
    fc.assert(
      fc.property(fc.tuple(unit, unit, unit, unit), ([r, g, b, alpha]) => {
        const text = `color(srgb ${String(r)} ${String(g)} ${String(b)} / ${String(alpha)})`;
        const ours = formatColor(text);
        const parsed = parse(text);
        if (parsed === undefined) throw new Error(`culori cannot parse ${text}`);
        const theirs = formatHex8(parsed);
        expect(ours.slice(0, 7)).toBe(theirs.slice(0, 7));
        expect(ours.length === 9 ? ours.slice(7) : 'ff').toBe(alpha === 1 ? 'ff' : theirs.slice(7));
      }),
      RUNS,
    );
  });

  it('maps every colour into the gamut, close to it, and leaves colours inside alone', () => {
    fc.assert(
      fc.property(css, (text) => {
        const c = parseColor(text) as Color;
        for (const gamut of ['srgb', 'p3'] as const) {
          const mapped = toGamut(c, gamut);
          expect(inGamut(mapped, gamut)).toBe(true);
          if (inGamut(c, gamut)) closeTo(mapped, c);
        }
      }),
      RUNS,
    );
  });

  it('computes symmetric contrast ratios between 1 and 21', () => {
    fc.assert(
      fc.property(srgb, srgb, (a, b) => {
        const ratio = contrastRatio(a, b);
        expect(ratio).toBeGreaterThanOrEqual(1);
        expect(ratio).toBeLessThanOrEqual(21 + 1e-9);
        expect(contrastRatio(b, a)).toBeCloseTo(ratio, 12);
      }),
      RUNS,
    );
  });
});
