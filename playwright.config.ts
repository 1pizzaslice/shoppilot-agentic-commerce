import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { executablePath: "/usr/bin/google-chrome-stable" },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      command: "corepack pnpm --filter @shoppilot/api dev",
      url: "http://127.0.0.1:3001/health/live",
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "corepack pnpm --filter @shoppilot/web dev",
      url: "http://127.0.0.1:3000",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
