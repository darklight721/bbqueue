import { expect, test } from "@playwright/test";
import { makeSession, makeSummary, readStored, seedStorage } from "./fixtures.ts";

test.describe("Home", () => {
  test("fresh storage shows New session and Clubs, no Resume", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Badminton Queue" })).toBeVisible();
    await expect(page.getByRole("link", { name: "New session" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Clubs" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Resume session" })).toHaveCount(0);
  });

  test("saved session shows Resume with its name and opens /session", async ({ page }) => {
    await seedStorage(page, { session: makeSession({ name: "Friday smash" }) });
    await page.goto("/");

    const resume = page.getByRole("link", { name: "Resume session" });
    await expect(resume).toBeVisible();
    await expect(resume).toContainText("Friday smash");
    await expect(resume).toHaveAccessibleDescription("Friday smash");

    await resume.click();
    await expect(page).toHaveURL(/\/session$/);
    await expect(page.getByRole("heading", { level: 1, name: "Friday smash" })).toBeVisible();
  });

  test("New session link navigates and Back returns Home", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "New session" }).click();
    await expect(page).toHaveURL(/\/session\/new$/);
    await expect(page.getByRole("heading", { level: 1, name: "New session" })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: "Badminton Queue" })).toBeVisible();
  });

  test("Clubs link navigates and Back returns Home", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Clubs" }).click();
    await expect(page).toHaveURL(/\/clubs$/);
    await expect(page.getByRole("heading", { level: 1, name: "Clubs" })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: "Badminton Queue" })).toBeVisible();
  });

  test("New session link still works when a session is saved", async ({ page }) => {
    await seedStorage(page, { session: makeSession() });
    await page.goto("/");
    await page.getByRole("link", { name: "New session" }).click();
    await expect(page).toHaveURL(/\/session\/new$/);
    await expect(page.getByRole("heading", { level: 1, name: "New session" })).toBeVisible();
  });

  test("visiting Home clears a saved summary", async ({ page }) => {
    await seedStorage(page, { summary: makeSummary() });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Badminton Queue" })).toBeVisible();
    await expect.poll(() => readStored(page, "summary")).toBeNull();
  });
});
