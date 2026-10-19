/**
 * Colour space conversions, from the CSS Color 4 specification's sample code.
 * A {@link Color} is stored as extended sRGB: gamma-encoded r, g and b, which go
 * below 0 or above 1 for colours outside sRGB (a Display P3 or OKLCH colour), and
 * alpha in [0, 1]. Every conversion keeps such colours exact until a format needs
 * them in a gamut.
 */

/** A colour: extended sRGB channels (0 to 1 inside sRGB) and alpha (0 to 1). */
export interface Color {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly alpha: number;
}

export type Vec3 = readonly [number, number, number];
type Mat3 = readonly [Vec3, Vec3, Vec3];

/** The gamuts a colour can be mapped into: sRGB (every screen) and Display P3 (wide-gamut screens). */
export type Gamut = 'srgb' | 'p3';

export const color = (r: number, g: number, b: number, alpha = 1): Color => Object.freeze({ r, g, b, alpha });

const mul = (m: Mat3, [x, y, z]: Vec3): Vec3 => [
  m[0][0] * x + m[0][1] * y + m[0][2] * z,
  m[1][0] * x + m[1][1] * y + m[1][2] * z,
  m[2][0] * x + m[2][1] * y + m[2][2] * z,
];

/** The sRGB (and Display P3) transfer function, extended to negative values by symmetry. */
const toLinear = (c: number): number => {
  const abs = Math.abs(c);
  return abs <= 0.04045 ? c / 12.92 : Math.sign(c) * ((abs + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (c: number): number => {
  const abs = Math.abs(c);
  return abs > 0.0031308 ? Math.sign(c) * (1.055 * abs ** (1 / 2.4) - 0.055) : 12.92 * c;
};

export const linearRgb = (c: Color): Vec3 => [toLinear(c.r), toLinear(c.g), toLinear(c.b)];
export const fromLinearRgb = ([r, g, b]: Vec3, alpha: number): Color => color(fromLinear(r), fromLinear(g), fromLinear(b), alpha);

const SRGB_TO_XYZ: Mat3 = [
  [0.41239079926595934, 0.357584339383878, 0.1804807884018343],
  [0.21263900587151027, 0.715168678767756, 0.07219231536073371],
  [0.01933081871559182, 0.11919477979462598, 0.9505321522496607],
];
const XYZ_TO_SRGB: Mat3 = [
  [3.2409699419045226, -1.537383177570094, -0.4986107602930034],
  [-0.9692436362808796, 1.8759675015077202, 0.04155505740717559],
  [0.05563007969699366, -0.20397695888897652, 1.0569715142428786],
];
const P3_TO_XYZ: Mat3 = [
  [0.4865709486482162, 0.26566769316909306, 0.1982172852343625],
  [0.2289745640697488, 0.6917385218365064, 0.079286914093745],
  [0, 0.04511338185890264, 1.043944368900976],
];
const XYZ_TO_P3: Mat3 = [
  [2.493496911941425, -0.9313836179191239, -0.40271078445071684],
  [-0.8294889695615747, 1.7626640603183463, 0.023624685841943577],
  [0.03584583024378447, -0.07617238926804182, 0.9568845240076872],
];
/** Bradford chromatic adaptation between the D65 and D50 white points (Lab and LCH use D50). */
const D65_TO_D50: Mat3 = [
  [1.0479297925449969, 0.022946870601609652, -0.05019226628920524],
  [0.02962780877005599, 0.9904344267538799, -0.017073799063418826],
  [-0.009243040646204504, 0.015055191490298152, 0.7518742814281371],
];
const D50_TO_D65: Mat3 = [
  [0.955473421488075, -0.02309845494876471, 0.06325924320057072],
  [-0.0283697093338637, 1.0099953980813041, 0.021041441191917323],
  [0.012314014864481998, -0.020507649298898964, 1.330365926242124],
];
/** Linear sRGB to OKLab's cone responses, and back. */
const LRGB_TO_LMS: Mat3 = [
  [0.412221469470763, 0.5363325372617348, 0.0514459932675022],
  [0.2119034958178252, 0.6806995506452344, 0.1073969535369406],
  [0.0883024591900564, 0.2817188391361215, 0.6299787016738222],
];
const LMS_TO_LRGB: Mat3 = [
  [4.0767416360759574, -3.3077115392580616, 0.2309699031821044],
  [-1.2684379732850317, 2.6097573492876887, -0.3413193760026573],
  [-0.0041960761386756, -0.7034186179359362, 1.7076146940746117],
];
const LMS_TO_OKLAB: Mat3 = [
  [0.210454268309314, 0.7936177747023054, -0.0040720430116193],
  [1.9779985324311684, -2.4285922420485799, 0.450593709617411],
  [0.0259040424655478, 0.7827717124575296, -0.8086757549230774],
];
const OKLAB_TO_LMS: Mat3 = [
  [1, 0.3963377773761749, 0.2158037573099136],
  [1, -0.1055613458156586, -0.0638541728258133],
  [1, -0.0894841775298119, -1.2914855480194092],
];

export const toXyz = (c: Color): Vec3 => mul(SRGB_TO_XYZ, linearRgb(c));
export const fromXyz = (xyz: Vec3, alpha: number): Color => fromLinearRgb(mul(XYZ_TO_SRGB, xyz), alpha);

/** Display P3 channels (gamma-encoded, 0 to 1 inside P3). */
export const toP3 = (c: Color): Vec3 => mul(XYZ_TO_P3, toXyz(c)).map(fromLinear) as unknown as Vec3;
export const fromP3 = (p3: Vec3, alpha: number): Color => fromXyz(mul(P3_TO_XYZ, p3.map(toLinear) as unknown as Vec3), alpha);
export const fromXyzD50 = (xyz: Vec3, alpha: number): Color => fromXyz(mul(D50_TO_D65, xyz), alpha);

/** OKLab: L in [0, 1], a and b around ±0.4. */
export const toOklab = (c: Color): Vec3 => mul(LMS_TO_OKLAB, mul(LRGB_TO_LMS, linearRgb(c)).map(Math.cbrt) as unknown as Vec3);
export const fromOklab = (lab: Vec3, alpha: number): Color =>
  fromLinearRgb(mul(LMS_TO_LRGB, mul(OKLAB_TO_LMS, lab).map((v) => v ** 3) as unknown as Vec3), alpha);

const D50_WHITE: Vec3 = [0.3457 / 0.3585, 1, (1 - 0.3457 - 0.3585) / 0.3585];
const KAPPA = 24389 / 27;
const EPSILON = 216 / 24389;

/** CIE Lab (D50): L in [0, 100], a and b around ±125. */
export const toLab = (c: Color): Vec3 => {
  const [x, y, z] = mul(D65_TO_D50, toXyz(c)).map((v, i) => v / (D50_WHITE[i] as number)) as unknown as Vec3;
  const f = (v: number) => (v > EPSILON ? Math.cbrt(v) : (KAPPA * v + 16) / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};
export const fromLab = ([l, a, b]: Vec3, alpha: number): Color => {
  const fy = (l + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;
  const xyz: Vec3 = [
    fx ** 3 > EPSILON ? fx ** 3 : (116 * fx - 16) / KAPPA,
    l > KAPPA * EPSILON ? fy ** 3 : l / KAPPA,
    fz ** 3 > EPSILON ? fz ** 3 : (116 * fz - 16) / KAPPA,
  ];
  return fromXyzD50(xyz.map((v, i) => v * (D50_WHITE[i] as number)) as unknown as Vec3, alpha);
};

/** Lab-like to its polar form: lightness, chroma, and hue in degrees from 0 to 360. */
export const toPolar = ([l, a, b]: Vec3): Vec3 => [l, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360];
export const fromPolar = ([l, c, h]: Vec3): Vec3 => [l, c * Math.cos((h * Math.PI) / 180), c * Math.sin((h * Math.PI) / 180)];

/** Hue, saturation and lightness of a colour inside sRGB (hue 0 for greys), with s and l in [0, 1]. */
export function toHsl(c: Color): Vec3 {
  const max = Math.max(c.r, c.g, c.b);
  const min = Math.min(c.r, c.g, c.b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  // Callers pass sRGB colours: with d > 0, l is strictly between 0 and 1.
  const s = (max - l) / Math.min(l, 1 - l);
  let h: number;
  if (max === c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6 : 0);
  else if (max === c.g) h = (c.b - c.r) / d + 2;
  else h = (c.r - c.g) / d + 4;
  return [h * 60, s, l];
}

export function fromHsl(h: number, s: number, l: number, alpha: number): Color {
  const hue = ((h % 360) + 360) % 360;
  const f = (n: number) => {
    const k = (n + hue / 30) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return color(f(0), f(8), f(4), alpha);
}

export function fromHwb(h: number, w: number, b: number, alpha: number): Color {
  if (w + b >= 1) {
    const grey = w / (w + b);
    return color(grey, grey, grey, alpha);
  }
  const pure = fromHsl(h, 1, 0.5, 1);
  const scale = (v: number) => v * (1 - w - b) + w;
  return color(scale(pure.r), scale(pure.g), scale(pure.b), alpha);
}

/** Hue, whiteness and blackness of an sRGB colour, with w and b in [0, 1]. */
export function toHwb(c: Color): Vec3 {
  const [h] = toHsl(c);
  return [h, Math.min(c.r, c.g, c.b), 1 - Math.max(c.r, c.g, c.b)];
}

/** Distance in OKLab: about 0.02 is the smallest difference people notice. */
const deltaEOK = (a: Color, b: Color): number => {
  const [l1, a1, b1] = toOklab(a);
  const [l2, a2, b2] = toOklab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
};

const channels = (c: Color, gamut: Gamut): Vec3 => (gamut === 'srgb' ? [c.r, c.g, c.b] : toP3(c));
const clip01 = (v: number) => Math.min(1, Math.max(0, v));
const clipTo = (c: Color, gamut: Gamut): Color => {
  const [x, y, z] = channels(c, gamut).map(clip01) as unknown as Vec3;
  return gamut === 'srgb' ? color(x, y, z, c.alpha) : fromP3([x, y, z], c.alpha);
};

/** Whether a colour is inside a gamut, within rounding error. */
export function inGamut(c: Color, gamut: Gamut = 'srgb'): boolean {
  return channels(c, gamut).every((v) => v >= -1e-6 && v <= 1 + 1e-6);
}

/**
 * The colour inside `gamut` that looks closest: the CSS Color 4 gamut mapping
 * algorithm, which keeps lightness and hue and reduces chroma in OKLCH until
 * clipping is no longer visible (`"map"`), or plain clipping of each channel (`"clip"`).
 */
export function toGamut(c: Color, gamut: Gamut = 'srgb', method: 'map' | 'clip' = 'map'): Color {
  if (inGamut(c, gamut)) return clipTo(c, gamut);
  if (method === 'clip') return clipTo(c, gamut);
  const [l, chroma, hue] = toPolar(toOklab(c));
  if (l >= 1) return clipTo(color(1, 1, 1, c.alpha), gamut);
  if (l <= 0) return clipTo(color(0, 0, 0, c.alpha), gamut);
  const JND = 0.02;
  let low = 0;
  let high = chroma;
  let lowInGamut = true;
  let current = c;
  let clipped = clipTo(current, gamut);
  if (deltaEOK(clipped, current) < JND) return clipped;
  while (high - low > 0.0001) {
    const mid = (low + high) / 2;
    current = fromOklab(fromPolar([l, mid, hue]), c.alpha);
    if (lowInGamut && inGamut(current, gamut)) {
      low = mid;
      continue;
    }
    clipped = clipTo(current, gamut);
    const e = deltaEOK(clipped, current);
    if (e < JND) {
      if (JND - e < 0.0001) return clipped;
      lowInGamut = false;
      low = mid;
    } else {
      high = mid;
    }
  }
  return clipped;
}
