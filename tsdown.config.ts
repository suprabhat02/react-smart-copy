import { defineConfig } from 'tsdown';

/**
 * One build for every entry point, so code they share (the copy and paste core, CopyFailure,
 * the payload helpers) is emitted once, in dist/chunks/, and imported by each entry that needs
 * it. An app that uses several entry points loads the core once, and CopyFailure is one class.
 */
export default defineConfig({
  entry: {
    // React entry: a client module for Next.js App Router / RSC.
    index: 'src/index.ts',
    // Framework-agnostic core: importable anywhere, including server code.
    core: 'src/core/index.ts',
    // Opt-in image capture (SVG + DOM). Separate so it costs nothing unless imported.
    capture: 'src/capture/index.ts',
    // Test utilities: mock adapters and result builders for consumer test suites.
    testing: 'src/testing/index.ts',
    // Spreadsheet-ready tables: copy, paste and grid adapters. Opt-in, like capture.
    table: 'src/table/index.ts',
    // Typed, versioned application data on the clipboard. Opt-in, like table.
    structured: 'src/structured/index.ts',
    // Paste rich content as Markdown. Opt-in, like table and structured.
    markdown: 'src/markdown/index.ts',
    // Copy and paste code: sessions, diffs, highlighted blocks, Trojan Source checks. Opt-in.
    code: 'src/code/index.ts',
    // Make pasted images safe and small: metadata, resizing, byte budgets. Opt-in.
    image: 'src/image/index.ts',
    // Copy links that paste well, link to a passage, read pasted links. Opt-in.
    link: 'src/link/index.ts',
    // Share sheet or copy, framework-agnostic (useShare lives in the React entry). Opt-in.
    share: 'src/share/index.ts',
    // Copy and paste colours in every CSS format, with gamut mapping and contrast. Opt-in.
    color: 'src/color/index.ts',
    // Portable rich text for mail, Docs, Word and Slack: sanitized, inline-styled. Opt-in.
    rich: 'src/rich/index.ts',
    // Take pasted and dropped files and folders safely: content types, risks, safe names, limits. Opt-in.
    files: 'src/files/index.ts',
    // Find and redact API keys, tokens, passwords, cards and IBANs in what is pasted and copied. Opt-in.
    secrets: 'src/secrets/index.ts',
    // Read one-time codes from pasted SMS and e-mail, and a code field of single-character boxes. Opt-in.
    otp: 'src/otp/index.ts',
    // Paste and copy numbers and amounts across locales: separators, currencies, exact decimals. Opt-in.
    number: 'src/number/index.ts',
    // Read pasted lists of e-mail recipients, checked, and copy them back with names. Opt-in.
    email: 'src/email/index.ts',
  },
  format: ['esm', 'cjs'],
  // Declarations come from TypeScript, which keeps the docs on every union member. src is also
  // written for `isolatedDeclarations` (tsconfig.lib.json checks it): every export's type is
  // explicit, so the public API never depends on what TypeScript infers.
  dts: { generator: 'tsc' },
  sourcemap: true,
  target: 'es2020',
  platform: 'neutral',
  deps: { neverBundle: ['react', 'react/jsx-runtime'] },
  clean: false,
  // Only the React entry is a client module. Shared chunks carry no directive: the React entry's
  // own import makes them client code there, and server code can import the other entries.
  banner: ({ fileName }) => (/^index\.c?js$/.test(fileName) ? { js: '"use client";' } : undefined),
  // Entry points stay at the top of dist/ (the package's exports); shared code goes in dist/chunks/.
  // tsdown's own names are kept (.js, .cjs, .d.ts, .d.cts by format), with the folder in front.
  outputOptions: (options) => {
    const names = options.chunkFileNames;
    return {
      ...options,
      chunkFileNames: typeof names === 'function' ? (chunk) => `chunks/${names(chunk)}` : `chunks/${names ?? '[name]-[hash].js'}`,
    };
  },
});
