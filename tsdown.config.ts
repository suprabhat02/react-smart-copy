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
]);
