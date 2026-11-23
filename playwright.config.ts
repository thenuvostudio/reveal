import { defineConfig, devices } from "@playwright/test";

// Tests run against the static build in ./out (run `bun run build` first; `bun run test:all` does both).
// Set CHROME_PATH to use an installed Chrome instead of Playwright's own Chromium.
const executablePath = process.env.CHROME_PATH || undefined;
const PORT = Number(process.env.PORT) || 4173; // PORT lets a second test run use its own server

// Mobile and tablet screens checked by a11y-mobile.spec.ts, one project each (Chromium everywhere, so CHROME_PATH works).
const A11Y_DEVICES: [name: string, device: string][] = [
  ["small-phone", "iPhone SE (3rd gen)"], // 375×667
  ["phone-ios", "iPhone 15"], // 393×659
  ["phone-android", "Pixel 7"], // 412×839
  ["large-phone", "iPhone 15 Pro Max"], // 430×739
  ["small-phone-landscape", "iPhone SE (3rd gen) landscape"], // 667×375
  ["tablet", "iPad Mini"], // 768×1024
  ["tablet-landscape", "iPad Mini landscape"], // 1024×768
];

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
    { name: "desktop", testIgnore: /(phone|a11y-mobile)\.spec/, use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "phone", testMatch: /phone\.spec/, use: { ...devices["Pixel 7"], browserName: "chromium" } },
    ...A11Y_DEVICES.map(([name, device]) => ({ name: `a11y-${name}`, testMatch: /a11y-mobile\.spec/, use: { ...devices[device], browserName: "chromium" as const } })),
  ],
});
