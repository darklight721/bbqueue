import { expect, test, type Page } from "@playwright/test";
import type { Club, EndedSession } from "../src/domain/types.ts";
import {
  makeClub,
  makeClubPlayer,
  makeEndedSession,
  makeEndedSessionFromMatches,
  makeSession,
  readStoredData,
  seedStorage,
} from "./fixtures.ts";

const playerNames = (page: Page) => page.getByRole("textbox", { name: "Player name" });
const card = (page: Page) => page.getByRole("region", { name: "Club", exact: true });
const cardName = (page: Page, name: string) =>
  card(page).getByRole("heading", { level: 2, name, exact: true });
const nameSheet = (page: Page) => page.getByRole("dialog", { name: "Edit club name" });
const nameField = (page: Page) => nameSheet(page).getByRole("textbox", { name: "Club name" });
const players = (page: Page) => page.getByRole("region", { name: /^Players/ });
const rosterRows = (page: Page) => players(page).getByRole("link");
const back = (page: Page) => page.getByRole("button", { name: "Back" });
const editPlayers = (page: Page) => page.getByRole("button", { name: "Edit players" });
const save = (page: Page) => page.getByRole("button", { name: "Save", exact: true });

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

async function openClub(page: Page, club: Club, endedSessions: EndedSession[] = []) {
  await seedStorage(page, { clubs: [club], endedSessions });
  await page.goto(`/clubs/${club.id}`);
  await expect(page.getByRole("heading", { level: 1, name: "Club" })).toBeVisible();
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

async function addPlayer(page: Page, index: number, name: string, skill?: string) {
  await page.getByRole("button", { name: "Add player" }).click();
  const field = playerNames(page).nth(index);
  await expect(field).toBeFocused();
  await field.fill(name);
  if (skill) {
    await page
      .getByRole("combobox", { name: `Skill level for ${name}` })
      .selectOption({ label: skill });
  }
}

test.describe("Club card", () => {
  test("Edit → new name in the sheet → Save shows it on the card, also after a reload", async ({
    page,
  }) => {
    const club = seedClub();
    await openClub(page, club);
    await expect(cardName(page, "Friday Club")).toBeVisible();
    await expect(card(page)).toContainText("This device only");

    await card(page).getByRole("button", { name: "Edit club name" }).click();
    await expect(nameField(page)).toBeFocused();
    await expect(nameField(page)).toHaveValue("Friday Club");
    await nameField(page).fill("Saturday Club");
    await nameSheet(page).getByRole("button", { name: "Save" }).click();

    await expect(nameSheet(page)).toHaveCount(0);
    await expect(cardName(page, "Saturday Club")).toBeVisible();
    await expect(card(page).getByRole("button", { name: "Edit club name" })).toBeFocused();
    // Only the name changed.
    await expectRoster(page, ["alice", "Mike", "Zoe"]);

    await page.reload();
    await expect(cardName(page, "Saturday Club")).toBeVisible();
    await back(page).click();
    await expect(page.getByRole("link", { name: "Saturday Club", exact: true })).toBeVisible();
  });

  test("× and Escape keep the old name", async ({ page }) => {
    await openClub(page, seedClub());

    await card(page).getByRole("button", { name: "Edit club name" }).click();
    await nameField(page).fill("Renamed");
    await nameSheet(page).getByRole("button", { name: "Close" }).click();
    await expect(nameSheet(page)).toHaveCount(0);
    await expect(cardName(page, "Friday Club")).toBeVisible();

    await card(page).getByRole("button", { name: "Edit club name" }).click();
    await nameField(page).fill("Renamed");
    await nameField(page).press("Escape");
    await expect(nameSheet(page)).toHaveCount(0);
    await expect(cardName(page, "Friday Club")).toBeVisible();

    await page.reload();
    await expect(cardName(page, "Friday Club")).toBeVisible();
  });

  test("a duplicate name shows an error in the sheet and isn't saved", async ({ page }) => {
    const club = seedClub();
    await seedStorage(page, { clubs: [club, makeClub({ name: "Tuesday Crew" })] });
    await page.goto(`/clubs/${club.id}`);

    await card(page).getByRole("button", { name: "Edit club name" }).click();
    await nameField(page).fill("  tuesday CREW ");
    await nameSheet(page).getByRole("button", { name: "Save" }).click();

    await expect(nameSheet(page).getByText("Club name already used")).toBeVisible();
    await expect(nameField(page)).toHaveAttribute("aria-invalid", "true");
    await expect(nameField(page)).toBeFocused();
    const stored = await readStoredData<Club[]>(page, "clubs");
    expect(stored?.find((c) => c.id === club.id)?.name).toBe("Friday Club");
  });

  test("can rename the club to a different-cased version of its own name", async ({ page }) => {
    await openClub(page, seedClub());
    await card(page).getByRole("button", { name: "Edit club name" }).click();
    await nameField(page).fill("friday club");
    await nameField(page).press("Enter");
    await expect(nameSheet(page)).toHaveCount(0);
    await expect(cardName(page, "friday club")).toBeVisible();
  });
});

test.describe("Players", () => {
  test("lists Club players sorted by name, without a form; outside Edit mode Back leaves straight away", async ({
    page,
  }) => {
    const club = seedClub();
    await seedStorage(page, { clubs: [club] });
    await page.goto("/clubs");
    await page.getByRole("link", { name: "Friday Club", exact: true }).click();

    await expectRoster(page, ["alice", "Mike", "Zoe"]);
    await expect(rosterRows(page).nth(2)).toHaveAccessibleDescription("Advanced");
    await expect(playerNames(page)).toHaveCount(0);
    await expect(save(page)).toHaveCount(0);

    await back(page).click();
    await expect(page).toHaveURL(/\/clubs$/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("Edit mode: rename, change Skill level, remove one, add one → Save stays on the Club page and the list reflects it after a reload", async ({
    page,
  }) => {
    const club = seedClub();
    await openClub(page, club);
    await editPlayers(page).click();

    await expectRows(page, [
      ["alice", "beginner"],
      ["Mike", "intermediate"],
      ["Zoe", "advanced"],
    ]);
    // While editing, the card can't be renamed and the Danger zone is hidden.
    await expect(page.getByRole("button", { name: "Edit club name" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Delete club" })).toHaveCount(0);

    // Rename alice → Bob, Mike → Advanced, remove Zoe, add Carl.
    await playerNames(page).nth(0).fill("Bob");
    await page
      .getByRole("combobox", { name: "Skill level for Mike" })
      .selectOption({ label: "Advanced" });
    await page.getByRole("button", { name: "Remove Zoe" }).click();
    await expect(playerNames(page)).toHaveCount(2);
    await addPlayer(page, 2, "Carl");
    // Added rows are appended, not re-sorted, until the next open.
    await expect(playerNames(page).nth(2)).toHaveValue("Carl");

    await save(page).click();
    await expect(page).toHaveURL(new RegExp(`/clubs/${club.id}$`));
    await expect(save(page)).toHaveCount(0);
    await expect(editPlayers(page)).toBeVisible();
    await expectRoster(page, ["Bob", "Carl", "Mike"]);

    await page.reload();
    await expectRoster(page, ["Bob", "Carl", "Mike"]);
    await expect(rosterRows(page).nth(2)).toHaveAccessibleDescription("Advanced");
    await back(page).click();
    await expect(
      page.getByRole("link", { name: "Friday Club", exact: true }),
    ).toHaveAccessibleDescription("3 players This device only");
  });

  test("Edit → change something → Cancel: nothing changed, without asking", async ({ page }) => {
    await openClub(page, seedClub());
    await editPlayers(page).click();
    await playerNames(page).nth(0).fill("Changed");
    await page.getByRole("button", { name: "Remove Zoe" }).click();
    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(playerNames(page)).toHaveCount(0);
    await expectRoster(page, ["alice", "Mike", "Zoe"]);
    await page.reload();
    await expectRoster(page, ["alice", "Mike", "Zoe"]);
  });

  test("Enter in a player name moves to the next row, or appends one from the last", async ({
    page,
  }) => {
    await openClub(page, seedClub());
    await editPlayers(page).click();
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
});

test.describe("Back in Edit mode", () => {
  test("with no changes leaves immediately", async ({ page }) => {
    await openClub(page, seedClub());
    await editPlayers(page).click();
    await back(page).click();
    await expect(page).toHaveURL(/\/clubs$/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("with changes asks; Keep editing keeps edits, Discard leaves without saving", async ({
    page,
  }) => {
    const club = seedClub();
    await openClub(page, club);
    await editPlayers(page).click();

    await playerNames(page).nth(0).fill("Renamed");
    await back(page).click();

    const dialog = page.getByRole("dialog", { name: "Discard changes?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Keep editing" }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`/clubs/${club.id}$`));
    await expect(playerNames(page).nth(0)).toHaveValue("Renamed");

    await back(page).click();
    await page
      .getByRole("dialog", { name: "Discard changes?" })
      .getByRole("button", { name: "Discard" })
      .click();
    await expect(page).toHaveURL(/\/clubs$/);
    await page.getByRole("link", { name: "Friday Club", exact: true }).click();
    await expectRoster(page, ["alice", "Mike", "Zoe"]);
  });
});

test.describe("Validation in Edit mode", () => {
  test("an empty player name blocks Save", async ({ page }) => {
    const club = makeClub({ name: "Valid Club" });
    await openClub(page, club);
    await editPlayers(page).click();
    await page.getByRole("button", { name: "Add player" }).click();
    await expect(playerNames(page)).toHaveCount(1);
    await save(page).click();

    await expect(page.getByText("Enter a name")).toBeVisible();
    await expect(page.getByRole("alert")).toHaveText("Fix the highlighted fields to save.");
    await expect(playerNames(page).first()).toHaveAttribute("aria-invalid", "true");
    const stored = await readStoredData<Club[]>(page, "clubs");
    expect(stored?.[0]?.players).toEqual([]);
  });

  test("a duplicate player name (case-insensitive) blocks Save until fixed", async ({ page }) => {
    const club = makeClub({ name: "Valid Club" });
    await openClub(page, club);
    await editPlayers(page).click();
    await addPlayer(page, 0, "Sam");
    await addPlayer(page, 1, "sam");
    await save(page).click();

    // Both clashing rows are flagged.
    await expect(page.getByText("Name already used")).toHaveCount(2);
    const stored = await readStoredData<Club[]>(page, "clubs");
    expect(stored?.[0]?.players).toEqual([]);

    await playerNames(page).nth(1).fill("Sally");
    await save(page).click();
    await expectRoster(page, ["Sally", "Sam"]);
  });
});

test.describe("Stats from the roster", () => {
  /** Ann played two matches (a win and an unscored one); Bob played one, unscored; Cat never played. */
  function playedClub() {
    const club = makeClub({
      name: "Alpha Club",
      players: [
        { id: "cp-ann", name: "Ann", skill: "intermediate" },
        { id: "cp-bob", name: "Bob", skill: "beginner" },
        { id: "cp-cat", name: "Cat", skill: "advanced" },
      ],
    });
    const ended = makeEndedSessionFromMatches(
      [
        { a: ["Ann", "Gus"], b: ["Hal", "Ivy"], score: [21, 12] },
        { a: ["Ann", "Bob"], b: ["Gus", "Hal"], score: null },
      ],
      { name: "Friday smash", clubId: club.id, clubName: club.name },
    );
    const ids: Record<string, string> = { Ann: "cp-ann", Bob: "cp-bob" };
    ended.players = ended.players.map((player) => ({
      ...player,
      clubPlayerId: ids[player.name] ?? null,
    }));
    return { club, ended };
  }

  test("rows of Club players who played show matches and Win rate; one who never played has one line", async ({
    page,
  }) => {
    const { club, ended } = playedClub();
    await openClub(page, club, [ended]);

    await expectRoster(page, ["Ann", "Bob", "Cat"]);
    await expect(rosterRows(page).nth(0)).toHaveAccessibleDescription(
      "2 matches · 100%, Intermediate",
    );
    await expect(rosterRows(page).nth(0)).toContainText("2 matches · 100%");
    // No win or loss yet: no Win rate.
    await expect(rosterRows(page).nth(1)).toContainText("1 match");
    await expect(rosterRows(page).nth(1)).not.toContainText("%");
    await expect(rosterRows(page).nth(2)).toHaveAccessibleDescription("Advanced");
    await expect(rosterRows(page).nth(2)).not.toContainText("match");
  });

  test("a row opens that Club player's Stats; Back returns to the Club page, also after a reload", async ({
    page,
  }) => {
    const { club, ended } = playedClub();
    await openClub(page, club, [ended]);

    await rosterRows(page).nth(0).click();
    await expect(page).toHaveURL(new RegExp(`/clubs/${club.id}/players/cp-ann/stats`));
    await expect(page.getByRole("heading", { level: 1, name: "Stats" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Ann" })).toBeVisible();

    await back(page).click();
    await expect(page).toHaveURL(new RegExp(`/clubs/${club.id}$`));
    await expect(cardName(page, "Alpha Club")).toBeVisible();

    await rosterRows(page).nth(2).click();
    await expect(page.getByRole("heading", { level: 2, name: "Cat" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { level: 2, name: "Cat" })).toBeVisible();
    await back(page).click();
    await expect(page).toHaveURL(new RegExp(`/clubs/${club.id}$`));
  });

  test("Club page → Stats → Ended session → Back → Back ends on the Club page", async ({
    page,
  }) => {
    const { club, ended } = playedClub();
    await openClub(page, club, [ended]);

    await rosterRows(page).nth(0).click();
    await page.getByRole("list", { name: "Sessions" }).getByRole("link").first().click();
    await expect(page).toHaveURL(new RegExp(`/sessions/${ended.id}`));
    await expect(page.getByRole("heading", { level: 1, name: "Friday smash" })).toBeVisible();

    await back(page).click();
    await expect(page.getByRole("heading", { level: 2, name: "Ann" })).toBeVisible();
    await back(page).click();
    await expect(page).toHaveURL(new RegExp(`/clubs/${club.id}$`));
    await expect(cardName(page, "Alpha Club")).toBeVisible();
  });

  test("in Edit mode rows don't open Stats", async ({ page }) => {
    const { club, ended } = playedClub();
    await openClub(page, club, [ended]);
    await editPlayers(page).click();
    await expect(rosterRows(page)).toHaveCount(0);
    await expect(playerNames(page)).toHaveCount(3);
  });
});

test.describe("Delete club", () => {
  test("Cancel keeps the club; confirming removes it", async ({ page }) => {
    const club = seedClub();
    await openClub(page, club);

    await page.getByRole("button", { name: "Delete club" }).click();
    const dialog = page.getByRole("dialog", { name: "Delete Friday Club?" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleDescription("This can't be undone.");

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`/clubs/${club.id}$`));
    expect(await readStoredData<Club[]>(page, "clubs")).toHaveLength(1);

    await page.getByRole("button", { name: "Delete club" }).click();
    await page
      .getByRole("dialog", { name: "Delete Friday Club?" })
      .getByRole("button", { name: "Delete" })
      .click();

    await expect(page).toHaveURL(/\/clubs$/);
    await expect(page.getByRole("heading", { level: 2, name: "No clubs yet" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Friday Club" })).toHaveCount(0);
  });
});

test("unknown club id redirects to /clubs", async ({ page }) => {
  await page.goto("/clubs/does-not-exist");
  await expect(page).toHaveURL(/\/clubs$/);
  await expect(page.getByRole("heading", { level: 1, name: "Clubs" })).toBeVisible();
});

test.describe("Session cards", () => {
  test("Club with the Active session → 'Open active session' → opens that Session", async ({
    page,
  }) => {
    const club = seedClub();
    const session = makeSession({ name: "Friday night", clubId: club.id, clubName: club.name });
    await seedStorage(page, { clubs: [club], session });
    await page.goto(`/clubs/${club.id}`);

    await expect(page.getByRole("link", { name: "New session" })).toHaveCount(0);
    const link = page.getByRole("link", { name: "Open active session" });
    await expect(link).toHaveAccessibleDescription("Friday night");
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/sessions/${session.id}$`));
    await expect(page.getByRole("heading", { level: 1, name: "Friday night" })).toBeVisible();
  });

  test("New session and Sessions sit side by side in one row, and each opens its screen", async ({
    page,
  }) => {
    const club = seedClub();
    const ended = makeEndedSession({ name: "Last week", clubId: club.id, clubName: club.name });
    await openClub(page, club, [ended]);

    const newSession = page.getByRole("link", { name: "New session" });
    const sessions = page.getByRole("link", { name: "Sessions", exact: true });
    await expect(newSession).toHaveAccessibleDescription("Pick players and courts");
    await expect(sessions).toHaveAccessibleDescription("1 past session");
    // One row of two equal columns.
    const [left, right] = [(await newSession.boundingBox())!, (await sessions.boundingBox())!];
    expect(Math.abs(left.y - right.y)).toBeLessThan(1);
    expect(Math.abs(left.width - right.width)).toBeLessThan(1);
    expect(right.x).toBeGreaterThan(left.x + left.width);

    await newSession.click();
    await expect(page).toHaveURL(new RegExp(`/sessions/new\\?club=${club.id}$`));
    await expect(page.getByRole("heading", { level: 1, name: "New session" })).toBeVisible();
    await page.goBack();

    await sessions.click();
    await expect(page).toHaveURL(new RegExp(`/clubs/${club.id}/sessions$`));
    await expect(page.getByRole("heading", { level: 1, name: club.name })).toBeVisible();
  });

  test("a card on its own takes the whole row", async ({ page }) => {
    await openClub(page, seedClub());
    const cardLink = (await page.getByRole("link", { name: "New session" }).boundingBox())!;
    const clubCard = (await card(page).boundingBox())!;
    expect(Math.abs(cardLink.width - clubCard.width)).toBeLessThan(1);
  });

  test("in Edit mode with unsaved changes, a session card asks first", async ({ page }) => {
    const club = seedClub();
    await openClub(page, club);
    await editPlayers(page).click();
    await playerNames(page).nth(0).fill("Changed");

    await page.getByRole("link", { name: "New session" }).click();
    const dialog = page.getByRole("dialog", { name: "Discard changes?" });
    await dialog.getByRole("button", { name: "Keep editing" }).click();
    await expect(page).toHaveURL(new RegExp(`/clubs/${club.id}$`));

    await page.getByRole("link", { name: "New session" }).click();
    await page
      .getByRole("dialog", { name: "Discard changes?" })
      .getByRole("button", { name: "Discard" })
      .click();
    await expect(page).toHaveURL(new RegExp(`/sessions/new\\?club=${club.id}$`));
  });
});
