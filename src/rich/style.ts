import { contrastRatio } from '../color/contrast';
import { color as rgb, toGamut, type Color } from '../color/convert';
import { formatColor } from '../color/format';
import { parseColor } from '../color/parse';

/** Where styles come from: `getComputedStyle` for a live element, the `style` attribute otherwise. */
export interface StyleSource {
  getPropertyValue(name: string): string;
}

/**
 * How colours are copied:
 * - `readable` (default): every colour, made opaque, except text that would be hard to
 *   read where it lands (contrast under 3:1 on its background, or on white), such as
 *   light text from a dark theme
 * - `keep`: every colour, made opaque
 * - `none`: no colours: the destination's own text colour and background
 */
export type RichColors = 'readable' | 'keep' | 'none';

export const INHERITED = ['color', 'font-family', 'font-size', 'font-style', 'font-weight', 'text-align', 'white-space', 'text-transform', 'list-style-type', 'border-collapse'] as const;
const SIDES = ['top', 'right', 'bottom', 'left'] as const;
const OWN = [
  'background-color',
  'text-decoration-line',
  'vertical-align',
  'border-top-width', 'border-top-style', 'border-top-color', 'padding-top',
  'border-right-width', 'border-right-style', 'border-right-color', 'padding-right',
  'border-bottom-width', 'border-bottom-style', 'border-bottom-color', 'padding-bottom',
  'border-left-width', 'border-left-style', 'border-left-color', 'padding-left',
] as const;
export const PROPERTIES = [...INHERITED, ...OWN] as const;
export type Property = (typeof PROPERTIES)[number];
const INHERITED_SET: ReadonlySet<Property> = /* @__PURE__ */ new Set<Property>(INHERITED);

/**
 * What an element gets from its parent: the inherited values, with its own declared
 * ones on top. Lists set their own marker, as browsers' default styles do, so a list
 * doesn't inherit its parent list's marker.
 */
export function inherit(parent: Values, own?: Values, tag = ''): Values {
  const merged = {} as Record<Property, string>;
  for (const name of PROPERTIES) {
    const value = own === undefined ? '' : own[name];
    const inherits = INHERITED_SET.has(name) && !(name === 'list-style-type' && (tag === 'ul' || tag === 'ol'));
    merged[name] = value !== '' ? value : inherits ? parent[name] : '';
  }
  return merged;
}

/** Raw values of every property above, as the source reports them (`''` when unset), and the display type. */
export type Values = Readonly<Record<Property, string>> & { readonly display?: string };

export function readValues(source: StyleSource): Values {
  const values = {} as Record<Property, string>;
  for (const name of PROPERTIES) values[name] = source.getPropertyValue(name).trim().toLowerCase();
  return values;
}

/** Inherited values every rendering starts from: an empty parent for the root. */
export const ROOT_PARENT: Values = /* @__PURE__ */ Object.freeze({
  ...(Object.fromEntries(PROPERTIES.map((name) => [name, ''])) as Record<Property, string>),
  'font-style': 'normal',
  'font-weight': '400',
  'text-align': 'start',
  'white-space': 'normal',
  'text-transform': 'none',
  'border-collapse': 'separate',
});

const KEYWORDS: Readonly<Record<string, RegExp>> = {
  'font-style': /^(?:normal|italic|oblique)$/,
  'text-align': /^(?:left|right|center|justify)$/,
  'white-space': /^(?:normal|pre|pre-wrap|pre-line|nowrap|break-spaces)$/,
  'text-transform': /^(?:none|uppercase|lowercase|capitalize)$/,
  'list-style-type': /^(?:none|disc|circle|square|decimal|decimal-leading-zero|lower-alpha|upper-alpha|lower-latin|upper-latin|lower-roman|upper-roman|lower-greek)$/,
  'border-collapse': /^(?:collapse|separate)$/,
  'vertical-align': /^(?:top|bottom)$/,
};
const LENGTH = /^(?:0|\d{1,4}(?:\.\d+)?(?:px|pt|em|%))$/;
const FONT_FAMILY = /^[\w\s,'"-]{1,200}$/;

/** Elements whose default style already shows a value: writing it again adds nothing. */
const TAG_DEFAULTS: Readonly<Record<string, Readonly<Partial<Record<Property, string>>>>> = {
  b: { 'font-weight': '700' },
  strong: { 'font-weight': '700' },
  th: { 'font-weight': '700', 'text-align': 'center' },
  h1: { 'font-weight': '700' },
  h2: { 'font-weight': '700' },
  h3: { 'font-weight': '700' },
  h4: { 'font-weight': '700' },
  h5: { 'font-weight': '700' },
  h6: { 'font-weight': '700' },
  em: { 'font-style': 'italic' },
  i: { 'font-style': 'italic' },
  cite: { 'font-style': 'italic' },
  dfn: { 'font-style': 'italic' },
  var: { 'font-style': 'italic' },
  pre: { 'white-space': 'pre' },
  ol: { 'list-style-type': 'decimal' },
  ul: { 'list-style-type': 'disc' },
  li: { 'list-style-type': '' },
  a: { 'text-decoration-line': 'underline' },
  u: { 'text-decoration-line': 'underline' },
  ins: { 'text-decoration-line': 'underline' },
  s: { 'text-decoration-line': 'line-through' },
  del: { 'text-decoration-line': 'line-through' },
};

const weight = (value: string): string => (value === 'bold' ? '700' : value === 'normal' ? '400' : /^[1-9]00$/.test(value) ? value : '');
/** `start` and `end` as the left and right they mean in left-to-right text. */
const align = (value: string): string => {
  if (value === 'start') return 'left';
  if (value === 'end') return 'right';
  // Engines' internal names for the default centring of table headers.
  return value === '-webkit-center' || value === '-internal-center' || value === '-moz-center' ? 'center' : value;
};

/** A colour as an opaque hex value, drawn over `under`; `null` for none or invisible. */
function opaque(value: string, under: Color): Color | null {
  const c = parseColor(value);
  if (c === null || c.alpha === 0) return null;
  const mapped = toGamut(c);
  const mix = (top: number, bottom: number) => top * c.alpha + bottom * (1 - c.alpha);
  return rgb(mix(mapped.r, under.r), mix(mapped.g, under.g), mix(mapped.b, under.b));
}

export const WHITE: Color = /* @__PURE__ */ rgb(1, 1, 1);

/** Pixel lengths rounded to 2 decimals; other units kept as written. */
function length(value: string): string | null {
  if (!LENGTH.test(value)) return null;
  return value.endsWith('px') ? `${String(Math.round(parseFloat(value) * 100) / 100)}px` : value;
}

export interface StyleResult {
  /** The `style` attribute to write, or `''`. */
  readonly css: string;
  /** The background the element's content is drawn on, for its children's contrast checks. */
  readonly background: Color;
  /** Whether a text colour was left out to stay readable. */
  readonly droppedColor: boolean;
}

/**
 * The declarations to write for an element: inherited properties where they differ
 * from the parent (all of them at the root), and the element's own box and decoration.
 */
export function declarations(tag: string, values: Values, parent: Values, background: Color, colors: RichColors): StyleResult {
  const out: string[] = [];
  const defaults = TAG_DEFAULTS[tag] ?? {};
  const changed = (name: Property, value: string) => value !== '' && value !== parent[name] && value !== defaults[name];
  let droppedColor = false;
  let own = background;

  // Background first: the text colour's contrast is checked against it.
  if (colors !== 'none') {
    const bg = opaque(values['background-color'], background);
    if (bg !== null) {
      own = bg;
      out.push(`background-color:${formatColor(bg)}`);
    }
  }
  const family = values['font-family'];
  if (changed('font-family', family) && FONT_FAMILY.test(family)) out.push(`font-family:${family}`);
  const size = length(values['font-size']);
  if (size !== null && changed('font-size', values['font-size'])) out.push(`font-size:${size}`);
  const fontWeight = weight(values['font-weight']);
  if (fontWeight !== weight(parent['font-weight']) && changed('font-weight', fontWeight)) out.push(`font-weight:${fontWeight}`);
  for (const name of ['font-style', 'white-space', 'text-transform', 'border-collapse'] as const) {
    const value = values[name];
    if (changed(name, value) && (KEYWORDS[name] as RegExp).test(value)) out.push(`${name}:${value}`);
  }
  const textAlign = align(values['text-align']);
  if (textAlign !== align(parent['text-align']) && textAlign !== defaults['text-align'] && (KEYWORDS['text-align'] as RegExp).test(textAlign)) {
    out.push(`text-align:${textAlign}`);
  }
  if (tag === 'ul' || tag === 'ol') {
    const list = values['list-style-type'];
    if (list !== defaults['list-style-type'] && list !== 'circle' && list !== 'square' && (KEYWORDS['list-style-type'] as RegExp).test(list)) out.push(`list-style-type:${list}`);
  }
  if (colors !== 'none' && changed('color', values['color'])) {
    const text = opaque(values['color'], own);
    if (text !== null) {
      if (colors === 'readable' && contrastRatio(text, own) < 3) droppedColor = true;
      else out.push(`color:${formatColor(text)}`);
    }
  }
  const decoration = values['text-decoration-line'];
  if (decoration !== '' && decoration !== defaults['text-decoration-line'] && /^(?:none|(?:underline|overline|line-through)(?: (?:underline|overline|line-through))*)$/.test(decoration)) {
    // Links are underlined by default in mail: a link drawn without one says so.
    if (decoration !== 'none' || tag === 'a') out.push(`text-decoration:${decoration}`);
  }
  const vertical = values['vertical-align'];
  if ((tag === 'td' || tag === 'th') && (KEYWORDS['vertical-align'] as RegExp).test(vertical)) out.push(`vertical-align:${vertical}`);
  out.push(...box(values, own, colors));
  return { css: out.join(';'), background: own, droppedColor };
}

/** Borders and padding, as shorthands where every side is the same. */
function box(values: Values, background: Color, colors: RichColors): string[] {
  const borders = SIDES.map((side) => {
    const width = length(values[`border-${side}-width`]);
    const style = values[`border-${side}-style`];
    if (width === null || width === '0' || width === '0px' || !/^(?:solid|dashed|dotted|double)$/.test(style)) return null;
    const lineColor = colors === 'none' ? null : opaque(values[`border-${side}-color`], background);
    return `${width} ${style}${lineColor === null ? '' : ` ${formatColor(lineColor)}`}`;
  });
  const out: string[] = [];
  if (borders.every((border) => border !== null && border === borders[0])) out.push(`border:${borders[0] as string}`);
  else borders.forEach((border, index) => {
    if (border !== null) out.push(`border-${SIDES[index] as string}:${border}`);
  });
  const padding = SIDES.map((side) => length(values[`padding-${side}`]) ?? '0');
  if (padding.some((value) => value !== '0' && value !== '0px')) {
    out.push(`padding:${padding.map((value) => (value === '0px' ? '0' : value)).join(' ')}`);
  }
  return out;
}
