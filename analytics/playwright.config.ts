import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config — Veridian Analytics POC.
 *
 * Les tests E2E attaquent une instance analytics deja running (soit locale
 * via `pnpm dev` soit l'instance dev-server via la var ANALYTICS_E2E_URL).
 *
 * Pour run localement :
 *   ANALYTICS_E2E_URL=http://100.92.215.42:3100 \
 *   ADMIN_API_KEY=<key> \
 *   pnpm playwright test
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // on ecrit dans la meme DB, ordonnancer
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: process.env.ANALYTICS_E2E_URL || 'http://100.92.215.42:3100',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    headless: true,
    viewport: { width: 1280, height: 900 },
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
