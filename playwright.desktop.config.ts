import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/desktop',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  workers: 1,
  outputDir: 'test-results/desktop',
  use: { trace: 'retain-on-failure' },
  webServer: {
    command: 'node scripts/test-server.mjs 4273 desktop-db',
    url: 'http://127.0.0.1:4273/api/health',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
