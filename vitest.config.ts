import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['test/setup.ts'],
    restoreMocks: true,
    coverage: { provider: 'v8', include: ['src/**'], reporter: ['text', 'lcov'] },
  },
});
