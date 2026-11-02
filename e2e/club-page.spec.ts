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
const rosterRows = (page: Page) => players(page).getByRole("listitem").getByRole("link");
const back = (page: Page) => page.getByRole("button", { name: "Back" });
const editPlayers = (page: Page) => page.getByRole("link", { name: "Edit players" });
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

test.describe("Club card", () => {
  test("Edit → new name in the sheet → Save shows it on the card, also after a reload", async ({
    page,
  }) => {
    const club = seedClub();
    await openClub(page, club);
    await expect(cardName(page, "Friday Club")).toBeVisible();
    await expect(card(page)).toContainText("This device only");

    await card(page).getByRole("button", { name: "Edit club name" }).click();
    // The title takes focus, so the iOS keyboard waits for a tap on the field.
    await expect(nameSheet(page).getByRole("heading", { name: "Edit club name" })).toBeFocused();
    await expect(nameField(page)).not.toBeFocused();
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
  test("lists Club players sorted by name, without a form; Back leaves straight away", async ({
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

  test("Edit on Players opens Edit players", async ({ page }) => {
    const club = seedClub();
    await openClub(page, club);
    await editPlayers(page).click();
    await expect(page).toHaveURL(new RegExp(`/clubs/${club.id}/players$`));
    await expect(page.getByRole("heading", { level: 1, name: "Edit players" })).toBeVisible();
    await expect(playerNames(page)).toHaveCount(3);
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
});
