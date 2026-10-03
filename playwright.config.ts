import { defineConfig, devices } from "@playwright/test";
import { welcomeDoneStorageState } from "./e2e/fixtures.ts";

/** Override with E2E_PORT to run several checkouts (git worktrees) side by side. */
const port = Number(process.env.E2E_PORT ?? 4173);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    // Most specs are about Home onwards: start as a device that is past the Welcome screen.
    storageState: welcomeDoneStorageState(baseURL),
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium-mobile", use: { ...devices["Pixel 7"] } },
    { name: "webkit-mobile", use: { ...devices["iPhone 14"] } },
  ],
  webServer: {
    command: `pnpm exec vp build && pnpm exec vp preview --port ${port} --strictPort`,
    url: baseURL,
    // The local fake Backend (Accounts without a Firebase project), baked into the build.
    env: { VITE_BACKEND: "fake" },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
