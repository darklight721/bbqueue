import { expect, test } from "@playwright/test";
import { makeEndedSessionFromMatches, makeSession, readStored, seedStorage } from "./fixtures.ts";

test.describe("Home", () => {
  test("fresh storage shows New session and Clubs, no Resume", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Badminton Queue" })).toBeVisible();
    await expect(page.getByRole("link", { name: "New session" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Clubs" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Resume session" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Past sessions" })).toHaveCount(0);
  });

  test("Past sessions shows once a session has ended and opens the list", async ({ page }) => {
    const ended = makeEndedSessionFromMatches(
      [{ a: ["Ana", "Ben"], b: ["Cat", "Dan"], score: [21, 12] }],
      { name: "Friday smash" },
    );
    await seedStorage(page, { endedSessions: [ended] });
    await page.goto("/");

    const past = page.getByRole("link", { name: "Past sessions" });
    await expect(past).toHaveAccessibleDescription("1 session");
    await past.click();
    await expect(page).toHaveURL(/\/sessions$/);
    const row = page.getByRole("link", { name: "Friday smash" });
    await expect(row).toContainText("1 match · 4 players");

    await page.getByRole("button", { name: "Back" }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("/sessions with nothing ended shows the empty state", async ({ page }) => {
    await page.goto("/sessions");
    await expect(page.getByRole("heading", { level: 1, name: "Past sessions" })).toBeVisible();
    await expect(page.getByText("No past sessions yet")).toBeVisible();
  });

  test("saved session shows Resume with its name and opens /sessions/<id>", async ({ page }) => {
    const session = makeSession({ name: "Friday smash" });
    await seedStorage(page, { session });
    await page.goto("/");

    const resume = page.getByRole("link", { name: "Resume session" });
    await expect(resume).toBeVisible();
    await expect(resume).toContainText("Friday smash");
    await expect(resume).toHaveAccessibleDescription("Friday smash");

    await expect(resume).toHaveAttribute("href", `/sessions/${session.id}`);
    await resume.click();
    await expect(page).toHaveURL(new RegExp(`/sessions/${session.id}$`));
    await expect(page.getByRole("heading", { level: 1, name: "Friday smash" })).toBeVisible();
  });

  test("New session link navigates and Back returns Home", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "New session" }).click();
    await expect(page).toHaveURL(/\/sessions\/new$/);
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
    await expect(page).toHaveURL(/\/sessions\/new$/);
    await expect(page.getByRole("heading", { level: 1, name: "New session" })).toBeVisible();
  });

  test("removes a leftover summary from the old version on load", async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem("bq:v1:summary", JSON.stringify({ version: 1, data: {} })),
    );
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Badminton Queue" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("bq:v1:summary"))).toBeNull();
    expect(await readStored(page, "endedSessions")).toBeNull();
  });
});
