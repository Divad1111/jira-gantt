import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test/browser', workers: 1, reporter: 'list', timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:4178', headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', viewport: { width: 1440, height: 1000 } },
  webServer: { command: 'node test/mock-server.mjs', port: 4178, reuseExistingServer: false }
});
