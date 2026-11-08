import { defineConfig, devices } from '@playwright/test';

/**
 * Real clipboard captures from Chromium and Firefox (`npm run corpus:browsers`).
 * Same static server as the end-to-end tests.
 */
const chromiumPath = process.env['PW_CHROMIUM_PATH'];

export default defineConfig({
  testDir: 'corpus-capture',
  testMatch: '*.spec.ts',
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4173/react-smart-copy/', permissions: [] },
  webServer: { command: 'node e2e/serve.js', url: 'http://127.0.0.1:4173/react-smart-copy/', reuseExistingServer: true },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(chromiumPath === undefined ? {} : { launchOptions: { executablePath: chromiumPath } }),
        permissions: ['clipboard-read', 'clipboard-write'],
      },
    },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    // No WebKit: its Linux build does not put a native selection copy on the clipboard, and it
    // would not be Safari's macOS output anyway. A Safari capture comes from the Inspector on a Mac.
  ],
});
