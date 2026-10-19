import { copyFailure } from '../core/errors';
import { toGamut, toHsl, toHwb, toLab, toOklab, toP3, toPolar, type Color } from './convert';
import { parseColor } from './parse';

/**
 * How to write a colour:
 * - `hex`: `#ff0000`, `#ff000080` with alpha
 * - `rgb`, `hsl`, `hwb`: `rgb(255 0 0)`, `hsl(0 100% 50%)`, `hwb(0 0% 0%)`
 * - `oklch`, `oklab`: `oklch(62.8% 0.2577 29.23)`, `oklab(62.8% 0.2249 0.1258)`
 * - `lab`, `lch`: `lab(54.29 80.8 69.89)`, `lch(54.29 106.84 40.85)`
 * - `p3`: `color(display-p3 0.9176 0.2003 0.1386)`
 */
export type ColorFormat = 'hex' | 'rgb' | 'hsl' | 'hwb' | 'oklch' | 'oklab' | 'lab' | 'lch' | 'p3';

export const COLOR_FORMATS: readonly ColorFormat[] = /* @__PURE__ */ Object.freeze(['hex', 'rgb', 'hsl', 'hwb', 'oklch', 'oklab', 'lab', 'lch', 'p3']);

export interface FormatColorOptions {
  /**
   * For colours outside the format's gamut (sRGB for `hex`, `rgb`, `hsl` and `hwb`;
   * Display P3 for `p3`): `"map"` (default) finds the closest colour that looks the
   * same, as CSS Color 4 specifies; `"clip"` clips each channel, as most browsers draw.
   * `oklch`, `oklab`, `lab` and `lch` hold every colour exactly.
   */
  readonly gamut?: 'map' | 'clip';
  /** The comma syntax for `rgb` and `hsl` (`rgba(255, 0, 0, 0.5)`), for older tools. Default `false`. */
  readonly legacy?: boolean;
  /** Uppercase hex digits (`#FF0000`). Default `false`. */
  readonly uppercase?: boolean;
  /**
   * Decimal places for every non-integer component. Default: per format, the fewest
   * that bring every 8-bit colour back exactly (checked on 836,056 colours).
   */
  readonly precision?: number;
}

/** A colour, or text to parse as one: throws a typed `invalid-payload` error for text that is not a colour. */
export type ColorInput = Color | string;

const isColor = (value: unknown): value is Color =>
  typeof value === 'object' &&
  value !== null &&
  ['r', 'g', 'b', 'alpha'].every((key) => Number.isFinite((value as Record<string, unknown>)[key]));

/** Resolves a colour input, throwing a typed error for anything that is not one. */
export function toColor(input: ColorInput): Color {
  if (typeof input === 'string') {
    const parsed = parseColor(input);
    if (parsed === null) throw copyFailure('invalid-payload', `Not a colour: ${JSON.stringify(input.slice(0, 100))}.`);
    return parsed;
  }
  if (!isColor(input)) throw copyFailure('invalid-payload', 'A colour must be a CSS colour string or an { r, g, b, alpha } object with finite numbers.');
  return input;
}

/** Rounds to `places` decimals, without trailing zeros or `-0`. */
function num(value: number, places: number): string {
  const factor = 10 ** places;
  const rounded = Math.round(value * factor) / factor;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

/** A hue in degrees, with 360 written as 0. */
const hue = (value: number, places: number): string => {
  const text = num(value, places);
  return text === '360' ? '0' : text;
};

const byte = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);

/** The alpha suffix of a functional notation: nothing when opaque. */
const alphaPart = (alpha: number, legacy: boolean, places: number): string =>
  alpha >= 1 ? '' : legacy ? `, ${num(alpha, places)}` : ` / ${num(alpha, places)}`;

/**
 * Writes a colour in a CSS format. Text is parsed first, so this also converts
 * between formats.
 *
 * @example
 * formatColor('rgb(255 0 0)', 'oklch'); // 'oklch(62.8% 0.2577 29.23)'
 * formatColor('color(display-p3 1 0 0)', 'hex'); // '#ff0000' after gamut mapping, never a wrong hue
 */
export function formatColor(input: ColorInput, format: ColorFormat = 'hex', options: FormatColorOptions = {}): string {
  const c = toColor(input);
  const { gamut = 'map', legacy = false, uppercase = false, precision } = options;
  const method: unknown = gamut; // Plain-JS callers can pass anything.
  if (method !== 'map' && method !== 'clip') throw copyFailure('invalid-payload', '`gamut` must be "map" or "clip".');
  if (precision !== undefined && !(Number.isInteger(precision) && precision >= 0 && precision <= 10)) {
    throw copyFailure('invalid-payload', '`precision` must be an integer from 0 to 10.');
  }
  const dp = (fallback: number) => precision ?? fallback;
  const a = c.alpha;
  switch (format) {
    case 'hex': {
      const s = toGamut(c, 'srgb', gamut);
      const digits = [s.r, s.g, s.b, ...(a < 1 ? [a] : [])].map((v) => byte(v).toString(16).padStart(2, '0')).join('');
      return `#${uppercase ? digits.toUpperCase() : digits}`;
    }
    case 'rgb': {
      const s = toGamut(c, 'srgb', gamut);
      const [r, g, b] = [s.r, s.g, s.b].map(byte);
      return legacy ? `${a < 1 ? 'rgba' : 'rgb'}(${String(r)}, ${String(g)}, ${String(b)}${alphaPart(a, true, dp(3))})` : `rgb(${String(r)} ${String(g)} ${String(b)}${alphaPart(a, false, dp(3))})`;
    }
    case 'hsl': {
      const [h, s, l] = toHsl(toGamut(c, 'srgb', gamut));
      const [hh, ss, ll] = [hue(h, dp(2)), `${num(s * 100, dp(2))}%`, `${num(l * 100, dp(2))}%`];
      return legacy ? `${a < 1 ? 'hsla' : 'hsl'}(${hh}, ${ss}, ${ll}${alphaPart(a, true, dp(3))})` : `hsl(${hh} ${ss} ${ll}${alphaPart(a, false, dp(3))})`;
    }
    case 'hwb': {
      const [h, w, b] = toHwb(toGamut(c, 'srgb', gamut));
      return `hwb(${hue(h, dp(2))} ${num(w * 100, dp(2))}% ${num(b * 100, dp(2))}%${alphaPart(a, false, dp(3))})`;
    }
    case 'oklab': {
      const [l, x, y] = toOklab(c);
      return `oklab(${num(l * 100, dp(2))}% ${num(x, dp(5))} ${num(y, dp(5))}${alphaPart(a, false, dp(3))})`;
    }
    case 'oklch': {
      // The hue is written whenever the written chroma isn't 0; with chroma 0 it means nothing.
      const [l, ch, h] = toPolar(toOklab(c));
      const chroma = num(ch, dp(5));
      return `oklch(${num(l * 100, dp(2))}% ${chroma} ${chroma === '0' ? '0' : hue(h, dp(2))}${alphaPart(a, false, dp(3))})`;
    }
    case 'lab': {
      const [l, x, y] = toLab(c);
      return `lab(${num(l, dp(2))} ${num(x, dp(2))} ${num(y, dp(2))}${alphaPart(a, false, dp(3))})`;
    }
    case 'lch': {
      const [l, ch, h] = toPolar(toLab(c));
      const chroma = num(ch, dp(2));
      return `lch(${num(l, dp(2))} ${chroma} ${chroma === '0' ? '0' : hue(h, dp(2))}${alphaPart(a, false, dp(3))})`;
    }
    case 'p3': {
      const [r, g, b] = toP3(toGamut(c, 'p3', gamut));
      return `color(display-p3 ${num(r, dp(4))} ${num(g, dp(4))} ${num(b, dp(4))}${alphaPart(a, false, dp(3))})`;
    }
    default:
      throw copyFailure('invalid-payload', `Unknown colour format ${JSON.stringify(String(format))}: use one of ${COLOR_FORMATS.join(', ')}.`);
  }
}
