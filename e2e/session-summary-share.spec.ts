import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { makeEndedSession, makeEndedSessionFromMatches, seedStorage } from "./fixtures.ts";

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

  // WebKit clips box-shadows (the 1st-place `ring` border) in a foreignObject SVG drawn scaled.
  test("keeps the 1st-place winner's gold ring border intact", async ({ page }) => {
    const ended = makeEndedSessionFromMatches([
      { a: ["Ann", "Bo"], b: ["Cy", "Di"], score: [21, 10] },
      { a: ["Ann", "Cy"], b: ["Bo", "Di"], score: [21, 15] },
    ]);
    await seedStorage(page, { endedSessions: [ended] });
    await page.goto(`/sessions/${ended.id}/summary`);
    await expect(page.getByRole("heading", { level: 1, name: "Session summary" })).toBeVisible();

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Share summary" }).click();
    const bytes = await readFile(await (await download).path());

    // Longest horizontal run of ring-gold (#e9b949) pixels. The intact ring's top edge spans most
    // of the 1200px-wide image; the medal disc alone is only ~170px wide.
    const longestGoldRun = await page.evaluate(async (base64) => {
      const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
      const bitmap = await createImageBitmap(blob);
      const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext("2d")!;
      ctx.drawImage(bitmap, 0, 0);
      const { data, width, height } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      const near = (i: number) =>
        Math.abs(data[i]! - 0xe9) < 24 &&
        Math.abs(data[i + 1]! - 0xb9) < 24 &&
        Math.abs(data[i + 2]! - 0x49) < 24;
      let longest = 0;
      for (let y = 0; y < height; y++) {
        let run = 0;
        for (let x = 0; x < width; x++) {
          run = near((y * width + x) * 4) ? run + 1 : 0;
          if (run > longest) longest = run;
        }
      }
      return longest;
    }, bytes.toString("base64"));
    expect(longestGoldRun).toBeGreaterThan(900);
  });
});
