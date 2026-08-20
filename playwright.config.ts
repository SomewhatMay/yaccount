import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  /**
   * Four, not the default six.
   *
   * Each worker is a browser, and the Next dev server needs a core of its own.
   * At six on a 12-thread box the server gets starved and the timing-sensitive
   * cases — the FAB hold, touch scrolling, ⌘K navigation — miss their windows.
   * Measured over eight full runs at four and four at six: four never failed,
   * six failed half the time. It costs nothing, because the machine was already
   * saturated: ~55s at four against ~53s at six.
   */
  workers: process.env.CI ? 1 : 4,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
