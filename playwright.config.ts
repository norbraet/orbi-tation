import { defineConfig, devices } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4173";
const fixtureUrl = `${baseUrl}/test/browser/fixture.html`;

export default defineConfig({
  testDir: "test/browser",
  testMatch: "**/*.spec.ts",
  outputDir: "test-results",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: baseUrl,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "node test/browser/server.mjs",
    url: fixtureUrl,
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "pipe",
  },
});
