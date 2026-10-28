import { defineConfig } from 'vitest/config';

/**
 * `npm run bench`: the parser benchmarks in bench/, in the benchmark project Vitest creates
 * for `benchmark.include`, in jsdom (the HTML parsers need a DOM). No regular tests run here,
 * and `npm test` never runs benchmarks.
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: [],
    benchmark: { enabled: true, include: ['bench/**/*.bench.ts'] },
  },
});
