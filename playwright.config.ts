import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:1420',
    trace: 'on-first-retry',
  },
  projects: {
    setup: {
      testMatch: /.*\.setup\.ts/,
    },
    chromium: {
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
  },
  webServer: {
    command: 'npm run dev',
    port: 1420,
    reuseExistingServer: !process.env.CI,
  },
});
