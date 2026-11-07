import { defineConfig, devices } from '@playwright/test';

/**
 * Browser benchmarks (`npm run bench:browser`): large real-world inputs, timed in each engine
 * on the built package. Results land in test-results/bench/<engine>.json and are summarised by
 * scripts/bench-report.mjs. Same server and pages as the end-to-end tests.
 */
const chromiumPath = process.env['PW_CHROMIUM_PATH'];
const only = process.env['BENCH_BROWSERS']?.split(',');

const projects = [
  { name: 'chromium', use: { ...devices['Desktop Chrome'], ...(chromiumPath === undefined ? {} : { launchOptions: { executablePath: chromiumPath } }) } },
  { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  { name: 'webkit', use: { ...devices['Desktop Safari'] } },
].filter((project) => only === undefined || only.includes(project.name));

export default defineConfig({
  testDir: 'bench/browser',
  testMatch: '*.bench.ts',
  timeout: 180_000,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4173/react-smart-copy/' },
  webServer: { command: 'node e2e/serve.js', url: 'http://127.0.0.1:4173/react-smart-copy/', reuseExistingServer: process.env['CI'] === undefined },
  projects,
});
