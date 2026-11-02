import { expect, test, type Page } from "@playwright/test";
import type { Club } from "../src/domain/types.ts";
import { makeClub, makeClubPlayer, readStoredData, seedStorage } from "./fixtures.ts";

const playerNames = (page: Page) => page.getByRole("textbox", { name: "Player name" });
const rosterRows = (page: Page) =>
  page
    .getByRole("region", { name: /^Players/ })
    .getByRole("listitem")
    .getByRole("link");
const back = (page: Page) => page.getByRole("button", { name: "Back" });
const editPlayers = (page: Page) => page.getByRole("link", { name: "Edit players" });
const save = (page: Page) => page.getByRole("button", { name: "Save", exact: true });
const clubPageHeading = (page: Page) => page.getByRole("heading", { level: 1, name: "Club" });

/** Seeded club whose players are deliberately not in alphabetical order. */
function seedClub() {
  return makeClub({
    name: "Friday Club",
    players: [
      makeClubPlayer({ name: "Zoe", skill: "advanced" }),
      makeClubPlayer({ name: "alice", skill: "beginner" }),
      makeClubPlayer({ name: "Mike", skill: "intermediate" }),
    ],
  });
}

/** Clubs → the Club page → Edit players, so both are in history as they are in use. */
async function openEditPlayers(page: Page, club: Club) {
  await seedStorage(page, { clubs: [club] });
  await page.goto("/clubs");
  await page.getByRole("link", { name: club.name, exact: true }).click();
  await expect(clubPageHeading(page)).toBeVisible();
  await editPlayers(page).click();
  await expect(page).toHaveURL(new RegExp(`/clubs/${club.id}/players$`));
  await expect(page.getByRole("heading", { level: 1, name: "Edit players" })).toBeVisible();
}

async function expectRoster(page: Page, names: string[]) {
  await expect(rosterRows(page)).toHaveCount(names.length);
  for (const [index, name] of names.entries()) {
    await expect(rosterRows(page).nth(index)).toHaveAccessibleName(name);
  }
}

async function expectRows(page: Page, rows: [name: string, skill: string][]) {
  await expect(playerNames(page)).toHaveCount(rows.length);
  for (const [index, [name, skill]] of rows.entries()) {
    await expect(playerNames(page).nth(index)).toHaveValue(name);
    await expect(page.getByRole("combobox", { name: `Skill level for ${name}` })).toHaveValue(
      skill,
    );
  }
}

async function addPlayer(page: Page, index: number, name: string) {
  await page.getByRole("button", { name: "Add player" }).click();
  const field = playerNames(page).nth(index);
  await expect(field).toBeFocused();
  await field.fill(name);
}

test.describe("Edit players", () => {
  test("rename, change Skill level, remove one, add one → Save → back on the Club page, also after a reload; browser Back then goes to Clubs", async ({
    page,
  }) => {
    const club = seedClub();
    await openEditPlayers(page, club);
    await expect(page.getByText("Friday Club · 3 players")).toBeVisible();
    await expectRows(page, [
      ["alice", "beginner"],
      ["Mike", "intermediate"],
      ["Zoe", "advanced"],
    ]);
    // Only the form: no Club card, session cards or Danger zone.
    await expect(page.getByRole("region", { name: "Club", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "New session" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Delete club" })).toHaveCount(0);

    // Rename alice → Bob, Mike → Advanced, remove Zoe, add Carl.
    await playerNames(page).nth(0).fill("Bob");
    await page
      .getByRole("combobox", { name: "Skill level for Mike" })
      .selectOption({ label: "Advanced" });
    await page.getByRole("button", { name: "Remove Zoe" }).click();
    await expect(playerNames(page)).toHaveCount(2);
    await addPlayer(page, 2, "Carl");
    await expect(page.getByText("Friday Club · 3 players")).toBeVisible();

    await save(page).click();
    await expect(page).toHaveURL(new RegExp(`/clubs/${club.id}$`));
    await expect(clubPageHeading(page)).toBeVisible();
    await expect(editPlayers(page)).toBeFocused();
    await expectRoster(page, ["Bob", "Carl", "Mike"]);

    await page.reload();
    await expectRoster(page, ["Bob", "Carl", "Mike"]);
    await expect(rosterRows(page).nth(2)).toHaveAccessibleDescription("Advanced");

    // Edit players isn't in history any more: the browser's Back goes to Clubs.
    await page.goBack();
    await expect(page).toHaveURL(/\/clubs$/);
    await expect(
      page.getByRole("link", { name: "Friday Club", exact: true }),
    ).toHaveAccessibleDescription("3 players This device only");
  });

  test("Back with no changes leaves straight away, to the Club page", async ({ page }) => {
    const club = seedClub();
    await openEditPlayers(page, club);
    await back(page).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/clubs/${club.id}$`));
    await expect(editPlayers(page)).toBeFocused();
    await back(page).click();
    await expect(page).toHaveURL(/\/clubs$/);
  });

  test("Back with changes asks; Keep editing keeps edits, Discard returns to the Club page without saving", async ({
    page,
  }) => {
    const club = seedClub();
    await openEditPlayers(page, club);
    await playerNames(page).nth(0).fill("Renamed");
    await page.getByRole("button", { name: "Remove Zoe" }).click();
    await back(page).click();

    const dialog = page.getByRole("dialog", { name: "Discard changes?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Keep editing" }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`/clubs/${club.id}/players$`));
    await expect(playerNames(page).nth(0)).toHaveValue("Renamed");

    await back(page).click();
    await dialog.getByRole("button", { name: "Discard" }).click();
    await expect(page).toHaveURL(new RegExp(`/clubs/${club.id}$`));
    await expectRoster(page, ["alice", "Mike", "Zoe"]);
    await page.reload();
    await expectRoster(page, ["alice", "Mike", "Zoe"]);
  });

  test("Save with no changes returns to the Club page", async ({ page }) => {
    const club = seedClub();
    await openEditPlayers(page, club);
    await save(page).click();
    await expect(page).toHaveURL(new RegExp(`/clubs/${club.id}$`));
    await expectRoster(page, ["alice", "Mike", "Zoe"]);
  });

  test("Enter in a player name moves to the next row, or appends one from the last", async ({
    page,
  }) => {
    await openEditPlayers(page, seedClub());
    await expect(playerNames(page)).toHaveCount(3);

    await playerNames(page).nth(0).press("Enter");
    await expect(playerNames(page).nth(1)).toBeFocused();
    await playerNames(page).nth(2).press("Enter");
    await expect(playerNames(page)).toHaveCount(4);
    await expect(playerNames(page).nth(3)).toBeFocused();
    await expect(playerNames(page).nth(3)).toHaveValue("");
    // An empty name doesn't add another row, and Enter never saves.
    await playerNames(page).nth(3).press("Enter");
    await expect(playerNames(page)).toHaveCount(4);
    await expect(save(page)).toBeVisible();
  });

  test("a reload keeps you on Edit players, with the saved roster", async ({ page }) => {
    const club = seedClub();
    await openEditPlayers(page, club);
    await playerNames(page).nth(0).fill("Unsaved");
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`/clubs/${club.id}/players$`));
    await expectRows(page, [
      ["alice", "beginner"],
      ["Mike", "intermediate"],
      ["Zoe", "advanced"],
    ]);
    // Leaving still lands on the Club page underneath.
    await back(page).click();
    await expect(page).toHaveURL(new RegExp(`/clubs/${club.id}$`));
    await back(page).click();
    await expect(page).toHaveURL(/\/clubs$/);
  });

  test("an unknown Club id lands on the Clubs list", async ({ page }) => {
    await seedStorage(page, { clubs: [seedClub()] });
    await page.goto("/clubs/nope/players");
    await expect(page).toHaveURL(/\/clubs$/);
  });
});

test.describe("Validation on Edit players", () => {
  test("an empty player name blocks Save", async ({ page }) => {
    const club = makeClub({ name: "Valid Club" });
    await openEditPlayers(page, club);
    await page.getByRole("button", { name: "Add player" }).click();
    await expect(playerNames(page)).toHaveCount(1);
    await save(page).click();

    await expect(page.getByText("Enter a name")).toBeVisible();
    await expect(page.getByRole("alert")).toHaveText("Fix the highlighted fields to save.");
    await expect(playerNames(page).first()).toHaveAttribute("aria-invalid", "true");
    await expect(page).toHaveURL(new RegExp(`/clubs/${club.id}/players$`));
    const stored = await readStoredData<Club[]>(page, "clubs");
    expect(stored?.[0]?.players).toEqual([]);
  });

  test("a duplicate player name (case-insensitive) blocks Save until fixed", async ({ page }) => {
    const club = makeClub({ name: "Valid Club" });
    await openEditPlayers(page, club);
    await addPlayer(page, 0, "Sam");
    await addPlayer(page, 1, "sam");
    await save(page).click();

    // Both clashing rows are flagged.
    await expect(page.getByText("Name already used")).toHaveCount(2);
    const stored = await readStoredData<Club[]>(page, "clubs");
    expect(stored?.[0]?.players).toEqual([]);

    await playerNames(page).nth(1).fill("Sally");
    await save(page).click();
    await expect(page).toHaveURL(new RegExp(`/clubs/${club.id}$`));
    await expectRoster(page, ["Sally", "Sam"]);
  });
});
