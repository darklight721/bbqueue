import { expect, test } from "@playwright/test";

test("home heading is visible", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Badminton Queue" })).toBeVisible();
});
