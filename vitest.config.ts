import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * REACT_VERSION=18 runs the suite on React 18 from compat/react18 (installed with
 * `npm ci --prefix compat/react18` from its own lockfile). Every import of react and
 * react-dom, including Testing Library's, resolves there.
 */
const react18 = process.env['REACT_VERSION'] === '18' ? fileURLToPath(new URL('./compat/react18/node_modules', import.meta.url)) : null;

export default defineConfig({
  resolve: {
    alias:
      react18 === null
        ? []
        : [
            { find: /^react(\/.*)?$/, replacement: `${react18}/react$1` },
            { find: /^react-dom(\/.*)?$/, replacement: `${react18}/react-dom$1` },
            // Its ES module build, so its own react-dom imports are resolved (and aliased) here too.
            { find: /^@testing-library\/react$/, replacement: fileURLToPath(new URL('./node_modules/@testing-library/react/dist/@testing-library/react.esm.js', import.meta.url)) },
          ],
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['test/setup.ts'],
    restoreMocks: true,
    // Bundled with the tests, so its own react imports take the alias above too.
    server: { deps: { inline: react18 === null ? [] : ['@testing-library/react'] } },
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      reporter: ['text', 'lcov'],
      // The library is small and critical: every statement, branch, function and line is tested.
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
