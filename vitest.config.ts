import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['test/setup.ts'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      reporter: ['text', 'lcov'],
      // The library is small and critical: every statement, branch, function and line is tested.
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
