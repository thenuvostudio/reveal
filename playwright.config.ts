import { defineConfig, devices } from "@playwright/test";

// Tests run against the static build in ./out (run `bun run build` first; `bun run test:all` does both).
// Set CHROME_PATH to use an installed Chrome instead of Playwright's own Chromium.
const executablePath = process.env.CHROME_PATH || undefined;
const PORT = 4173;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  workers: 2,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    acceptDownloads: true,
    trace: "retain-on-failure",
    launchOptions: { executablePath, args: ["--no-sandbox"] },
  },
  webServer: { command: `bunx serve out -l ${PORT} --no-clipboard`, url: `http://localhost:${PORT}`, reuseExistingServer: true, timeout: 30_000 },
  projects: [
    { name: "desktop", testIgnore: /phone\.spec/, use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "phone", testMatch: /phone\.spec/, use: { ...devices["Pixel 7"], browserName: "chromium" } },
  ],
});
