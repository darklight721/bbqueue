import { defineConfig, devices } from "@playwright/test";
import { FIRST_LAUNCH_STORAGE_STATE, welcomeDoneStorageState } from "./e2e/fixtures.ts";

/** Override with E2E_PORT to run several checkouts (git worktrees) side by side. */
const port = Number(process.env.E2E_PORT ?? 4173);
const baseURL = `http://localhost:${port}`;
/** The same app built for the Firebase emulators (specs in e2e/emulator that need two people). */
const emulatorPort = Number(process.env.E2E_EMULATOR_PORT ?? port + 1);
const emulatorBaseURL = `http://localhost:${emulatorPort}`;
const AUTH_EMULATOR_URL = "http://127.0.0.1:9099";
/** How long an assertion waits in the emulator specs (two people, a real server). */
const EMULATOR_EXPECT_TIMEOUT_MS = 15_000;

export default defineConfig({
  testDir: "e2e",
  // Starts from a clean emulator; the specs then keep to their own data, since they share it.
  globalSetup: "./e2e/global-setup.ts",
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
    // One device, on the local fake Backend.
    { name: "chromium-mobile", testIgnore: /emulator\//, use: { ...devices["Pixel 7"] } },
    { name: "webkit-mobile", testIgnore: /emulator\//, use: { ...devices["iPhone 14"] } },
    // Specs that need a real server shared by two people, on the Firebase emulators.
    {
      name: "chromium-mobile-emulator",
      testMatch: /emulator\/.*\.spec\.ts/,
      // A second person's change, Firestore and a busy machine: give assertions longer than the 5 s default.
      expect: { timeout: EMULATOR_EXPECT_TIMEOUT_MS },
      use: {
        ...devices["Pixel 7"],
        baseURL: emulatorBaseURL,
        storageState: FIRST_LAUNCH_STORAGE_STATE,
      },
    },
    {
      name: "webkit-mobile-emulator",
      testMatch: /emulator\/.*\.spec\.ts/,
      expect: { timeout: EMULATOR_EXPECT_TIMEOUT_MS },
      use: {
        ...devices["iPhone 14"],
        baseURL: emulatorBaseURL,
        storageState: FIRST_LAUNCH_STORAGE_STATE,
      },
    },
  ],
  webServer: [
    {
      command: `pnpm exec vp build && pnpm exec vp preview --port ${port} --strictPort`,
      url: baseURL,
      // The local fake Backend (Accounts without a Firebase project), baked into the build.
      env: { VITE_BACKEND: "fake" },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `pnpm exec vp build --outDir dist-emulator && pnpm exec vp preview --outDir dist-emulator --port ${emulatorPort} --strictPort`,
      url: emulatorBaseURL,
      // The Firebase Backend pointed at the emulators, baked into the build.
      env: { VITE_FIREBASE_EMULATOR: "1" },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // Needs Java on PATH (see the README).
      command: "node scripts/emulators.mjs",
      // Auth is the slower of the two to come up; global-setup.ts waits for Firestore as well.
      url: AUTH_EMULATOR_URL,
      // Let the wrapper stop the Java emulator; a plain kill would leave it running.
      gracefulShutdown: { signal: "SIGTERM", timeout: 15_000 },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
