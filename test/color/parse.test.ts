import { describe, expect, it } from 'vitest';
import { formatColor, parseColor, type Color } from '../../src/color';

const hex = (input: string) => {
  const c = parseColor(input);
  return c === null ? null : formatColor(c, 'hex');
};
const near = (c: Color | null, r: number, g: number, b: number, alpha = 1) => {
  expect(c).not.toBeNull();
  for (const [actual, wanted] of [[c?.r, r], [c?.g, g], [c?.b, b], [c?.alpha, alpha]] as const) expect(actual).toBeCloseTo(wanted, 6);
};

describe('parseColor: hex and names', () => {
  it('reads every hex length, in any case', () => {
    expect(hex('#F00')).toBe('#ff0000');
    expect(hex('#f008')).toBe('#ff000088');
    expect(hex('#3B82F6')).toBe('#3b82f6');
    expect(hex('#3b82f680')).toBe('#3b82f680');
    expect(hex('  #abc  ')).toBe('#aabbcc');
    for (const bad of ['#ff', '#fffff', '#ggg', 'ff0000', '#ff00000', '# fff']) expect(parseColor(bad)).toBeNull();
  });

  it('reads the named colours and transparent', () => {
    expect(hex('RebeccaPurple')).toBe('#663399');
    expect(hex('aliceblue')).toBe('#f0f8ff');
    expect(hex('yellowgreen')).toBe('#9acd32');
    expect(parseColor('transparent')).toEqual({ r: 0, g: 0, b: 0, alpha: 0 });
    for (const notColor of ['currentcolor', 'canvas', 'inherit', 'blurple', '']) expect(parseColor(notColor)).toBeNull();
  });
});

describe('parseColor: rgb() and hsl()', () => {
  it('reads both syntaxes, numbers and percentages, and alpha', () => {
    for (const text of ['rgb(255 0 0)', 'rgb(255, 0, 0)', 'rgba(255,0,0)', 'rgb(100% 0% 0%)', 'rgb(100%, 0%, 0%)', 'RGB( 255 0 0 )', 'rgb(255 0 none)', 'rgb(2.55e2 0 0)']) {
      expect(hex(text), text).toBe('#ff0000');
    }
    near(parseColor('rgb(0 0 0 / 50%)'), 0, 0, 0, 0.5);
    near(parseColor('rgba(0, 0, 0, .25)'), 0, 0, 0, 0.25);
    near(parseColor('rgb(0 0 0 / none)'), 0, 0, 0, 0);
    near(parseColor('rgb(300 -20 128 / 2)'), 1, 0, 128 / 255, 1);
  });

  it('rejects mixed or malformed rgb()', () => {
    for (const bad of ['rgb(255, 0%, 0)', 'rgb(255 0)', 'rgb(255 0 0 0)', 'rgb(255,0,0,1,1)', 'rgb(255, 0, none)', 'rgb(255 0 0 /)', 'rgb(255 0 0 / 1 / 1)', 'rgb(1deg 0 0)', 'rgb(a b c)', 'rgb(255 0 0', 'rgb(calc(1) 0 0)', 'rgb()']) {
      expect(parseColor(bad), bad).toBeNull();
    }
  });

  it('reads hsl() with every angle unit', () => {
    for (const text of ['hsl(0 100% 50%)', 'hsl(0, 100%, 50%)', 'hsla(360deg 100% 50%)', 'hsl(0rad 100 50)', 'hsl(400grad 100% 50%)', 'hsl(1turn 100% 50%)', 'hsl(-360 100% 50%)']) {
      expect(hex(text), text).toBe('#ff0000');
    }
    expect(hex('hsl(120 100% 25%)')).toBe('#008000');
    expect(hex('hsl(0 0% 50%)')).toBe('#808080');
    expect(hex('hsl(0 150% 120%)')).toBe('#ffffff');
    for (const bad of ['hsl(0, 100, 50)', 'hsl(0 100% 50% 1)', 'hsl(0% 100% 50%)', 'hsl(0px 100% 50%)', 'hsl(0e 100% 50%)']) expect(parseColor(bad), bad).toBeNull();
  });

  it('reads hwb()', () => {
    expect(hex('hwb(0 0% 0%)')).toBe('#ff0000');
    expect(hex('hwb(120 10% 20%)')).toBe('#1acc1a');
    expect(hex('hwb(0 60% 60%)')).toBe('#808080');
    expect(parseColor('hwb(0, 0%, 0%)')).toBeNull();
    expect(parseColor('hwb(0 0% 0deg)')).toBeNull();
  });
});

describe('parseColor: lab(), lch(), oklab(), oklch() and color()', () => {
  it('reads them, with percentages scaled as CSS specifies', () => {
    expect(hex('lab(54.29 80.8 69.89)')).toBe('#ff0000');
    expect(hex('lab(54.29% 64.64% 55.912%)')).toBe('#ff0000');
    expect(hex('lch(54.29 106.84 40.85)')).toBe('#ff0000');
    expect(hex('lch(54.29 71.227% 40.85deg)')).toBe('#ff0000');
    expect(hex('oklab(0.628 0.2249 0.1258)')).toBe('#ff0000');
    expect(hex('oklab(62.8% 56.225% 31.45%)')).toBe('#ff0000');
    expect(hex('oklch(62.8% 0.2577 29.23)')).toBe('#ff0000');
    expect(hex('oklch(0.628 64.425% 29.23 / 1)')).toBe('#ff0000');
    expect(hex('oklch(100% 0 0)')).toBe('#ffffff');
    expect(hex('oklch(150% 0.1 20)')).toBe('#ffffff');
    expect(hex('lab(-10 0 0)')).toBe('#000000');
    expect(hex('oklch(70% -0.1 20)')).toBe(hex('oklch(70% 0 20)'));
  });

  it('reads color() in every supported space, keeping out-of-sRGB colours exact', () => {
    expect(hex('color(srgb 1 0 0)')).toBe('#ff0000');
    expect(hex('color(srgb 100% 0% 0% / 50%)')).toBe('#ff000080');
    expect(hex('color(srgb-linear 1 0 0)')).toBe('#ff0000');
    expect(hex('color(xyz 0.4124 0.2126 0.0193)')).toBe('#ff0000');
    expect(hex('color(xyz-d65 0.4124 0.2126 0.0193)')).toBe('#ff0000');
    expect(hex('color(xyz-d50 0.4361 0.2225 0.0139)')).toBe('#ff0000');
    const p3 = parseColor('color(display-p3 1 0 0)');
    expect(p3?.r).toBeGreaterThan(1);
    expect(p3?.g).toBeLessThan(0);
    for (const bad of ['color(rec2020 1 0 0)', 'color(srgb 1 0)', 'color(srgb, 1, 0, 0)', 'color(srgb 1deg 0 0)', 'color(srgb 1 0 0 / 1deg)', 'color()', 'color(1 0 0)']) {
      expect(parseColor(bad), bad).toBeNull();
    }
  });

  it('rejects the comma syntax, angles where they do not belong, and unknown functions', () => {
    for (const bad of ['lab(50, 0, 0)', 'oklch(50% 0.1deg 20)', 'lab(50 0 0deg)', 'lch(50 0 0%)', 'oklab(50% 0 0 / 2deg)', 'device-cmyk(0 0 0 1)', 'color-mix(in srgb, red, blue)', 'var(--x)']) {
      expect(parseColor(bad), bad).toBeNull();
    }
  });

  it('never throws, and ignores very long input', () => {
    expect(parseColor(`#${'f'.repeat(300)}`)).toBeNull();
    expect(parseColor(`rgb(${' '.repeat(300)}0 0 0)`)).toBeNull();
    expect(parseColor(42 as never)).toBeNull();
    expect(parseColor('rgb((0 0 0))')).toBeNull();
    for (const bad of ['rgb(a% 0 0)', 'hsl(1.2.3deg 100% 50%)', 'rgb(1.2.3 0 0)', 'rgb(0 0 0 / x%)', 'foo(1 2 3)']) expect(parseColor(bad), bad).toBeNull();
  });
});
