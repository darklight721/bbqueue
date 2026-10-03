import { expect, test, type Page } from "@playwright/test";
import type { Club, Session } from "../src/domain/types.ts";
import {
  makeClub,
  makeClubPlayer,
  makeClubWithPlayers,
  makeEndedSession,
  makeSession,
  readStoredData,
  seedStorage,
} from "./fixtures.ts";

const suggestion = (page: Page) => page.getByText(/^Suggested:/);

/**
 * Tap the visible 21 / 31 button. The radio inside is visually hidden (1px), so a forced
 * click on it can land under the sticky footer; clicking the label is what a user does.
 */
const pickPoints = (page: Page, points: 21 | 31) =>
  page
    .locator("label")
    .filter({ has: page.getByRole("radio", { name: `${points} points` }) })
    .click();

function friday(): Club {
  return makeClub({
    name: "Friday Club",
    players: [
      makeClubPlayer({ name: "Zoe", skill: "advanced" }),
      makeClubPlayer({ name: "Amy", skill: "beginner" }),
      makeClubPlayer({ name: "Ben", skill: "intermediate" }),
      makeClubPlayer({ name: "Cat", skill: "intermediate" }),
      makeClubPlayer({ name: "Dan", skill: "advanced" }),
    ],
  });
}

async function addGuest(
  page: Page,
  name: string,
  options: { skill?: string; saveToClub?: boolean } = {},
) {
  await page.getByRole("textbox", { name: "Player name" }).fill(name);
  if (options.skill) {
    await page
      .getByRole("combobox", { name: "Skill level" })
      .selectOption({ label: options.skill });
  }
  if (options.saveToClub) await page.getByRole("checkbox", { name: "Save to club" }).check();
  await page.getByRole("button", { name: "Add guest" }).click();
  await expect(page.getByRole("textbox", { name: "Player name" })).toHaveValue("");
  await expect(page.getByRole("button", { name: `Remove ${name}` })).toBeVisible();
}

async function addGuests(page: Page, names: string[]) {
  for (const name of names) await addGuest(page, name);
}

const startButton = (page: Page) => page.getByRole("button", { name: "Start session" });

test.describe("Club selection", () => {
  test("one Club is auto-selected; players listed alphabetically, unchecked", async ({ page }) => {
    const club = friday();
    await seedStorage(page, { clubs: [club] });
    await page.goto("/sessions/new");
    await expect(page.getByRole("heading", { level: 1, name: "New session" })).toBeVisible();

    await expect(page.getByRole("combobox", { name: "Club" })).toHaveValue(club.id);
    const region = page.getByRole("region", { name: "Club players" });
    const boxes = region.getByRole("checkbox");
    await expect(boxes).toHaveCount(5);
    for (const [index, name] of ["Amy", "Ben", "Cat", "Dan", "Zoe"].entries()) {
      await expect(boxes.nth(index)).toHaveAccessibleName(name);
      await expect(boxes.nth(index)).not.toBeChecked();
    }
    await expect(page.getByText("No players selected")).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Save to club" })).not.toBeChecked();
  });

  test("several Clubs → 'Choose a club' placeholder until one is picked", async ({ page }) => {
    const a = friday();
    const b = makeClub({ name: "Alpha Club", players: [makeClubPlayer({ name: "Xena" })] });
    await seedStorage(page, { clubs: [a, b] });
    await page.goto("/sessions/new");

    const select = page.getByRole("combobox", { name: "Club" });
    await expect(select).toHaveValue("");
    await expect(page.getByRole("option", { name: "Choose a club" })).toHaveCount(1);
    await expect(
      page.getByRole("region", { name: "Club players" }).getByRole("checkbox"),
    ).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: "Save to club" })).toHaveCount(0);

    await select.selectOption(b.id);
    await expect(page.getByRole("checkbox", { name: "Xena" })).toBeVisible();
    // Placeholder disappears once a choice is made.
    await expect(page.getByRole("option", { name: "Choose a club" })).toHaveCount(0);
  });

  test("several Clubs: Start is blocked with 'Choose a club' until a choice is made", async ({
    page,
  }) => {
    await seedStorage(page, {
      clubs: [
        friday(),
        makeClub({ name: "Alpha Club", players: [makeClubPlayer({ name: "Xena" })] }),
      ],
    });
    await page.goto("/sessions/new");
    await addGuests(page, ["Ann", "Bo", "Cy", "Di"]);
    await expect(page.getByText("4 players selected")).toBeVisible();

    await expect(startButton(page)).toBeDisabled();
    await expect(page.locator("p", { hasText: /^Choose a club$/ })).toBeVisible();

    await page.getByRole("combobox", { name: "Club" }).selectOption("none");
    await expect(startButton(page)).toBeEnabled();
    await startButton(page).click();
    await expect(page).toHaveURL(/\/sessions\/(?!new$)[^/]+$/);
    expect((await readStoredData<Session>(page, "session"))!.clubId).toBeNull();
  });

  test("Select all / none toggles; changing Club clears checked players but keeps Guests", async ({
    page,
  }) => {
    const a = friday();
    const b = makeClub({ name: "Alpha Club", players: [makeClubPlayer({ name: "Xena" })] });
    await seedStorage(page, { clubs: [a, b] });
    await page.goto("/sessions/new");
    const select = page.getByRole("combobox", { name: "Club" });
    await select.selectOption(a.id);

    await page.getByRole("button", { name: "Select all" }).click();
    await expect(page.getByText("5 players selected")).toBeVisible();
    await expect(page.getByRole("button", { name: "Select all" })).toHaveCount(0);
    await page.getByRole("button", { name: "Select none" }).click();
    await expect(page.getByText("No players selected")).toBeVisible();

    await page.getByRole("checkbox", { name: "Amy" }).check();
    await addGuest(page, "Gus");
    await expect(page.getByText("2 players selected")).toBeVisible();

    await select.selectOption(b.id);
    await expect(page.getByText("1 player selected")).toBeVisible(); // Gus only
    await expect(page.getByRole("button", { name: "Remove Gus" })).toBeVisible();

    await select.selectOption("none");
    await expect(page.getByRole("region", { name: "Club players" })).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: "Save to club" })).toHaveCount(0);
  });
});

test.describe("Starting a session", () => {
  test("one Club: tick 4 → Start → /session with the right stored session", async ({ page }) => {
    const club = friday();
    await seedStorage(page, { clubs: [club] });
    await page.goto("/sessions/new");

    await page.getByRole("textbox", { name: "Session name" }).fill("League night");
    for (const name of ["Amy", "Ben", "Cat", "Dan"]) {
      await page.getByRole("checkbox", { name, exact: true }).check();
    }
    await expect(page.getByText("4 players selected")).toBeVisible();
    await page.getByRole("button", { name: "Increase Courts" }).click();
    await expect(page.getByRole("spinbutton", { name: "Courts" })).toHaveValue("2");

    await startButton(page).click();
    await expect(page).toHaveURL(/\/sessions\/(?!new$)[^/]+$/);
    await expect(page.getByRole("heading", { level: 1, name: "League night" })).toBeVisible();

    const session = await readStoredData<Session>(page, "session");
    expect(session).not.toBeNull();
    expect(session!.name).toBe("League night");
    expect(session!.clubId).toBe(club.id);
    expect(session!.courts.map((court) => court.number)).toEqual([1, 2]);
    expect(session!.plannedHours).toBe(1);
    expect(session!.players.map((player) => player.name).sort()).toEqual([
      "Amy",
      "Ben",
      "Cat",
      "Dan",
    ]);
    expect(session!.players.every((player) => player.clubPlayerId !== null)).toBe(true);
  });

  test("no Clubs: guests-only preselected; 4 Guests → Start works; no 'Save to club'", async ({
    page,
  }) => {
    await page.goto("/sessions/new");
    await expect(page.getByRole("combobox", { name: "Club" })).toHaveValue("none");
    await expect(page.getByRole("region", { name: "Club players" })).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 2, name: "Guests" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Save to club" })).toHaveCount(0);

    await addGuest(page, "Ann", { skill: "Beginner" });
    await addGuests(page, ["Bo", "Cy", "Di"]);
    await expect(page.getByText("4 players selected")).toBeVisible();
    await expect(startButton(page)).toBeEnabled();
    await startButton(page).click();

    await expect(page).toHaveURL(/\/sessions\/(?!new$)[^/]+$/);
    const session = await readStoredData<Session>(page, "session");
    expect(session!.clubId).toBeNull();
    expect(session!.pointSystem).toBe(21);
    expect(session!.courts).toHaveLength(1);
    expect(session!.players).toHaveLength(4);
    const ann = session!.players.find((player) => player.name === "Ann");
    expect(ann).toMatchObject({ skill: "beginner", clubPlayerId: null });
  });

  test("Start is disabled with fewer than 4 players, and when the name is empty", async ({
    page,
  }) => {
    await page.goto("/sessions/new");
    await expect(startButton(page)).toBeDisabled();
    await expect(page.getByText("Add at least 4 players")).toBeVisible();

    await addGuests(page, ["Ann", "Bo", "Cy"]);
    await expect(page.getByText("3 players selected")).toBeVisible();
    await expect(startButton(page)).toBeDisabled();

    await addGuest(page, "Di");
    await expect(startButton(page)).toBeEnabled();

    await page.getByRole("textbox", { name: "Session name" }).fill("   ");
    await expect(startButton(page)).toBeDisabled();
    await expect(page.getByText("Enter a session name").first()).toBeVisible();

    await page.getByRole("button", { name: "Remove Di" }).click();
    await page.getByRole("textbox", { name: "Session name" }).fill("Night");
    await expect(startButton(page)).toBeDisabled();
  });

  test("Enter in the guest name field adds the guest; duplicate names are rejected", async ({
    page,
  }) => {
    await page.goto("/sessions/new");
    const field = page.getByRole("textbox", { name: "Player name" });
    await field.fill("Ann");
    await field.press("Enter");
    await expect(page.getByRole("button", { name: "Remove Ann" })).toBeVisible();
    await expect(field).toHaveValue("");

    await field.fill("ann");
    await field.press("Enter");
    await expect(page.getByText("Name already used")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(1);
  });

  test("Start opens /sessions/<id> and leaves Ended sessions alone", async ({ page }) => {
    const ended = makeEndedSession({ name: "Last week" });
    await seedStorage(page, { endedSessions: [ended] });
    await page.goto("/sessions/new");
    await addGuests(page, ["Ann", "Bo", "Cy", "Di"]);
    await startButton(page).click();
    await expect(page).toHaveURL(/\/sessions\/(?!new$)[^/]+$/);
    const session = (await readStoredData<Session>(page, "session"))!;
    expect(new URL(page.url()).pathname).toBe(`/sessions/${session.id}`);
    expect(await readStoredData<{ id: string }[]>(page, "endedSessions")).toMatchObject([
      { id: ended.id },
    ]);
  });

  test("the Session opens scrolled to the top, even if New session was scrolled down", async ({
    page,
  }) => {
    await seedStorage(page, { clubs: [makeClubWithPlayers(24, { name: "Big Club" })] });
    await page.goto("/sessions/new");
    await page.getByRole("textbox", { name: "Session name" }).fill("Long night");
    const boxes = page.getByRole("region", { name: "Club players" }).getByRole("checkbox");
    for (const box of await boxes.all()) await box.check();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

    await startButton(page).click();
    await expect(page).toHaveURL(/\/sessions\/(?!new$)[^/]+$/);
    await expect(page.getByRole("heading", { level: 1, name: "Long night" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  });
});

test.describe("Save to club", () => {
  test("a Guest with 'Save to club' ends up in the Club; an unchecked one does not", async ({
    page,
  }) => {
    const club = friday();
    await seedStorage(page, { clubs: [club] });
    await page.goto("/sessions/new");

    await addGuest(page, "Saved Sam", { skill: "Advanced", saveToClub: true });
    await expect(page.getByText("Saves to club")).toBeVisible();
    await addGuest(page, "Temp Tina");
    await page.getByRole("checkbox", { name: "Amy" }).check();
    await page.getByRole("checkbox", { name: "Ben" }).check();
    await startButton(page).click();
    await expect(page).toHaveURL(/\/sessions\/(?!new$)[^/]+$/);

    const clubs = await readStoredData<Club[]>(page, "clubs");
    const stored = clubs!.find((candidate) => candidate.id === club.id)!;
    expect(stored.players).toHaveLength(6);
    expect(stored.players.find((player) => player.name === "Saved Sam")?.skill).toBe("advanced");
    expect(stored.players.some((player) => player.name === "Temp Tina")).toBe(false);

    const session = await readStoredData<Session>(page, "session");
    const sam = session!.players.find((player) => player.name === "Saved Sam");
    const savedId = stored.players.find((player) => player.name === "Saved Sam")!.id;
    expect(sam?.clubPlayerId).toBe(savedId);
    expect(session!.players.find((player) => player.name === "Temp Tina")?.clubPlayerId).toBeNull();
  });
});

test.describe("Steppers and point system", () => {
  test("Courts and Hours respect their bounds", async ({ page }) => {
    await page.goto("/sessions/new");
    const courts = page.getByRole("spinbutton", { name: "Courts" });
    const hours = page.getByRole("spinbutton", { name: "Hours" });
    await expect(courts).toHaveValue("1");
    await expect(hours).toHaveValue("1");

    await expect(page.getByRole("button", { name: "Decrease Courts" })).toBeDisabled();
    for (let i = 0; i < 9; i++) await page.getByRole("button", { name: "Increase Courts" }).click();
    await expect(courts).toHaveValue("10");
    await expect(page.getByRole("button", { name: "Increase Courts" })).toBeDisabled();
    await page.getByRole("button", { name: "Decrease Courts" }).click();
    await expect(courts).toHaveValue("9");

    await page.getByRole("button", { name: "Increase Hours" }).click();
    await expect(hours).toHaveValue("2");
    await page.getByRole("button", { name: "Increase Hours" }).click();
    await expect(hours).toHaveValue("3");
    await page.getByRole("button", { name: "Decrease Hours" }).click();
    await page.getByRole("button", { name: "Decrease Hours" }).click();
    await expect(hours).toHaveValue("1");
    await expect(page.getByRole("button", { name: "Decrease Hours" })).toBeDisabled();

    // Typed decimals round to a whole number on blur.
    await hours.fill("2.5");
    await hours.blur();
    await expect(hours).toHaveValue("3");

    // Typed out-of-range values are clamped on blur.
    await hours.fill("99");
    await hours.blur();
    await expect(hours).toHaveValue("12");
    await expect(page.getByRole("button", { name: "Increase Hours" })).toBeDisabled();
    await courts.fill("0");
    await courts.blur();
    await expect(courts).toHaveValue("1");
  });

  test("suggestion is hidden below 4 players", async ({ page }) => {
    await page.goto("/sessions/new");
    await expect(suggestion(page)).toHaveCount(0);
    await addGuests(page, ["Ann", "Bo", "Cy"]);
    await expect(suggestion(page)).toHaveCount(0);
    await addGuest(page, "Di");
    await expect(suggestion(page)).toBeVisible();
  });

  test("suggestion follows players / courts / hours", async ({ page }) => {
    await page.goto("/sessions/new");
    await addGuests(page, ["Ann", "Bo", "Cy", "Di"]);

    await expect(suggestion(page)).toHaveText("Suggested: 21 — about 4 games each");
    await expect(page.getByRole("radio", { name: "21 points" })).toBeChecked();

    await page.getByRole("button", { name: "Increase Courts" }).click();
    await expect(suggestion(page)).toHaveText("Suggested: 31 — about 4 games each");
    await expect(page.getByRole("radio", { name: "31 points" })).toBeChecked();

    await page.getByRole("button", { name: "Decrease Courts" }).click();
    await expect(page.getByRole("radio", { name: "21 points" })).toBeChecked();
    for (let i = 0; i < 2; i++) await page.getByRole("button", { name: "Increase Hours" }).click();
    await expect(suggestion(page)).toHaveText("Suggested: 31 — about 6 games each");

    // More players → fewer games each; exactly 3 games each at 30 min is still 31, 10 players drops to 21.
    await addGuests(page, ["Ed", "Flo", "Gil", "Hal"]);
    await expect(suggestion(page)).toHaveText("Suggested: 31 — about 3 games each");
    await addGuests(page, ["Ivy", "Jon"]);
    await expect(suggestion(page)).toHaveText("Suggested: 21 — about 5 games each");
    await expect(page.getByRole("radio", { name: "21 points" })).toBeChecked();
  });

  test("manual override sticks until 'Use suggestion'", async ({ page }) => {
    await page.goto("/sessions/new");
    await addGuests(page, ["Ann", "Bo", "Cy", "Di"]);
    await expect(page.getByRole("button", { name: "Use suggestion" })).toHaveCount(0);

    await pickPoints(page, 31);
    await expect(page.getByRole("radio", { name: "31 points" })).toBeChecked();
    await expect(page.getByRole("button", { name: "Use suggestion" })).toBeVisible();

    // Suggestion changes, override stays.
    await page.getByRole("button", { name: "Increase Courts" }).click();
    await expect(suggestion(page)).toHaveText("Suggested: 31 — about 4 games each");
    await expect(page.getByRole("button", { name: "Use suggestion" })).toHaveCount(0); // matches now
    await page.getByRole("button", { name: "Decrease Courts" }).click();
    await expect(page.getByRole("radio", { name: "31 points" })).toBeChecked();

    await page.getByRole("button", { name: "Use suggestion" }).click();
    await expect(page.getByRole("radio", { name: "21 points" })).toBeChecked();
    await expect(page.getByRole("button", { name: "Use suggestion" })).toHaveCount(0);

    // The chosen system is what gets saved.
    await pickPoints(page, 31);
    await startButton(page).click();
    await expect(page).toHaveURL(/\/sessions\/(?!new$)[^/]+$/);
    expect((await readStoredData<Session>(page, "session"))!.pointSystem).toBe(31);
  });
});

test.describe("Existing saved session", () => {
  async function fillAndStart(page: Page) {
    await page.goto("/sessions/new");
    await page.getByRole("textbox", { name: "Session name" }).fill("Brand new");
    await addGuests(page, ["Ann", "Bo", "Cy", "Di"]);
    await startButton(page).click();
  }

  test("confirm is shown; Cancel keeps the old session", async ({ page }) => {
    const old = makeSession({ name: "Old night" });
    await seedStorage(page, { session: old });
    await fillAndStart(page);

    const dialog = page.getByRole("dialog", { name: "End the current session 'Old night'?" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleDescription("It will be discarded.");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();

    await expect(page).toHaveURL(/\/sessions\/new$/);
    const stored = await readStoredData<Session>(page, "session");
    expect(stored).toEqual(old);
  });

  test("Discard and start replaces the old session", async ({ page }) => {
    const old = makeSession({ name: "Old night" });
    await seedStorage(page, { session: old });
    await fillAndStart(page);

    await page
      .getByRole("dialog", { name: "End the current session 'Old night'?" })
      .getByRole("button", { name: "Discard and start" })
      .click();

    await expect(page).toHaveURL(/\/sessions\/(?!new$)[^/]+$/);
    const stored = await readStoredData<Session>(page, "session");
    expect(stored!.id).not.toBe(old.id);
    expect(stored!.name).toBe("Brand new");
    expect(stored!.players).toHaveLength(4);
  });
});

test("Back goes Home", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "New session" }).click();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test.describe("Opened from a Club", () => {
  test("Club screen → New session → Club locked → pick players → Start → the Session", async ({
    page,
  }) => {
    const club = friday();
    const other = makeClub({ name: "Alpha Club", players: [makeClubPlayer({ name: "Xena" })] });
    await seedStorage(page, { clubs: [club, other] });
    await page.goto(`/clubs/${club.id}`);

    await page.getByRole("link", { name: "New session" }).click();
    await expect(page).toHaveURL(new RegExp(`/sessions/new\\?club=${club.id}$`));
    await expect(page.getByRole("heading", { level: 1, name: "New session" })).toBeVisible();

    // Locked: the Club is a fixed value, not a picker.
    await expect(page.getByRole("combobox", { name: "Club" })).toHaveCount(0);
    const locked = page.getByRole("textbox", { name: "Club" });
    await expect(locked).toHaveValue("Friday Club");
    await expect(locked).not.toBeEditable();
    await expect(page.getByRole("checkbox", { name: "Xena" })).toHaveCount(0);

    await page.getByRole("textbox", { name: "Session name" }).fill("Club night");
    for (const name of ["Amy", "Ben", "Cat", "Dan"]) {
      await page.getByRole("checkbox", { name, exact: true }).check();
    }
    await startButton(page).click();
    await expect(page).toHaveURL(/\/sessions\/(?!new$)[^/]+$/);
    await expect(page.getByRole("heading", { level: 1, name: "Club night" })).toBeVisible();
    expect((await readStoredData<Session>(page, "session"))!.clubId).toBe(club.id);
  });

  test("Back returns to the Club screen", async ({ page }) => {
    const club = friday();
    await seedStorage(page, { clubs: [club] });
    await page.goto(`/clubs/${club.id}`);
    await page.getByRole("link", { name: "New session" }).click();
    await expect(page.getByRole("textbox", { name: "Club" })).toHaveValue("Friday Club");

    await page.getByRole("button", { name: "Back" }).click();
    await expect(page).toHaveURL(new RegExp(`/clubs/${club.id}$`));
    await expect(page.getByRole("heading", { level: 1, name: "Edit club" })).toBeVisible();
  });

  test("starting still asks to replace another Club's Active session", async ({ page }) => {
    const club = friday();
    const old = makeSession({ name: "Old night", clubId: "someone-else" });
    await seedStorage(page, { clubs: [club], session: old });
    await page.goto(`/clubs/${club.id}`);
    await expect(page.getByRole("link", { name: "New session" })).toHaveAccessibleDescription(
      "Replaces the current session",
    );
    await page.getByRole("link", { name: "New session" }).click();
    for (const name of ["Amy", "Ben", "Cat", "Dan"]) {
      await page.getByRole("checkbox", { name, exact: true }).check();
    }
    await startButton(page).click();
    await page
      .getByRole("dialog", { name: "End the current session 'Old night'?" })
      .getByRole("button", { name: "Discard and start" })
      .click();
    await expect(page).toHaveURL(/\/sessions\/(?!new$)[^/]+$/);
    const stored = (await readStoredData<Session>(page, "session"))!;
    expect(stored.id).not.toBe(old.id);
    expect(stored.clubId).toBe(club.id);
  });

  test("an unknown Club in the URL gives the normal screen", async ({ page }) => {
    await seedStorage(page, { clubs: [friday()] });
    await page.goto("/sessions/new?club=nope");
    await expect(page.getByRole("combobox", { name: "Club" })).toBeEnabled();
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});
