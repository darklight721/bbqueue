import { expect, test } from "@playwright/test";
import { makeClubWithPlayers, seedStorage } from "./fixtures.ts";

test.describe("Clubs", () => {
  test("empty state is shown when there are no clubs", async ({ page }) => {
    await page.goto("/clubs");
    await expect(page.getByRole("heading", { level: 1, name: "Clubs" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "No clubs yet" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Add club" })).toBeVisible();
  });

  test("clubs are sorted alphabetically (case-insensitive) with pluralised counts", async ({
    page,
  }) => {
    await seedStorage(page, {
      clubs: [
        makeClubWithPlayers(12, { name: "zebra smashers" }),
        makeClubWithPlayers(1, { name: "Beta Birdies" }),
        makeClubWithPlayers(0, { name: "alpha club" }),
        makeClubWithPlayers(2, { name: "Delta Doubles" }),
      ],
    });
    await page.goto("/clubs");

    await expect(page.getByRole("heading", { level: 2, name: "No clubs yet" })).toHaveCount(0);

    const expected = [
      ["alpha club", "No players"],
      ["Beta Birdies", "1 player"],
      ["Delta Doubles", "2 players"],
      ["zebra smashers", "12 players"],
    ] as const;

    const rows = page.getByRole("list").getByRole("link");
    await expect(rows).toHaveCount(expected.length);
    for (const [index, [name, count]] of expected.entries()) {
      const row = rows.nth(index);
      await expect(row).toHaveAccessibleName(name);
      await expect(row).toHaveAccessibleDescription(count);
    }
  });

  test("tapping a club row opens its edit screen", async ({ page }) => {
    const club = makeClubWithPlayers(3, { name: "Friday Club" });
    await seedStorage(page, { clubs: [club] });
    await page.goto("/clubs");

    const row = page.getByRole("link", { name: "Friday Club", exact: true });
    await expect(row).toHaveAttribute("href", `/clubs/${club.id}`);
    await row.click();

    await expect(page).toHaveURL(new RegExp(`/clubs/${club.id}$`));
    await expect(page.getByRole("heading", { level: 1, name: "Edit club" })).toBeVisible();
  });

  test("Add club opens /clubs/new", async ({ page }) => {
    await seedStorage(page, { clubs: [makeClubWithPlayers(1, { name: "Friday Club" })] });
    await page.goto("/clubs");
    await page.getByRole("link", { name: "Add club" }).click();
    await expect(page).toHaveURL(/\/clubs\/new$/);
    await expect(page.getByRole("heading", { level: 1, name: "New club" })).toBeVisible();
  });

  test("Add club from the empty state opens /clubs/new", async ({ page }) => {
    await page.goto("/clubs");
    await page.getByRole("link", { name: "Add club" }).click();
    await expect(page).toHaveURL(/\/clubs\/new$/);
    await expect(page.getByRole("heading", { level: 1, name: "New club" })).toBeVisible();
  });

  test("Back goes Home", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Clubs" }).click();
    await expect(page).toHaveURL(/\/clubs$/);
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: "BBQueue" })).toBeVisible();
  });
});
