import { defineConfig, type UserConfig } from 'tsdown';

const shared: UserConfig = {
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  target: 'es2020',
  platform: 'neutral',
  external: ['react', 'react/jsx-runtime'],
  clean: false,
};

export default defineConfig([
  // React entry: a client module for Next.js App Router / RSC.
  { ...shared, entry: { index: 'src/index.ts' }, banner: { js: '"use client";' } },
  // Framework-agnostic core: importable anywhere, including server code.
  { ...shared, entry: { core: 'src/core/index.ts' } },
  // Opt-in image capture (SVG + DOM). Separate so it costs nothing unless imported.
  { ...shared, entry: { capture: 'src/capture/index.ts' } },
  // Test utilities: mock adapters and result builders for consumer test suites.
  { ...shared, entry: { testing: 'src/testing/index.ts' } },
  // Spreadsheet-ready tables: copy, paste and grid adapters. Opt-in, like capture.
  { ...shared, entry: { table: 'src/table/index.ts' } },
  // Typed, versioned application data on the clipboard. Opt-in, like table.
  { ...shared, entry: { structured: 'src/structured/index.ts' } },
  // Paste rich content as Markdown. Opt-in, like table and structured.
  { ...shared, entry: { markdown: 'src/markdown/index.ts' } },
  // Copy and paste code: sessions, diffs, highlighted blocks, Trojan Source checks. Opt-in.
  { ...shared, entry: { code: 'src/code/index.ts' } },
  // Make pasted images safe and small: metadata, resizing, byte budgets. Opt-in.
  { ...shared, entry: { image: 'src/image/index.ts' } },
  // Copy links that paste well, link to a passage, read pasted links. Opt-in.
  { ...shared, entry: { link: 'src/link/index.ts' } },
  // Share sheet or copy, framework-agnostic (useShare lives in the React entry). Opt-in.
  { ...shared, entry: { share: 'src/share/index.ts' } },
  // Copy and paste colours in every CSS format, with gamut mapping and contrast. Opt-in.
  { ...shared, entry: { color: 'src/color/index.ts' } },
]);
