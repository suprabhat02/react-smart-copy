import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests in real browser engines: Chromium, Firefox and WebKit (Safari's engine).
 * They run against the built docs site (`npm run site:build`), which loads the built
 * package, so they test what is published. `PW_CHROMIUM_PATH` points at a local
 * Chromium when Playwright's own download isn't available.
 */
const chromiumPath = process.env['PW_CHROMIUM_PATH'];

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: process.env['CI'] !== undefined,
  retries: 0,
  reporter: process.env['CI'] === undefined ? 'list' : [['github'], ['list']],
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  webServer: { command: 'node e2e/serve.js', url: 'http://127.0.0.1:4173/', reuseExistingServer: process.env['CI'] === undefined },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['clipboard-read', 'clipboard-write'],
        ...(chromiumPath === undefined ? {} : { launchOptions: { executablePath: chromiumPath } }),
      },
    },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
