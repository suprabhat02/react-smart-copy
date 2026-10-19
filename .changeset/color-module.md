---
"react-smart-copy": minor
---

Add `react-smart-copy/color`: copy and paste colours in every CSS format.

- `colorPayload(color, { format })` copies a colour as hex, `rgb()`, `hsl()`, `hwb()`, `oklch()`, `oklab()`, `lab()`, `lch()` or `color(display-p3 …)`. Docs, Notion, Slack and mail also get a small swatch (`swatch: false` turns it off).
- `parseColor` reads every CSS Color 4 notation: hex, the 148 named colours, `rgb()` and `hsl()` in both syntaxes, `hwb()`, `lab()`, `lch()`, `oklab()`, `oklch()`, and `color()` in `srgb`, `srgb-linear`, `display-p3`, `xyz`, `xyz-d65` and `xyz-d50`. It returns `null` for anything else and never throws.
- `formatColor` writes any of the formats. The default precision brings every 8-bit colour back exactly; this was checked on 836,056 colours. Colours outside sRGB are gamut-mapped as CSS Color 4 specifies (chroma reduced in OKLCH, hue kept); `gamut: "clip"` clips them instead. `inGamut` and `toGamut` are exported too.
- `readColor` reads a pasted colour, including declarations copied from developer tools (`color: #3b82f6;`). `pasteAsColor` inserts any pasted colour in a field's format and keeps the browser's undo.
- `contrastRatio` and `contrastLevel`: WCAG 2 contrast for normal and large text, never rounded up.
- Accuracy is property-tested against culori, and checked against the browser's own CSS parser in Chromium, Firefox and WebKit.
