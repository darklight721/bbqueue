import { defineConfig, devices } from "@playwright/test";

/** Override with E2E_PORT to run several checkouts (git worktrees) side by side. */
const port = Number(process.env.E2E_PORT ?? 4173);

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium-mobile", use: { ...devices["Pixel 7"] } },
    { name: "webkit-mobile", use: { ...devices["iPhone 14"] } },
  ],
  webServer: {
    command: `pnpm exec vp build && pnpm exec vp preview --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
