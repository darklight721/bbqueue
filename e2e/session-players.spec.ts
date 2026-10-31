import { expect, test, type Locator, type Page } from "@playwright/test";
import type { Session } from "../src/domain/types.ts";
import {
  makeClub,
  makeClubPlayer,
  makeMidMatchSession,
  readStoredData,
  seedStorage,
} from "./fixtures.ts";
import {
  court,
  lineupOf,
  openScoreDialog,
  playersOf,
  startSession,
  storedSession,
} from "./session-helpers.ts";

/**
 * Seeded layout (10 players), deliberately not alphabetical:
 *   Court 1 Busy:        Zoe + Ben  vs  ana + Dan
 *   Court 2 Lineup:      Eve + Fay  vs  Gus + Hal
 *   Free: Ivy; Sitting out: Jon (set by `seed`)
 */
const NAMES = ["Zoe", "Ben", "ana", "Dan", "Eve", "Fay", "Gus", "Hal", "Ivy", "Jon"];
const SORTED = ["ana", "Ben", "Dan", "Eve", "Fay", "Gus", "Hal", "Ivy", "Jon", "Zoe"];

function buildSession(overrides: Partial<Session> = {}, sitOutJon = false): Session {
  const session = makeMidMatchSession({
    startedAt: Date.now() - 60_000,
    names: NAMES,
    overrides,
  });
  if (sitOutJon) session.players.find((player) => player.name === "Jon")!.sittingOut = true;
  return session;
}

async function openSeeded(page: Page, session: Session = buildSession()) {
  await seedStorage(page, { session });
  await page.goto(`/sessions/${session.id}`);
  await expect(page.getByRole("region", { name: "Players" })).toBeVisible();
  return session;
}

const playersRegion = (page: Page) => page.getByRole("region", { name: "Players" });

/** The list row for a player, found through its Sit out / Back in button. */
const row = (page: Page, name: string): Locator =>
  playersRegion(page)
    .getByRole("listitem")
    .filter({
      has: page.getByRole("button", { name: new RegExp(`^(Sit out|Back in) ${name}$`) }),
    });

const rowNames = (page: Page) =>
  playersRegion(page)
    .getByRole("button", { name: /^(Sit out|Back in) / })
    .evaluateAll((buttons) =>
      buttons.map((button) =>
        button.getAttribute("aria-label")!.replace(/^(Sit out|Back in) /, ""),
      ),
    );

const notice = (page: Page, text: string | RegExp) =>
  page.getByRole("status").filter({ hasText: text });

async function openMenu(page: Page, name: string) {
  await playersRegion(page)
    .getByRole("button", { name: `More for ${name}`, exact: true })
    .click();
  const menu = page.getByRole("dialog", { name, exact: true });
  await expect(menu).toBeVisible();
  return menu;
}

async function removePlayer(page: Page, name: string) {
  const menu = await openMenu(page, name);
  await menu.getByRole("button", { name: "Remove", exact: true }).click();
  await page
    .getByRole("dialog", { name: `Remove ${name} from this session?` })
    .getByRole("button", { name: "Remove", exact: true })
    .click();
}

async function openAddPlayers(page: Page) {
  await playersRegion(page).getByRole("button", { name: "Add players" }).click();
  const sheet = page.getByRole("dialog", { name: "Add players" });
  await expect(sheet).toBeVisible();
  return sheet;
}

/** Line up a Guest in the open Add players sheet. */
async function lineUpGuest(sheet: Locator, name: string, options: { saveToClub?: boolean } = {}) {
  await sheet.getByRole("textbox", { name: "Player name" }).fill(name);
  if (options.saveToClub) await sheet.getByRole("checkbox", { name: "Save to club" }).check();
  await sheet.getByRole("button", { name: "Add guest" }).click();
}

/** Add one Guest through the Add players sheet. */
async function addPlayer(page: Page, name: string, options: { saveToClub?: boolean } = {}) {
  const sheet = await openAddPlayers(page);
  await lineUpGuest(sheet, name, options);
  await sheet.getByRole("button", { name: "Add 1 player" }).click();
  await expect(sheet).toBeHidden();
}

test.describe("Players list", () => {
  test("lists players alphabetically with the right status pills", async ({ page }) => {
    await openSeeded(page, buildSession({}, true));

    await expect(page.getByRole("heading", { level: 2, name: "Players" })).toBeVisible();
    await expect(playersRegion(page).getByText("10 players · 1 sitting out")).toBeVisible();
    expect(await rowNames(page)).toEqual(SORTED);

    for (const name of ["Zoe", "Ben", "ana", "Dan"]) {
      await expect(row(page, name).getByText("On court 1", { exact: true })).toBeVisible();
    }
    for (const name of ["Eve", "Fay", "Gus", "Hal"]) {
      await expect(row(page, name).getByText("In lineup · court 2", { exact: true })).toBeVisible();
    }
    await expect(row(page, "Ivy").getByText("Free", { exact: true })).toBeVisible();
    await expect(row(page, "Jon").getByText("Sitting out", { exact: true })).toBeVisible();
    await expect(row(page, "Jon").getByRole("button", { name: "Back in Jon" })).toBeVisible();
    await expect(row(page, "ana").getByText("0 played")).toBeVisible();
  });
});

test.describe("Sit out / Back in", () => {
  test("sitting out a Lineup player brings in a replacement; Back in works", async ({ page }) => {
    await openSeeded(page);
    const before = await lineupOf(court(page, 2));
    expect(playersOf(before)).toEqual(["Eve", "Fay", "Gus", "Hal"]);

    await row(page, "Eve").getByRole("button", { name: "Sit out Eve" }).click();

    await expect(row(page, "Eve").getByText("Sitting out", { exact: true })).toBeVisible();
    await expect(playersRegion(page).getByText("10 players · 1 sitting out")).toBeVisible();

    await expect.poll(async () => playersOf(await lineupOf(court(page, 2)))).not.toContain("Eve");
    const after = playersOf(await lineupOf(court(page, 2)));
    expect(after).toHaveLength(4);
    const replacements = after.filter((name) => !before.a.concat(before.b).includes(name));
    expect(replacements).toHaveLength(1);
    expect(["Ivy", "Jon"]).toContain(replacements[0]);
    await expect(
      row(page, replacements[0]!).getByText("In lineup · court 2", { exact: true }),
    ).toBeVisible();
    // Only the sitting-out player was swapped.
    expect(after.filter((name) => before.a.concat(before.b).includes(name))).toEqual(
      ["Fay", "Gus", "Hal"].sort(),
    );

    await row(page, "Eve").getByRole("button", { name: "Back in Eve" }).click();
    await expect(row(page, "Eve").getByRole("button", { name: "Sit out Eve" })).toBeVisible();
    await expect(row(page, "Eve").getByText("Free", { exact: true })).toBeVisible();
    await expect(playersRegion(page).getByText("10 players", { exact: true })).toBeVisible();

    const stored = await storedSession(page);
    expect(stored.players.find((player) => player.name === "Eve")!.sittingOut).toBe(false);
  });

  test("sitting out while on court applies after the match", async ({ page }) => {
    await openSeeded(page);
    await row(page, "ana").getByRole("button", { name: "Sit out ana" }).click();

    await expect(row(page, "ana").getByText("On court 1", { exact: true })).toBeVisible();
    await expect(
      row(page, "ana").getByText("Sitting out after this match", { exact: true }),
    ).toBeVisible();
    await expect(row(page, "ana").getByRole("button", { name: "Back in ana" })).toBeVisible();
    // Still playing: the match is untouched.
    await expect(court(page, 1).getByText("Playing", { exact: true })).toBeVisible();

    const dialog = await openScoreDialog(page, 1);
    await dialog.getByRole("button", { name: "End without score" }).click();
    await expect(dialog).toBeHidden();

    await expect(row(page, "ana").getByText("Sitting out", { exact: true })).toBeVisible();
    await expect(row(page, "ana").getByText("Sitting out after this match")).toHaveCount(0);
    const lineup = await lineupOf(court(page, 1));
    expect(playersOf(lineup)).toHaveLength(4);
    expect(playersOf(lineup)).not.toContain("ana");
    // The match still counted for her.
    await expect(row(page, "ana").getByText("1 played")).toBeVisible();
  });
});

test.describe("Remove player", () => {
  test("is blocked while on court, and the menu says why", async ({ page }) => {
    await openSeeded(page);
    const menu = await openMenu(page, "Ben");
    const remove = menu.getByRole("button", { name: "Remove", exact: true });
    await expect(remove).toHaveAttribute("aria-disabled", "true");
    await expect(menu.getByText("On court. End or remove their match first.")).toBeVisible();

    // dispatchEvent: Playwright won't click an aria-disabled button; a real tap still reaches it.
    await remove.dispatchEvent("click");
    await expect(page.getByRole("dialog", { name: /^Remove Ben/ })).toHaveCount(0);
    await menu.getByRole("button", { name: "Cancel" }).click();
    await expect(menu).toBeHidden();
    await expect(row(page, "Ben")).toBeVisible();
    expect((await storedSession(page)).players.find((p) => p.name === "Ben")!.removed).toBe(false);
  });

  test("a free player: Cancel keeps them; Remove takes them out", async ({ page }) => {
    await openSeeded(page);
    const menu = await openMenu(page, "Ivy");
    await menu.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(menu).toBeHidden();
    const dialog = page.getByRole("dialog", { name: "Remove Ivy from this session?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(row(page, "Ivy")).toBeVisible();
    await expect(playersRegion(page).getByText("10 players", { exact: true })).toBeVisible();

    await removePlayer(page, "Ivy");
    await expect(row(page, "Ivy")).toHaveCount(0);
    await expect(playersRegion(page).getByText("9 players", { exact: true })).toBeVisible();
    expect(await rowNames(page)).toEqual(SORTED.filter((name) => name !== "Ivy"));

    const stored = await storedSession(page);
    expect(stored.players.find((player) => player.name === "Ivy")!.removed).toBe(true);
    expect(stored.players).toHaveLength(10); // kept for history
  });

  test("a Lineup player can be removed and is replaced in the Lineup", async ({ page }) => {
    await openSeeded(page);
    await removePlayer(page, "Gus");
    await expect(row(page, "Gus")).toHaveCount(0);

    await expect.poll(async () => playersOf(await lineupOf(court(page, 2)))).not.toContain("Gus");
    expect(playersOf(await lineupOf(court(page, 2)))).toHaveLength(4);
    expect((await storedSession(page)).players.find((p) => p.name === "Gus")!.removed).toBe(true);
  });
});

test.describe("Add players", () => {
  test("Guests appear in the list, and get picked for a Court that was waiting for players", async ({
    page,
  }) => {
    await startSession(page);
    await page.getByRole("button", { name: "Add court" }).click();
    await expect(court(page, 3).getByText("Waiting for players")).toBeVisible();

    await addPlayer(page, "Kim");
    await expect(row(page, "Kim")).toBeVisible();
    await expect(row(page, "Kim").getByText("Free", { exact: true })).toBeVisible();
    await expect(row(page, "Kim").getByText("0 played")).toBeVisible();
    await expect(playersRegion(page).getByText("9 players", { exact: true })).toBeVisible();

    // Several Guests at once: nobody joins until the sheet's Add button.
    const added = ["Kim", "Lou", "Max", "Ned"];
    const sheet = await openAddPlayers(page);
    for (const name of added.slice(1)) await lineUpGuest(sheet, name);
    await expect(
      sheet.getByRole("list", { name: "Guests to add" }).getByRole("listitem"),
    ).toHaveCount(3);
    await expect(row(page, "Lou")).toHaveCount(0);
    await sheet.getByRole("button", { name: "Add 3 players" }).click();
    await expect(sheet).toBeHidden();

    await expect(court(page, 3).getByText("Lineup", { exact: true })).toBeVisible();
    expect(playersOf(await lineupOf(court(page, 3)))).toEqual(added);
    await expect(row(page, "Kim").getByText("In lineup · court 3", { exact: true })).toBeVisible();

    const stored = await storedSession(page);
    expect(stored.players).toHaveLength(12);
    expect(stored.players.find((p) => p.name === "Kim")).toMatchObject({
      skill: "intermediate",
      removed: false,
      clubPlayerId: null,
    });
  });

  test("duplicate names are rejected; skill level is kept", async ({ page }) => {
    await openSeeded(page);
    let sheet = await openAddPlayers(page);
    await sheet.getByRole("textbox", { name: "Player name" }).fill("kim");
    await sheet.getByRole("combobox", { name: "Skill level" }).selectOption({ label: "Advanced" });
    await sheet.getByRole("button", { name: "Add guest" }).click();
    await sheet.getByRole("button", { name: "Add 1 player" }).click();
    await expect(row(page, "kim")).toBeVisible();

    sheet = await openAddPlayers(page);
    await sheet.getByRole("textbox", { name: "Player name" }).fill("KIM");
    await sheet.getByRole("button", { name: "Add guest" }).click();
    await expect(sheet.getByText("Name already used")).toBeVisible();

    const stored = await storedSession(page);
    expect(stored.players.filter((p) => p.name.toLowerCase() === "kim")).toHaveLength(1);
    expect(stored.players.find((p) => p.name === "kim")!.skill).toBe("advanced");
  });

  test("Enter in the name field lines up the Guest and leaves the field empty and focused; duplicates are rejected", async ({
    page,
  }) => {
    await openSeeded(page);
    const sheet = await openAddPlayers(page);
    const field = sheet.getByRole("textbox", { name: "Player name" });
    await field.fill("Kim");
    await field.press("Enter");
    await expect(sheet.getByText("Kim", { exact: true })).toBeVisible();
    await expect(field).toHaveValue("");
    await expect(field).toBeFocused();

    // The next player can be typed straight away.
    await field.pressSequentially("Lou");
    await field.press("Enter");
    await expect(sheet.getByText("Lou", { exact: true })).toBeVisible();
    await expect(field).toBeFocused();

    await field.fill("KIM");
    await field.press("Enter");
    await expect(sheet.getByText("Name already used")).toBeVisible();
    await expect(field).toBeFocused();

    await sheet.getByRole("button", { name: "Add 2 players" }).click();
    await expect(row(page, "Kim")).toBeVisible();
    await expect(row(page, "Lou")).toBeVisible();
    const stored = await storedSession(page);
    expect(stored.players.filter((p) => p.name.toLowerCase() === "kim")).toHaveLength(1);
    expect(stored.players).toHaveLength(12);
  });

  test("Club players not in the Session join from the sheet with a Guest", async ({ page }) => {
    const club = makeClub({
      name: "Thursday Club",
      players: [
        makeClubPlayer({ name: "Carla", skill: "advanced" }),
        makeClubPlayer({ name: "Eli", skill: "beginner" }),
        makeClubPlayer({ name: "Mo", skill: "intermediate" }),
      ],
    });
    await seedStorage(page, { clubs: [club] });
    await openSeeded(page, buildSession({ clubId: club.id, clubName: club.name }));

    const sheet = await openAddPlayers(page);
    const roster = sheet.getByRole("list", { name: "Players in Thursday Club" });
    await expect(roster.getByRole("checkbox")).toHaveCount(3);
    await roster.getByRole("checkbox", { name: "Carla" }).check();
    await roster.getByRole("checkbox", { name: "Eli" }).check();

    // A Guest can't take the name of a Club player who could join.
    await lineUpGuest(sheet, "mo");
    await expect(sheet.getByText("Mo is in Thursday Club. Pick them above.")).toBeVisible();
    await lineUpGuest(sheet, "Ken");
    await sheet.getByRole("button", { name: "Add 3 players" }).click();
    await expect(sheet).toBeHidden();

    for (const name of ["Carla", "Eli", "Ken"]) await expect(row(page, name)).toBeVisible();
    const stored = await storedSession(page);
    expect(stored.players.find((p) => p.name === "Carla")).toMatchObject({
      skill: "advanced",
      clubPlayerId: club.players[0]!.id,
    });
    expect(stored.players.find((p) => p.name === "Eli")).toMatchObject({
      skill: "beginner",
      clubPlayerId: club.players[1]!.id,
    });
    expect(stored.players.find((p) => p.name === "Ken")!.clubPlayerId).toBeNull();

    // Only Mo is left to pick.
    const again = await openAddPlayers(page);
    await expect(
      again.getByRole("list", { name: "Players in Thursday Club" }).getByRole("checkbox"),
    ).toHaveCount(1);
  });

  test("Cancel closes the sheet and nobody joins; the next open starts empty", async ({ page }) => {
    const club = makeClub({ name: "Thursday Club", players: [makeClubPlayer({ name: "Carla" })] });
    await seedStorage(page, { clubs: [club] });
    await openSeeded(page, buildSession({ clubId: club.id, clubName: club.name }));
    const before = (await storedSession(page)).players.length;

    let sheet = await openAddPlayers(page);
    await expect(sheet.getByRole("button", { name: "Close" })).toHaveCount(0);
    await sheet.getByRole("checkbox", { name: "Carla" }).check();
    await lineUpGuest(sheet, "Kim");
    await sheet.getByRole("button", { name: "Cancel" }).click();
    await expect(sheet).toBeHidden();
    await expect(row(page, "Carla")).toHaveCount(0);
    await expect(row(page, "Kim")).toHaveCount(0);
    expect((await storedSession(page)).players).toHaveLength(before);

    sheet = await openAddPlayers(page);
    await expect(sheet.getByRole("checkbox", { name: "Carla" })).not.toBeChecked();
    await expect(sheet.getByRole("list", { name: "Guests to add" })).toHaveCount(0);
  });

  test("a Club player who left shows Left earlier and comes back with their history", async ({
    page,
  }) => {
    const club = makeClub({ name: "Thursday Club", players: [makeClubPlayer({ name: "Ivy" })] });
    const session = buildSession({ clubId: club.id, clubName: club.name });
    const ivy = session.players.find((player) => player.name === "Ivy")!;
    ivy.clubPlayerId = club.players[0]!.id;
    await seedStorage(page, { clubs: [club] });
    await openSeeded(page, session);

    await removePlayer(page, "Ivy");
    await expect(row(page, "Ivy")).toHaveCount(0);

    const sheet = await openAddPlayers(page);
    const tile = sheet.getByRole("checkbox", { name: "Ivy" });
    await expect(tile).toHaveAccessibleDescription("Left earlier");
    await tile.check();
    await sheet.getByRole("button", { name: "Add 1 player" }).click();
    await expect(notice(page, "Welcome back, Ivy")).toBeVisible();
    await expect(row(page, "Ivy")).toBeVisible();

    const stored = await storedSession(page);
    expect(stored.players.filter((player) => player.name === "Ivy")).toEqual([
      expect.objectContaining({ id: ivy.id, removed: false, clubPlayerId: club.players[0]!.id }),
    ]);
  });

  test("Save to club adds the Guest to the Club; unchecked does not", async ({ page }) => {
    const club = makeClub({ name: "Thursday Club", players: [] });
    await seedStorage(page, { clubs: [club] });
    await openSeeded(page, buildSession({ clubId: club.id }));

    const sheet = await openAddPlayers(page);
    await expect(sheet.getByText("Thursday Club has no players yet.")).toBeVisible();
    await expect(sheet.getByRole("checkbox", { name: "Save to club" })).not.toBeChecked();

    await sheet.getByRole("combobox", { name: "Skill level" }).selectOption({ label: "Advanced" });
    await lineUpGuest(sheet, "Saved Sam", { saveToClub: true });
    await expect(sheet.getByText("Saves to club")).toBeVisible();
    await lineUpGuest(sheet, "Temp Tina");
    await sheet.getByRole("button", { name: "Add 2 players" }).click();
    await expect(row(page, "Saved Sam")).toBeVisible();
    await expect(row(page, "Temp Tina")).toBeVisible();

    const clubs = (await readStoredData<(typeof club)[]>(page, "clubs"))!;
    expect(clubs[0]!.players).toEqual([
      { id: expect.any(String), name: "Saved Sam", skill: "advanced" },
    ]);
    const session = await storedSession(page);
    expect(session.players.find((p) => p.name === "Saved Sam")!.clubPlayerId).toBe(
      clubs[0]!.players[0]!.id,
    );
    expect(session.players.find((p) => p.name === "Temp Tina")!.clubPlayerId).toBeNull();
  });

  test("without a Club there is no Club part and no Save to club checkbox", async ({ page }) => {
    await openSeeded(page);
    const sheet = await openAddPlayers(page);
    await expect(sheet.getByRole("textbox", { name: "Player name" })).toBeVisible();
    await expect(sheet.getByRole("heading", { name: /^From / })).toHaveCount(0);
    await expect(sheet.getByRole("checkbox", { name: "Save to club" })).toHaveCount(0);

    // Nothing to add yet: the button says so instead of closing.
    await sheet.getByRole("button", { name: "Add players" }).click();
    await expect(sheet.getByText("Add a guest first.")).toBeVisible();
    await expect(sheet).toBeVisible();
  });

  test("re-adding a removed player's name restores them with their history", async ({ page }) => {
    const session = await openSeeded(page);
    const benId = session.players.find((player) => player.name === "Ben")!.id;

    // Give Ben a played match, then remove him (not on court any more).
    const dialog = await openScoreDialog(page, 1);
    await dialog.getByRole("button", { name: "End without score" }).click();
    await expect(dialog).toBeHidden();
    await expect(row(page, "Ben").getByText("1 played")).toBeVisible();

    await removePlayer(page, "Ben");
    await expect(row(page, "Ben")).toHaveCount(0);

    await addPlayer(page, "Ben");
    await expect(notice(page, "Welcome back, Ben")).toBeVisible();
    await expect(row(page, "Ben")).toBeVisible();
    await expect(row(page, "Ben").getByText("1 played")).toBeVisible();

    const stored = await storedSession(page);
    const bens = stored.players.filter((player) => player.name === "Ben");
    expect(bens).toHaveLength(1);
    expect(bens[0]).toMatchObject({ id: benId, removed: false, sittingOut: false });
    expect(stored.players).toHaveLength(10);
  });
});

test.describe("Skill level", () => {
  test("Save changes the Session player and their badge; Cancel changes nothing; the Club stays as it was", async ({
    page,
  }) => {
    const club = makeClub({ name: "Thursday Club", players: [makeClubPlayer({ name: "Ivy" })] });
    const session = buildSession({ clubId: club.id, clubName: club.name });
    session.players.find((player) => player.name === "Ivy")!.clubPlayerId = club.players[0]!.id;
    await seedStorage(page, { clubs: [club] });
    await openSeeded(page, session);
    const lineupBefore = await lineupOf(court(page, 2));

    let menu = await openMenu(page, "Ivy");
    await expect(menu.getByRole("radio", { name: "Intermediate" })).toBeChecked();
    await menu.getByText("Beginner", { exact: true }).click();
    await menu.getByRole("button", { name: "Cancel" }).click();
    await expect(menu).toBeHidden();
    expect((await storedSession(page)).players.find((p) => p.name === "Ivy")!.skill).toBe(
      "intermediate",
    );

    menu = await openMenu(page, "Ivy");
    await menu.getByText("Advanced", { exact: true }).click();
    await expect(
      menu.getByRole("checkbox", { name: "Also update in Thursday Club" }),
    ).not.toBeChecked();
    await menu.getByRole("button", { name: "Save" }).click();
    await expect(menu).toBeHidden();
    await expect(row(page, "Ivy").getByText("ADV", { exact: true })).toBeVisible();

    // Lineups already shown stay as they are.
    expect(await lineupOf(court(page, 2))).toEqual(lineupBefore);
    const stored = await storedSession(page);
    expect(stored.players.find((p) => p.name === "Ivy")!.skill).toBe("advanced");
    const clubs = (await readStoredData<(typeof club)[]>(page, "clubs"))!;
    expect(clubs[0]!.players[0]!.skill).toBe("intermediate");

    await page.reload();
    await expect(row(page, "Ivy").getByText("ADV", { exact: true })).toBeVisible();
  });

  test("Also update in the Club changes the Club player too; a Guest has no such choice", async ({
    page,
  }) => {
    const club = makeClub({ name: "Thursday Club", players: [makeClubPlayer({ name: "Ivy" })] });
    const session = buildSession({ clubId: club.id, clubName: club.name });
    session.players.find((player) => player.name === "Ivy")!.clubPlayerId = club.players[0]!.id;
    await seedStorage(page, { clubs: [club] });
    await openSeeded(page, session);

    const guest = await openMenu(page, "Jon");
    await expect(guest.getByRole("checkbox", { name: /^Also update in / })).toHaveCount(0);
    await guest.getByRole("button", { name: "Cancel" }).click();

    const menu = await openMenu(page, "Ivy");
    await menu.getByText("Beginner", { exact: true }).click();
    await menu.getByRole("checkbox", { name: "Also update in Thursday Club" }).check();
    await menu.getByRole("button", { name: "Save" }).click();
    await expect(menu).toBeHidden();

    expect((await storedSession(page)).players.find((p) => p.name === "Ivy")!.skill).toBe(
      "beginner",
    );
    await expect
      .poll(
        async () => (await readStoredData<(typeof club)[]>(page, "clubs"))![0]!.players[0]!.skill,
      )
      .toBe("beginner");
  });
});

/** The jump bar floats at the bottom on every screen size; some checks run on both. */
const JUMP_BAR_SIZES = [
  { name: "phones", viewport: null },
  { name: "wider screens", viewport: { width: 1024, height: 768 } },
] as const;

test.describe("Section jump bar", () => {
  test("Players button scrolls the Players section into view", async ({ page }) => {
    await openSeeded(page);
    const nav = page.getByRole("navigation", { name: "Sections" });
    const heading = page.getByRole("heading", { level: 2, name: "Players" });

    await expect(nav.getByRole("button", { name: "Courts" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    await expect(nav.getByRole("button", { name: "Players" })).not.toHaveAttribute("aria-current");
    await expect(heading).not.toBeInViewport();

    await nav.getByRole("button", { name: "Players" }).click();
    await expect(heading).toBeInViewport();
    await expect(nav.getByRole("button", { name: "Players" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    // Not hidden under the top bar, nor under the jump bar floating at the bottom.
    await expect
      .poll(async () => {
        const topBar = (await page.getByRole("banner").boundingBox())!;
        const navBox = (await nav.boundingBox())!;
        const headingBox = (await heading.boundingBox())!;
        return (
          headingBox.y >= topBar.y + topBar.height - 1 &&
          headingBox.y + headingBox.height <= navBox.y + 1
        );
      })
      .toBe(true);

    await nav.getByRole("button", { name: "Courts" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Courts" })).toBeInViewport();
    await expect(nav.getByRole("button", { name: "Courts" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  for (const size of JUMP_BAR_SIZES) {
    test(`on ${size.name} it floats at the bottom and never covers End session`, async ({
      page,
    }) => {
      if (size.viewport) await page.setViewportSize(size.viewport);
      await openSeeded(page);
      const nav = page.getByRole("navigation", { name: "Sections" });
      const viewport = page.viewportSize()!;
      const navBox = (await nav.boundingBox())!;
      // A capsule: clear of the bottom edge and narrower than the screen.
      expect(navBox.y + navBox.height).toBeLessThan(viewport.height - 4);
      expect(navBox.y + navBox.height).toBeGreaterThan(viewport.height - 80);
      expect(navBox.width).toBeLessThan(viewport.width - 16);

      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const end = page.getByRole("button", { name: "End session" });
      await expect
        .poll(async () => {
          const box = (await end.boundingBox())!;
          const bar = (await nav.boundingBox())!;
          return box.y + box.height <= bar.y;
        })
        .toBe(true);
    });
  }

  test("pop-up messages sit above the bar", async ({ page }) => {
    await openSeeded(page);
    const nav = page.getByRole("navigation", { name: "Sections" });
    // Bringing a removed player back says "Welcome back".
    await removePlayer(page, "Ivy");
    await expect(row(page, "Ivy")).toHaveCount(0);
    await addPlayer(page, "Ivy");
    const message = notice(page, "Welcome back, Ivy");
    await expect(message).toBeVisible();
    const text = (await message.getByText("Welcome back, Ivy").boundingBox())!;
    const bar = (await nav.boundingBox())!;
    expect(text.y + text.height).toBeLessThanOrEqual(bar.y);
  });

  test("on wider screens jumping lands a section clear of the top bar and the jump bar", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await openSeeded(page);
    const nav = page.getByRole("navigation", { name: "Sections" });
    const heading = page.getByRole("heading", { level: 2, name: "Players" });
    await nav.getByRole("button", { name: "Players" }).click();
    await expect(heading).toBeInViewport();
    await expect(nav.getByRole("button", { name: "Players" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    await expect
      .poll(async () => {
        const topBar = (await page.getByRole("banner").boundingBox())!;
        const bar = (await nav.boundingBox())!;
        const box = (await heading.boundingBox())!;
        return box.y >= topBar.y + topBar.height - 1 && box.y + box.height <= bar.y + 1;
      })
      .toBe(true);
  });

  for (const size of JUMP_BAR_SIZES) {
    test(`on ${size.name} it gets out of the way while typing a name`, async ({ page }) => {
      if (size.viewport) await page.setViewportSize(size.viewport);
      await openSeeded(page);
      const nav = page.getByRole("navigation", { name: "Sections" });
      await expect(nav).toBeVisible();
      const field = (await openAddPlayers(page)).getByRole("textbox", { name: "Player name" });

      await field.focus();
      await expect(nav).toBeHidden();
      await field.blur();
      await expect(nav).toBeVisible();
    });
  }

  test("jumping to a collapsed Players section opens it", async ({ page }) => {
    await openSeeded(page);
    await playersRegion(page).getByRole("button", { name: "Hide players" }).click();
    await expect(row(page, "Ivy")).toHaveCount(0);
    await expect(playersRegion(page).getByText("10 players")).toBeVisible();

    await page
      .getByRole("navigation", { name: "Sections" })
      .getByRole("button", { name: "Players" })
      .click();
    await expect(row(page, "Ivy")).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Players" })).toBeInViewport();
  });
});

test.describe("Players sort", () => {
  test("sorts by Status and Plays; the choice is remembered", async ({ page }) => {
    await openSeeded(page, buildSession({}, true));
    const region = playersRegion(page);
    await expect(region.getByRole("radio", { name: "Name" })).toBeChecked();

    await region.getByText("Status", { exact: true }).click();
    await expect(region.getByRole("radio", { name: "Status" })).toBeChecked();
    expect(await rowNames(page)).toEqual([
      "ana",
      "Ben",
      "Dan",
      "Zoe",
      "Eve",
      "Fay",
      "Gus",
      "Hal",
      "Ivy",
      "Jon",
    ]);

    // Court 1's four players now have 1 played, so they go last.
    const dialog = await openScoreDialog(page, 1);
    await dialog.getByRole("button", { name: "End without score" }).click();
    await expect(dialog).toBeHidden();
    await region.getByText("Plays", { exact: true }).click();
    const names = await rowNames(page);
    expect(names.slice(-4)).toEqual(["ana", "Ben", "Dan", "Zoe"]);

    await page.reload();
    await expect(playersRegion(page).getByRole("radio", { name: "Plays" })).toBeChecked();
  });
});
