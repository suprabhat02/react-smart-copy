import { copyFailure } from '../core/errors';
import { SVG_MIME_TYPE } from '../core/mime';
import { resolveCaptureEnvironment } from './environment';
import { drawBlobToPng } from './render';
import { resolveRenderSettings, resolveSize, toPixelSize, type RenderOptions, type Size } from './options';

export const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
/** Refuse absurd markup before handing it to the image decoder. 10 M characters. */
export const DEFAULT_MAX_SVG_LENGTH = 10_000_000;

export interface SvgToPngOptions extends RenderOptions {
  /** Max markup length in characters. Default 10 000 000. */
  readonly maxLength?: number;
}

// Both patterns are linear-time: untrusted markup must not be able to trigger catastrophic backtracking.
const SVG_OPEN = /<svg\b/i;
const LENGTH = /^(\d+(?:\.\d+)?|\.\d+)(?:px)?$/i;

/** The first `<svg …>` tag, found with two linear scans. */
function findRootTag(markup: string): string | null {
  const start = markup.search(SVG_OPEN);
  if (start === -1) return null;
  const end = markup.indexOf('>', start);
  return end === -1 ? null : markup.slice(start, end + 1);
}

// Pre-compiled attribute patterns for the three attributes we ever read.
// Compiling at module load time and with fixed literal names eliminates any
// risk of ReDoS from runtime-constructed RegExps.
const ATTR_PATTERNS: Readonly<Record<string, RegExp>> = /* @__PURE__ */ Object.freeze({
  width: /\swidth\s*=\s*(["'])(.*?)\1/i,
  height: /\sheight\s*=\s*(["'])(.*?)\1/i,
  viewBox: /\sviewBox\s*=\s*(["'])(.*?)\1/i,
  xmlns: /\sxmlns\s*=\s*(["'])(.*?)\1/i,
});

function readAttribute(tag: string, name: keyof typeof ATTR_PATTERNS): string | null {
  const pattern = ATTR_PATTERNS[name];
  /* c8 ignore next -- TypeScript enforces name is a key of ATTR_PATTERNS; guard is for JS callers only */
  if (!pattern) return null;
  const match = pattern.exec(tag);
  return match === null ? null : String(match[2]);
}

function parseLength(value: string | null): number | null {
  if (value === null) return null;
  const match = LENGTH.exec(value.trim());
  const number = match ? Number(match[1]) : NaN;
  return number > 0 ? number : null;
}

/** Intrinsic size from the root tag: `width`/`height` in px, else the `viewBox`. */
export function readSvgSize(markup: string): Size | null {
  const tag = findRootTag(markup);
  if (tag === null) return null;
  const width = parseLength(readAttribute(tag, 'width'));
  const height = parseLength(readAttribute(tag, 'height'));
  if (width !== null && height !== null) return { width, height };

  const raw = readAttribute(tag, 'viewBox');
  const viewBox = raw != null ? raw.trim().split(/[\s,]+/).map(Number) : [];
  const [, , boxWidth = NaN, boxHeight = NaN] = viewBox;
  if (viewBox.length !== 4 || !(boxWidth > 0) || !(boxHeight > 0)) return null;
  if (width !== null) return { width, height: (width * boxHeight) / boxWidth };
  if (height !== null) return { width: (height * boxWidth) / boxHeight, height };
  return { width: boxWidth, height: boxHeight };
}

/** Adds the SVG namespace when missing; `<img>` refuses to decode SVG without it. */
export function ensureSvgNamespace(markup: string): string {
  const tag = findRootTag(markup);
  if (tag === null) throw copyFailure('invalid-payload', 'The markup has no <svg> root element.');
  if (readAttribute(tag, 'xmlns') !== null) return markup;
  return markup.replace(SVG_OPEN, `<svg xmlns="${SVG_NAMESPACE}"`);
}

const isSvgElement = (value: Element): boolean => value.localName === 'svg';

/**
 * Rasterises SVG (an `<svg>` element or markup) to a PNG Blob, ready for
 * `copy({ kind: 'image', blob })`.
 *
 * Security: the SVG is decoded as an *image*, where browsers disable scripts,
 * event handlers and external resource loading, and it is never inserted into
 * the document. Size is capped in characters and pixels.
 */
export async function svgToPngBlob(source: Element | string, options: SvgToPngOptions = {}): Promise<Blob> {
  const environment = resolveCaptureEnvironment(options.environment);
  const settings = resolveRenderSettings(options);
  const maxLength = options.maxLength ?? DEFAULT_MAX_SVG_LENGTH;

  let intrinsic: Size | null = null;
  let markup: string;
  if (typeof source === 'string') {
    markup = source;
  } else {
    if (!isSvgElement(source)) throw copyFailure('invalid-payload', `Expected an <svg> element, got <${source.localName}>.`);
    const rect = source.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) intrinsic = { width: rect.width, height: rect.height };
    markup = environment.serializeSvg(source);
  }

  if (markup.length > maxLength) {
    throw copyFailure('too-large', `The SVG markup exceeds ${String(maxLength)} characters.`);
  }
  const prepared = ensureSvgNamespace(markup);
  const size = resolveSize(intrinsic ?? readSvgSize(prepared), options.width, options.height);
  const target = toPixelSize(size, settings);

  const blob = new Blob([prepared], { type: SVG_MIME_TYPE });
  return drawBlobToPng(blob, target, settings, environment, options.signal, 'SVG rasterisation');
}
