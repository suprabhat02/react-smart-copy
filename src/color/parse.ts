import { color, fromHsl, fromHwb, fromLab, fromLinearRgb, fromOklab, fromP3, fromPolar, fromXyz, fromXyzD50, map3, vec3, type Color, type Vec3 } from './convert';
import { namedColor } from './names';

/** Longer input is not a colour: parsing stays cheap whatever is pasted. */
const MAX_LENGTH = 256;

const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/;
const HEX = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/;
const FUNCTION = /^([a-z][a-z\d-]*)\(([^()]*)\)$/;

type Kind = 'number' | 'percent' | 'angle';
interface Token {
  readonly kind: Kind | 'none';
  readonly value: number;
}

const ANGLE_UNITS: Readonly<Record<string, number>> = { deg: 1, grad: 0.9, rad: 180 / Math.PI, turn: 360 };

/** One component: a number, a percentage, an angle (in degrees) or `none`. */
function token(text: string): Token | null {
  if (text === 'none') return { kind: 'none', value: 0 };
  if (text.endsWith('%')) {
    const body = text.slice(0, -1);
    return NUMBER.test(body) ? { kind: 'percent', value: Number(body) } : null;
  }
  const unit = /[a-z]+$/.exec(text)?.[0];
  if (unit !== undefined) {
    const factor = ANGLE_UNITS[unit];
    const body = text.slice(0, -unit.length);
    // `e` alone is an exponent, never a unit.
    return factor === undefined || !NUMBER.test(body) ? null : { kind: 'angle', value: Number(body) * factor };
  }
  return NUMBER.test(text) ? { kind: 'number', value: Number(text) } : null;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** A component's value: numbers as they are, percentages scaled so 100% is `full`. */
function amount(t: Token, full: number, allowed: readonly Kind[]): number | null {
  if (t.kind === 'none') return 0;
  if (!allowed.includes(t.kind)) return null;
  return t.kind === 'percent' ? (t.value / 100) * full : t.value;
}

const hueOf = (t: Token): number | null => amount(t, 0, ['number', 'angle']);
const alphaOf = (t: Token | undefined): number | null => {
  if (t === undefined) return 1;
  const value = amount(t, 1, ['number', 'percent']);
  return value === null ? null : clamp(value, 0, 1);
};

/** Splits arguments into three components and an optional alpha; `legacy` for the comma syntax. */
function split(args: string): { readonly parts: Token[]; readonly alpha: Token | undefined; readonly legacy: boolean } | null {
  const legacy = args.includes(',');
  let main: string[];
  let alphaText: string | undefined;
  if (legacy) {
    const list = args.split(',').map((part) => part.trim());
    if (list.length < 3 || list.length > 4) return null;
    main = list.slice(0, 3);
    alphaText = list[3];
  } else {
    const [body, rest, extra] = args.split('/');
    if (extra !== undefined) return null;
    main = (body as string).trim().split(/\s+/);
    alphaText = rest?.trim();
    if (main.length !== 3 || alphaText === '') return null;
  }
  const parts = main.map(token);
  if (parts.some((part) => part === null)) return null;
  const alpha = alphaText === undefined ? undefined : token(alphaText);
  if (alpha === null) return null;
  // The comma syntax predates `none`.
  if (legacy && [...parts, alpha].some((part) => part?.kind === 'none')) return null;
  return { parts: parts as Token[], alpha, legacy };
}

function rgb(parts: readonly Token[], legacy: boolean): Vec3 | null {
  // The comma syntax takes numbers or percentages, not a mix.
  if (legacy && new Set(parts.map((part) => part.kind)).size !== 1) return null;
  const values = parts.map((part) => amount(part, 255, ['number', 'percent']));
  const vector = vec3(values);
  return vector === null ? null : map3(vector, (v) => clamp(v, 0, 255) / 255);
}

const PREDEFINED: Readonly<Record<string, (v: Vec3, alpha: number) => Color>> = {
  srgb: ([r, g, b], alpha) => color(r, g, b, alpha),
  'srgb-linear': fromLinearRgb,
  'display-p3': fromP3,
  xyz: fromXyz,
  'xyz-d65': fromXyz,
  'xyz-d50': fromXyzD50,
};

/** `color(space c1 c2 c3 / alpha)`. */
function predefined(args: string): Color | null {
  const match = /^([a-z\d-]+)\s+(.*)$/.exec(args.trim());
  if (match === null) return null;
  const convert = PREDEFINED[match[1] as string];
  const parsed = split(match[2] as string);
  if (convert === undefined || parsed === null || parsed.legacy) return null;
  const values = parsed.parts.map((part) => amount(part, 1, ['number', 'percent']));
  const alpha = alphaOf(parsed.alpha);
  const vector = vec3(values);
  return vector === null || alpha === null ? null : convert(vector, alpha);
}

function functional(name: string, args: string): Color | null {
  if (name === 'color') return predefined(args);
  const parsed = split(args);
  if (parsed === null) return null;
  const { parts, legacy } = parsed;
  const [a, b, c] = parts as [Token, Token, Token];
  const alpha = alphaOf(parsed.alpha);
  if (alpha === null) return null;
  switch (name) {
    case 'rgb':
    case 'rgba': {
      const values = rgb(parts, legacy);
      return values === null ? null : color(values[0], values[1], values[2], alpha);
    }
    case 'hsl':
    case 'hsla': {
      const hue = hueOf(a);
      // The comma syntax requires percentages for saturation and lightness.
      const kinds: readonly Kind[] = legacy ? ['percent'] : ['number', 'percent'];
      const s = amount(b, 100, kinds);
      const l = amount(c, 100, kinds);
      if (hue === null || s === null || l === null) return null;
      return fromHsl(hue, clamp(s, 0, 100) / 100, clamp(l, 0, 100) / 100, alpha);
    }
    case 'hwb': {
      const hue = hueOf(a);
      const w = amount(b, 100, ['number', 'percent']);
      const k = amount(c, 100, ['number', 'percent']);
      if (legacy || hue === null || w === null || k === null) return null;
      return fromHwb(hue, clamp(w, 0, 100) / 100, clamp(k, 0, 100) / 100, alpha);
    }
    default:
      return legacy ? null : lab(name, a, b, c, alpha);
  }
}

/** lab(), lch(), oklab() and oklch(). */
function lab(name: string, a: Token, b: Token, c: Token, alpha: number): Color | null {
  const ok = name.startsWith('ok');
  const polar = name.endsWith('ch');
  if (!['lab', 'lch', 'oklab', 'oklch'].includes(name)) return null;
  const lightMax = ok ? 1 : 100;
  const l = amount(a, lightMax, ['number', 'percent']);
  // 100% is 0.4 in OKLab and OKLCH, 125 for Lab's a and b, 150 for LCH's chroma.
  const second = amount(b, ok ? 0.4 : polar ? 150 : 125, ['number', 'percent']);
  const third = polar ? hueOf(c) : amount(c, ok ? 0.4 : 125, ['number', 'percent']);
  if (l === null || second === null || third === null) return null;
  const lightness = clamp(l, 0, lightMax);
  const values: Vec3 = polar ? fromPolar([lightness, Math.max(0, second), third]) : [lightness, second, third];
  return ok ? fromOklab(values, alpha) : fromLab(values, alpha);
}

/**
 * Parses a CSS colour, or returns `null`: hex (`#rgb`, `#rgba`, `#rrggbb`,
 * `#rrggbbaa`), the 148 named colours and `transparent`, `rgb()` and `hsl()` in
 * both syntaxes, `hwb()`, `lab()`, `lch()`, `oklab()`, `oklch()`, and `color()`
 * in `srgb`, `srgb-linear`, `display-p3`, `xyz`, `xyz-d65` and `xyz-d50`.
 * Never throws. Colours outside sRGB keep their exact value.
 *
 * Not colours on their own: `currentcolor`, system colours, `var()`, `calc()`,
 * `color-mix()` and relative colours.
 *
 * @example
 * parseColor('oklch(62.8% 0.258 29.23)'); // { r: 1, g: 0, b: 0, alpha: 1 } (rounded)
 */
export function parseColor(input: string): Color | null {
  if (typeof input !== 'string' || input.length > MAX_LENGTH) return null;
  const text = input.trim().toLowerCase();
  const hex = HEX.exec(text)?.[1];
  if (hex !== undefined) {
    const full = hex.length <= 4 ? hex.replace(/./g, (digit) => digit + digit) : hex;
    const byte = (i: number) => parseInt(full.slice(i, i + 2), 16) / 255;
    return color(byte(0), byte(2), byte(4), full.length === 8 ? byte(6) : 1);
  }
  if (text === 'transparent') return color(0, 0, 0, 0);
  const named = namedColor(text);
  if (named !== undefined) return color(((named >> 16) & 255) / 255, ((named >> 8) & 255) / 255, (named & 255) / 255);
  const match = FUNCTION.exec(text);
  return match === null ? null : functional(match[1] as string, (match[2] as string).trim());
}
