import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tools',
  testMatch: '*.browser.test.ts',
  timeout: 45_000,
  retries: 0,
  use: { browserName: 'chromium', headless: true },
  webServer: {
    command: 'python3 -m http.server 8321 --bind 127.0.0.1 --directory tools/spikes',
    url: 'http://127.0.0.1:8321',
    reuseExistingServer: false,
  },
});
