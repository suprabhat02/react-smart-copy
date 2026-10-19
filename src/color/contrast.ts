import { copyFailure } from '../core/errors';
import { color, toGamut, type Color } from './convert';
import { toColor, type ColorInput } from './format';

const WHITE = /* @__PURE__ */ color(1, 1, 1);

/** `top` drawn over `bottom`, both made opaque first. */
function over(top: Color, bottom: Color): Color {
  const mix = (a: number, b: number) => a * top.alpha + b * (1 - top.alpha);
  return color(mix(top.r, bottom.r), mix(top.g, bottom.g), mix(top.b, bottom.b));
}

/** WCAG 2 relative luminance of an opaque sRGB colour. */
function luminance(c: Color): number {
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

/**
 * The WCAG 2 contrast ratio of text over a background, from 1 to 21. Colours are
 * mapped into sRGB, a translucent background is drawn over white, and translucent
 * text over the background, as a browser would show them. Never rounded: 4.499 is
 * not 4.5.
 *
 * @example
 * contrastRatio('#767676', '#fff'); // 4.54
 */
export function contrastRatio(text: ColorInput, background: ColorInput): number {
  const bg = over(toGamut(toColor(background)), WHITE);
  const fg = over(toGamut(toColor(text)), bg);
  const [light, dark] = [luminance(fg), luminance(bg)].sort((a, b) => b - a) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** The WCAG 2 level a contrast ratio meets: `AAA`, `AA`, or `fail`. */
export type ContrastLevel = 'AAA' | 'AA' | 'fail';

export interface ContrastLevelOptions {
  /** Large text: at least 24px, or 18.66px bold. Its thresholds are 3 (AA) and 4.5 (AAA) instead of 4.5 and 7. */
  readonly large?: boolean;
}

/** The WCAG 2 level met by a contrast ratio (`contrastRatio`), for normal or large text. */
export function contrastLevel(ratio: number, options: ContrastLevelOptions = {}): ContrastLevel {
  if (!Number.isFinite(ratio) || ratio < 1) throw copyFailure('invalid-payload', 'A contrast ratio is a number from 1 to 21.');
  const [aa, aaa] = options.large === true ? [3, 4.5] : [4.5, 7];
  if (ratio >= aaa) return 'AAA';
  return ratio >= aa ? 'AA' : 'fail';
}
