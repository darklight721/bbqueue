import { expect, test, type Locator, type Page } from "@playwright/test";
import type { Session } from "../src/domain/types.ts";
import { makeClub, makeMidMatchSession, readStoredData, seedStorage } from "./fixtures.ts";
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

async function removePlayer(page: Page, name: string) {
  await playersRegion(page)
    .getByRole("button", { name: `Remove ${name}`, exact: true })
    .click();
  await page
    .getByRole("dialog", { name: `Remove ${name} from this session?` })
    .getByRole("button", { name: "Remove", exact: true })
    .click();
}

async function addPlayer(page: Page, name: string, options: { saveToClub?: boolean } = {}) {
  const region = playersRegion(page);
  await region.getByRole("textbox", { name: "Player name" }).fill(name);
  if (options.saveToClub) await region.getByRole("checkbox", { name: "Save to club" }).check();
  await region.getByRole("button", { name: "Add player" }).click();
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
  test("is blocked while on court", async ({ page }) => {
    await openSeeded(page);
    const remove = playersRegion(page).getByRole("button", { name: "Remove Ben" });
    await expect(remove).toHaveAttribute("aria-disabled", "true");

    // dispatchEvent: see the pointer-events note on the real-tap test below.
    await remove.dispatchEvent("click");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(notice(page, "End or remove their match first.")).toBeVisible();
    await expect(row(page, "Ben")).toBeVisible();
    expect((await storedSession(page)).players.find((p) => p.name === "Ben")!.removed).toBe(false);
  });

  // daisyUI sets pointer-events: none on `.btn[aria-disabled="true"]`; the blocked Remove button
  // re-enables pointer events so a real tap still explains why it's blocked.
  test("tapping the blocked Remove button explains why", async ({ page }) => {
    await openSeeded(page);
    const remove = playersRegion(page).getByRole("button", { name: "Remove Ben" });
    await remove.scrollIntoViewIfNeeded();
    const box = (await remove.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(notice(page, "End or remove their match first.")).toBeVisible({ timeout: 2000 });
  });

  test("a free player: Cancel keeps them; Remove takes them out", async ({ page }) => {
    await openSeeded(page);
    await playersRegion(page).getByRole("button", { name: "Remove Ivy" }).click();
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

test.describe("Add player", () => {
  test("appears in the list, and gets picked for a Court that was waiting for players", async ({
    page,
  }) => {
    await startSession(page);
    await page.getByRole("button", { name: "Add court" }).click();
    await expect(court(page, 3).getByText("Waiting for players")).toBeVisible();

    const added = ["Kim", "Lou", "Max", "Ned"];
    await addPlayer(page, "Kim");
    await expect(row(page, "Kim")).toBeVisible();
    await expect(row(page, "Kim").getByText("Free", { exact: true })).toBeVisible();
    await expect(row(page, "Kim").getByText("0 played")).toBeVisible();
    await expect(playersRegion(page).getByText("9 players", { exact: true })).toBeVisible();
    await expect(playersRegion(page).getByRole("textbox", { name: "Player name" })).toHaveValue("");

    for (const name of added.slice(1)) await addPlayer(page, name);

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
    const region = playersRegion(page);
    await region.getByRole("textbox", { name: "Player name" }).fill("kim");
    await region.getByRole("combobox", { name: "Skill level" }).selectOption({ label: "Advanced" });
    await region.getByRole("button", { name: "Add player" }).click();
    await expect(row(page, "kim")).toBeVisible();

    await region.getByRole("textbox", { name: "Player name" }).fill("KIM");
    await region.getByRole("button", { name: "Add player" }).click();
    await expect(region.getByText("Name already used")).toBeVisible();

    const stored = await storedSession(page);
    expect(stored.players.filter((p) => p.name.toLowerCase() === "kim")).toHaveLength(1);
    expect(stored.players.find((p) => p.name === "kim")!.skill).toBe("advanced");
  });

  test("Enter in the name field adds the player and leaves the field empty and focused; duplicates are rejected", async ({
    page,
  }) => {
    await openSeeded(page);
    const field = playersRegion(page).getByRole("textbox", { name: "Player name" });
    await field.fill("Kim");
    await field.press("Enter");
    await expect(row(page, "Kim")).toBeVisible();
    await expect(playersRegion(page).getByText("11 players", { exact: true })).toBeVisible();
    await expect(field).toHaveValue("");
    await expect(field).toBeFocused();

    // The next player can be typed straight away.
    await field.pressSequentially("Lou");
    await field.press("Enter");
    await expect(row(page, "Lou")).toBeVisible();
    await expect(field).toBeFocused();

    await field.fill("KIM");
    await field.press("Enter");
    await expect(playersRegion(page).getByText("Name already used")).toBeVisible();
    await expect(field).toBeFocused();
    const stored = await storedSession(page);
    expect(stored.players.filter((p) => p.name.toLowerCase() === "kim")).toHaveLength(1);
    expect(stored.players).toHaveLength(12);
  });

  test("Save to club adds the player to the Club; unchecked does not", async ({ page }) => {
    const club = makeClub({ name: "Thursday Club", players: [] });
    await seedStorage(page, { clubs: [club] });
    await openSeeded(page, buildSession({ clubId: club.id }));

    const saveToClub = playersRegion(page).getByRole("checkbox", { name: "Save to club" });
    await expect(saveToClub).not.toBeChecked();

    await playersRegion(page).getByRole("combobox", { name: "Skill level" }).selectOption({
      label: "Advanced",
    });
    await addPlayer(page, "Saved Sam", { saveToClub: true });
    await expect(row(page, "Saved Sam")).toBeVisible();
    await addPlayer(page, "Temp Tina");
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

  test("without a Club there is no Save to club checkbox", async ({ page }) => {
    await openSeeded(page);
    await expect(playersRegion(page).getByRole("textbox", { name: "Player name" })).toBeVisible();
    await expect(playersRegion(page).getByRole("checkbox", { name: "Save to club" })).toHaveCount(
      0,
    );
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
    // Not hidden under the top bar, nor under the jump bar (at the bottom on phones).
    await expect
      .poll(async () => {
        const topBar = (await page.getByRole("banner").boundingBox())!;
        const navBox = (await nav.boundingBox())!;
        const headingBox = (await heading.boundingBox())!;
        const navOnTop = navBox.y < topBar.y + topBar.height + 1;
        const clearTop = navOnTop ? navBox.y + navBox.height : topBar.y + topBar.height;
        const clearBottom = navOnTop ? Infinity : navBox.y;
        return headingBox.y >= clearTop - 1 && headingBox.y + headingBox.height <= clearBottom + 1;
      })
      .toBe(true);

    await nav.getByRole("button", { name: "Courts" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Courts" })).toBeInViewport();
    await expect(nav.getByRole("button", { name: "Courts" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  test("on phones it sits at the bottom and never covers End session", async ({ page }) => {
    await openSeeded(page);
    const nav = page.getByRole("navigation", { name: "Sections" });
    const viewport = page.viewportSize()!;
    const navBox = (await nav.boundingBox())!;
    expect(navBox.y + navBox.height).toBeGreaterThan(viewport.height - 2);

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

  test("on phones pop-up messages sit above the bar", async ({ page }) => {
    await openSeeded(page);
    const nav = page.getByRole("navigation", { name: "Sections" });
    // Removing a player on court is blocked with a message (the button is aria-disabled).
    await row(page, "Ben")
      .getByRole("button", { name: "Remove Ben", exact: true })
      .dispatchEvent("click");
    const message = notice(page, "End or remove their match first.");
    await expect(message).toBeVisible();
    const text = (await message.getByText("End or remove their match first.").boundingBox())!;
    const bar = (await nav.boundingBox())!;
    expect(text.y + text.height).toBeLessThanOrEqual(bar.y);
  });

  test("on wider screens it sticks under the top bar without hiding section titles", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await openSeeded(page);
    const nav = page.getByRole("navigation", { name: "Sections" });
    const topBar = (await page.getByRole("banner").boundingBox())!;
    const navBox = (await nav.boundingBox())!;
    expect(Math.abs(navBox.y - (topBar.y + topBar.height))).toBeLessThan(2);

    const heading = page.getByRole("heading", { level: 2, name: "Players" });
    await nav.getByRole("button", { name: "Players" }).click();
    await expect(heading).toBeInViewport();
    await expect
      .poll(async () => {
        const bar = (await nav.boundingBox())!;
        const box = (await heading.boundingBox())!;
        return box.y >= bar.y + bar.height - 1;
      })
      .toBe(true);
  });

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
