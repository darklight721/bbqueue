import { expect, test, type Page } from "@playwright/test";
import { makeClubWithPlayers, readStored, readStoredData, seedStorage } from "./fixtures.ts";

const sheet = (page: Page) => page.getByRole("dialog", { name: "New club" });
const sheetName = (page: Page) => sheet(page).getByRole("textbox", { name: "Club name" });
const createClub = (page: Page) => sheet(page).getByRole("button", { name: "Create club" });
const playerNames = (page: Page) => page.getByRole("textbox", { name: "Player name" });

test.describe("Clubs", () => {
  test("empty state is shown when there are no clubs", async ({ page }) => {
    await page.goto("/clubs");
    await expect(page.getByRole("heading", { level: 1, name: "Clubs" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "No clubs yet" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add club" })).toBeVisible();
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
      // Seeded Clubs are Local, so with a Backend each row is also badged "This device only".
      await expect(row).toHaveAccessibleDescription(`${count} This device only`);
    }
  });

  test("tapping a club row opens its Club page", async ({ page }) => {
    const club = makeClubWithPlayers(3, { name: "Friday Club" });
    await seedStorage(page, { clubs: [club] });
    await page.goto("/clubs");

    const row = page.getByRole("link", { name: "Friday Club", exact: true });
    await expect(row).toHaveAttribute("href", `/clubs/${club.id}`);
    await row.click();

    await expect(page).toHaveURL(new RegExp(`/clubs/${club.id}$`));
    await expect(page.getByRole("heading", { level: 1, name: "Club" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Friday Club" })).toBeVisible();
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

test.describe("New club sheet", () => {
  test("Add club → name → Create club → the Club page in Players Edit mode → add 3 players → Save → the Clubs list shows 3 players", async ({
    page,
  }) => {
    await seedStorage(page, { clubs: [makeClubWithPlayers(1, { name: "Friday Club" })] });
    await page.goto("/clubs");
    await page.getByRole("button", { name: "Add club" }).click();
    await expect(sheet(page)).toBeVisible();
    await expect(sheetName(page)).toBeFocused();
    await sheetName(page).fill("Tuesday Crew");
    await createClub(page).click();

    // The new Club's page, in Players Edit mode, with an empty row to type in.
    await expect(page).toHaveURL(/\/clubs\/[^/?]+$/);
    await expect(page.getByRole("heading", { level: 2, name: "Tuesday Crew" })).toBeVisible();
    await expect(playerNames(page)).toHaveCount(1);
    await expect(playerNames(page).first()).toBeFocused();

    await playerNames(page).first().fill("Zed");
    await page.getByRole("combobox", { name: "Skill level for Zed" }).selectOption("Advanced");
    await playerNames(page).first().press("Enter");
    await playerNames(page).nth(1).fill("Amy");
    await page.getByRole("combobox", { name: "Skill level for Amy" }).selectOption("Beginner");
    await page.getByRole("button", { name: "Add player" }).click();
    await playerNames(page).nth(2).fill("Mo");
    await page.getByRole("button", { name: "Save", exact: true }).click();

    // Still on the Club page, out of Edit mode, rows sorted.
    await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
    const rows = page.getByRole("region", { name: /^Players/ }).getByRole("link");
    await expect(rows).toHaveCount(3);
    for (const [index, [name, skill]] of [
      ["Amy", "Beginner"],
      ["Mo", "Intermediate"],
      ["Zed", "Advanced"],
    ].entries()) {
      await expect(rows.nth(index)).toHaveAccessibleName(name!);
      await expect(rows.nth(index)).toHaveAccessibleDescription(skill!);
    }

    await page.getByRole("button", { name: "Back" }).click();
    await expect(page).toHaveURL(/\/clubs$/);
    await expect(
      page.getByRole("link", { name: "Tuesday Crew", exact: true }),
    ).toHaveAccessibleDescription("3 players This device only");
  });

  test("the empty state's Add club opens the same sheet", async ({ page }) => {
    await page.goto("/clubs");
    await page.getByRole("button", { name: "Add club" }).click();
    await sheetName(page).fill("Solo");
    await sheetName(page).press("Enter");
    await expect(page.getByRole("heading", { level: 2, name: "Solo" })).toBeVisible();
    // A new Club with nobody on it can be saved as it is: Back leaves without asking.
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByRole("link", { name: "Solo", exact: true })).toHaveAccessibleDescription(
      "No players This device only",
    );
  });

  test("an empty, too long or duplicate name blocks Create with a message", async ({ page }) => {
    await seedStorage(page, { clubs: [makeClubWithPlayers(1, { name: "Friday Club" })] });
    await page.goto("/clubs");
    await page.getByRole("button", { name: "Add club" }).click();

    await createClub(page).click();
    await expect(sheet(page).getByText("Enter a name")).toBeVisible();
    await expect(sheetName(page)).toHaveAttribute("aria-invalid", "true");

    await sheetName(page).fill("x".repeat(41));
    await createClub(page).click();
    await expect(sheet(page).getByText("Name is too long (at most 40 characters)")).toBeVisible();

    await sheetName(page).fill("  friday CLUB ");
    await createClub(page).click();
    await expect(sheet(page).getByText("Club name already used")).toBeVisible();

    await expect(page).toHaveURL(/\/clubs$/);
    expect(await readStoredData<unknown[]>(page, "clubs")).toHaveLength(1);
  });

  test("✕ closes the sheet and nothing is created", async ({ page }) => {
    await page.goto("/clubs");
    await page.getByRole("button", { name: "Add club" }).click();
    await sheetName(page).fill("Draft");
    await sheet(page).getByRole("button", { name: "Close" }).click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 2, name: "No clubs yet" })).toBeVisible();
    expect(await readStored(page, "clubs")).toBeNull();
  });

  test("/clubs/new redirects to /clubs", async ({ page }) => {
    await page.goto("/clubs/new");
    await expect(page).toHaveURL(/\/clubs$/);
    await expect(page.getByRole("heading", { level: 1, name: "Clubs" })).toBeVisible();
    await expect(sheet(page)).toHaveCount(0);
  });
});
