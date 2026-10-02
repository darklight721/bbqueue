import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { makeEndedSession, seedStorage } from "./fixtures.ts";

test.describe("Share summary", () => {
  test.beforeEach(async ({ page }) => {
    // Headless browsers may not support file sharing; force the download fallback.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "canShare", { value: undefined, configurable: true });
      Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    });
  });

  test("downloads a 3× phone-width PNG without the action buttons", async ({ page }) => {
    const ended = makeEndedSession({ name: "Friday smash" });
    await seedStorage(page, { endedSessions: [ended] });
    await page.goto(`/sessions/${ended.id}/summary`);
    await expect(page.getByRole("heading", { level: 1, name: "Session summary" })).toBeVisible();

    const capture = page.locator("[data-summary-capture]");
    await expect(capture.getByRole("button", { name: "Share summary" })).toHaveCount(0);
    await expect(capture.getByRole("link", { name: "Home" })).toHaveCount(0);

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Share summary" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^bbqueue-friday-smash-\d{4}-\d{2}-\d{2}\.png$/);

    const path = await file.path();
    const bytes = await readFile(path);
    expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(bytes.readUInt32BE(16)).toBe(1200); // IHDR width: 400 CSS px × 3
    expect(bytes.readUInt32BE(20)).toBeGreaterThan(1200);

    await expect(page.getByRole("status")).toBeEmpty();
    await expect(page.getByRole("button", { name: "Share summary" })).toBeEnabled();
  });
});
