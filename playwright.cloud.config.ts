import { defineConfig } from '@playwright/test';
import { randomUUID } from 'node:crypto';
export default defineConfig({
  testDir: './tests/e2e',
  outputDir: 'test-results/cloud-browser',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:8791',
    headless: true,
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `wrangler dev --port 8791 --var APP_ORIGIN:http://127.0.0.1:8791 --persist-to test-results/cloud-state-${randomUUID()}`,
    url: 'http://127.0.0.1:8791/api/health',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
