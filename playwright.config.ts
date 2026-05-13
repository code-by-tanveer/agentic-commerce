import { defineConfig, devices } from '@playwright/test';

// Single source of truth for the post-mortem QA gate. `npm run e2e` boots both
// servers (via the `webServer` blocks) and runs every spec under `tests/e2e/`.
// The spec at `tests/e2e/firstchat.spec.ts` is the load-bearing one — it
// closes the gap that six polish cycles missed: nobody ever typed "hi" into
// the running app. The webServer wiring reuses the existing dev scripts so
// the gate exercises the same code path a real developer hits.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: 'npm run dev:backend',
      url: 'http://localhost:4000/health',
      timeout: 30_000,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npm run dev:frontend',
      url: 'http://localhost:3000',
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
