/**
 * `react-smart-copy/color`
 *
 * Copy and paste colours the way design systems, colour pickers and design tools
 * need. Framework-agnostic and free of dependencies.
 *
 * - {@link colorPayload}: copy a colour in any CSS format, with a swatch for rich-text apps.
 * - {@link parseColor} and {@link formatColor}: read and write every CSS Color 4
 *   notation, from hex to `oklch()` and `color(display-p3 …)`, with CSS gamut mapping.
 * - {@link readColor} and {@link pasteAsColor}: read a pasted colour; paste any format
 *   into a field that takes one.
 * - {@link contrastRatio} and {@link contrastLevel}: WCAG 2 contrast.
 *
 * @module
 */

export { inGamut, toGamut, type Color, type Gamut } from './convert';
export { COLOR_FORMATS, formatColor, type ColorFormat, type ColorInput, type FormatColorOptions } from './format';
export { parseColor } from './parse';
export { contrastLevel, contrastRatio, type ContrastLevel, type ContrastLevelOptions } from './contrast';
export {
  colorPayload,
  pasteAsColor,
  readColor,
  type ColorPasteEvent,
  type ColorPayloadOptions,
  type ColorSource,
  type PasteAsColorOptions,
  type ReadColorOptions,
} from './payload';
export { insertText } from '../core/text-field';
