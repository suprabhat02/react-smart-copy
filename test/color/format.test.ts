import { describe, expect, it } from 'vitest';
import { COLOR_FORMATS, contrastLevel, contrastRatio, formatColor, inGamut, parseColor, toGamut } from '../../src/color';

const typed = (type = 'invalid-payload'): unknown => expect.objectContaining({ copyError: expect.objectContaining({ type }) });

describe('formatColor', () => {
  it('writes every format', () => {
    const blue = '#3b82f6';
    expect(COLOR_FORMATS.map((format) => formatColor(blue, format))).toEqual([
      '#3b82f6',
      'rgb(59 130 246)',
      'hsl(217.22 91.22% 59.8%)',
      'hwb(217.22 23.14% 3.53%)',
      'oklch(62.31% 0.18801 259.81)',
      'oklab(62.31% -0.03325 -0.18505)',
      'lab(54.62 8.76 -65.79)',
      'lch(54.62 66.37 277.59)',
      'color(display-p3 0.3047 0.5035 0.9338)',
    ]);
    expect(formatColor('red')).toBe('#ff0000');
  });

  it('writes the darkest colours and green-led hues exactly', () => {
    // Below the CIE threshold, Lab uses its linear segment.
    expect(formatColor('#000000', 'lab')).toBe('lab(0 0 0)');
    expect(formatColor('#010101', 'lab')).toBe('lab(0.27 0 0)');
    expect(formatColor('lab(0.27 0 0)', 'hex')).toBe('#010101');
    expect(formatColor('#00ff00', 'hsl')).toBe('hsl(120 100% 50%)');
    expect(formatColor('#20c060', 'hsl')).toBe('hsl(144 71.43% 43.92%)');
  });

  it('writes alpha only when it is not opaque', () => {
    const half = 'rgb(255 0 0 / 0.5)';
    expect(formatColor(half, 'hex')).toBe('#ff000080');
    expect(formatColor(half, 'rgb')).toBe('rgb(255 0 0 / 0.5)');
    expect(formatColor(half, 'hsl')).toBe('hsl(0 100% 50% / 0.5)');
    expect(formatColor(half, 'oklch')).toBe('oklch(62.8% 0.25768 29.23 / 0.5)');
    expect(formatColor('rgb(0 0 0 / 0.33333)', 'rgb')).toBe('rgb(0 0 0 / 0.333)');
  });

  it('writes the comma syntax, uppercase hex and a chosen precision', () => {
    expect(formatColor('#ff000080', 'rgb', { legacy: true })).toBe('rgba(255, 0, 0, 0.502)');
    expect(formatColor('#ff0000', 'rgb', { legacy: true })).toBe('rgb(255, 0, 0)');
    expect(formatColor('#ff000080', 'hsl', { legacy: true })).toBe('hsla(0, 100%, 50%, 0.502)');
    expect(formatColor('#ff0000', 'hsl', { legacy: true })).toBe('hsl(0, 100%, 50%)');
    expect(formatColor('#abcdef', 'hex', { uppercase: true })).toBe('#ABCDEF');
    expect(formatColor('#3b82f6', 'oklch', { precision: 1 })).toBe('oklch(62.3% 0.2 259.8)');
    expect(formatColor('#3b82f6', 'oklch', { precision: 0 })).toBe('oklch(62% 0 0)');
  });

  it('writes greys with a hue of 0, never a hue of 360, and never -0', () => {
    expect(formatColor('#808080', 'oklch')).toBe('oklch(59.99% 0 0)');
    expect(formatColor('#808080', 'lch')).toBe('lch(53.59 0 0)');
    expect(formatColor('#808080', 'hsl')).toBe('hsl(0 0% 50.2%)');
    expect(formatColor('hsl(359.999 100% 50%)', 'hsl')).toBe('hsl(0 100% 50%)');
    expect(formatColor('oklab(50% -0.000001 0)', 'oklab')).toBe('oklab(50% 0 0)');
  });

  it('maps colours outside the gamut by default, keeping their hue, or clips them', () => {
    const p3red = 'color(display-p3 1 0 0)';
    expect(formatColor(p3red, 'hex')).toBe('#ff0b0c');
    expect(formatColor(p3red, 'hex', { gamut: 'clip' })).toBe('#ff0000');
    expect(formatColor(p3red, 'p3')).toBe('color(display-p3 1 0 0)');
    expect(formatColor('oklch(90% 0.4 150)', 'p3')).toMatch(/^color\(display-p3 [\d.]+ [\d.]+ [\d.]+\)$/);
    expect(formatColor(p3red, 'oklch')).toBe('oklch(64.86% 0.29949 28.96)');
  });

  it('rejects what is not a colour, a format or an option', () => {
    expect(() => formatColor('blurple')).toThrow(typed());
    expect(() => formatColor({ r: 1, g: 0, b: Number.NaN, alpha: 1 })).toThrow(typed());
    expect(() => formatColor(null as never)).toThrow(typed());
    expect(() => formatColor('red', 'cmyk' as never)).toThrow(typed());
    expect(() => formatColor('red', 'hex', { gamut: 'squash' as never })).toThrow(typed());
    expect(() => formatColor('red', 'hex', { precision: 1.5 })).toThrow(typed());
    expect(() => formatColor('red', 'hex', { precision: 11 })).toThrow(typed());
    expect(formatColor({ r: 0, g: 0.5, b: 1, alpha: 1 })).toBe('#0080ff');
  });
});

describe('gamut', () => {
  it('reports and maps gamuts', () => {
    const p3 = parseColor('color(display-p3 1 0 0)');
    if (p3 === null) throw new Error('unreachable');
    expect(inGamut(p3)).toBe(false);
    expect(inGamut(p3, 'p3')).toBe(true);
    expect(inGamut(toGamut(p3))).toBe(true);
    expect(toGamut(p3, 'p3')).not.toBe(p3);
    const white = toGamut(parseColor('oklch(100% 0.3 30)') as never);
    expect(formatColor(white)).toBe('#ffffff');
    const black = toGamut(parseColor('oklch(0% 0.3 30)') as never);
    expect(formatColor(black)).toBe('#000000');
    // A search that narrows all the way down still lands in the gamut.
    const deep = toGamut(parseColor('oklch(0.27 0.4 105)') as never);
    expect(inGamut(deep)).toBe(true);
    // Just outside: clipping is already invisible.
    expect(formatColor(toGamut(parseColor('color(srgb 1.001 0 0)') as never))).toBe('#ff0000');
  });
});

describe('contrast', () => {
  it('matches WCAG 2 reference values', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 10);
    expect(contrastRatio('#fff', '#fff')).toBe(1);
    expect(contrastRatio('#767676', '#fff')).toBeCloseTo(4.54, 2);
    expect(contrastRatio('#fff', '#767676')).toBeCloseTo(4.54, 2);
    expect(contrastRatio('#777', '#fff')).toBeLessThan(4.5);
  });

  it('draws translucent colours as a browser would', () => {
    expect(contrastRatio('rgb(0 0 0 / 0)', '#fff')).toBe(1);
    expect(contrastRatio('#000', 'transparent')).toBeCloseTo(21, 10);
    expect(contrastRatio('rgb(0 0 0 / 0.5)', '#fff')).toBeCloseTo(contrastRatio('#808080', '#fff'), 1);
  });

  it('gives the level for normal and large text, never rounding up', () => {
    expect(contrastLevel(7)).toBe('AAA');
    expect(contrastLevel(4.5)).toBe('AA');
    expect(contrastLevel(4.499)).toBe('fail');
    expect(contrastLevel(4.5, { large: true })).toBe('AAA');
    expect(contrastLevel(3, { large: true })).toBe('AA');
    expect(contrastLevel(2.99, { large: true })).toBe('fail');
    expect(() => contrastLevel(0.5)).toThrow(typed());
    expect(() => contrastLevel(Number.NaN)).toThrow(typed());
  });
});
