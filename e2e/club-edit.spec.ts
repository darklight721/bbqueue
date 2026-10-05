import { expect, test, type Page } from "@playwright/test";
import {
  makeClub,
  makeClubPlayer,
  makeEndedSession,
  makeSession,
  readStored,
  seedStorage,
} from "./fixtures.ts";

const playerNames = (page: Page) => page.getByRole("textbox", { name: "Player name" });
const clubNameField = (page: Page) => page.getByRole("textbox", { name: "Club name" });

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

test.describe("New club", () => {
  test("creates a club with 3 players of different skill levels", async ({ page }) => {
    await page.goto("/clubs/new");
    await expect(page.getByRole("heading", { level: 1, name: "New club" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete club" })).toHaveCount(0);

    await clubNameField(page).fill("Tuesday Crew");
    await addPlayer(page, 0, "Zed", "Advanced");
    await addPlayer(page, 1, "Amy", "Beginner");
    await addPlayer(page, 2, "Mo"); // default skill
    await expect(page.getByRole("combobox", { name: "Skill level for Mo" })).toHaveValue(
      "intermediate",
    );
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page).toHaveURL(/\/clubs$/);
    const row = page.getByRole("link", { name: "Tuesday Crew", exact: true });
    await expect(row).toHaveAccessibleDescription("3 players This device only");

    // Reopen: sorted alphabetically, skills preserved.
    await row.click();
    await expect(page.getByRole("heading", { level: 1, name: "Edit club" })).toBeVisible();
    await expect(clubNameField(page)).toHaveValue("Tuesday Crew");
    await expectRows(page, [
      ["Amy", "beginner"],
      ["Mo", "intermediate"],
      ["Zed", "advanced"],
    ]);
  });

  test("Enter in a player name adds the next player: empty, focused row; Enter on an empty name does nothing", async ({
    page,
  }) => {
    await page.goto("/clubs/new");
    await clubNameField(page).fill("Keyboard Club");
    await page.getByRole("button", { name: "Add player" }).click();
    await expect(playerNames(page).nth(0)).toBeFocused();

    await playerNames(page).nth(0).fill("Ann");
    await playerNames(page).nth(0).press("Enter");
    await expect(playerNames(page)).toHaveCount(2);
    await expect(playerNames(page).nth(1)).toBeFocused();
    await expect(playerNames(page).nth(1)).toHaveValue("");

    // An empty name doesn't add another row.
    await playerNames(page).nth(1).press("Enter");
    await expect(playerNames(page)).toHaveCount(2);

    await playerNames(page).nth(1).pressSequentially("Bo");
    await playerNames(page).nth(1).press("Enter");
    await expect(playerNames(page)).toHaveCount(3);
    await expect(playerNames(page).nth(2)).toBeFocused();
    await expect(playerNames(page).nth(2)).toHaveValue("");

    // Enter in a row that isn't the last one moves to the next row without adding.
    await playerNames(page).nth(0).focus();
    await playerNames(page).nth(0).press("Enter");
    await expect(playerNames(page)).toHaveCount(3);
    await expect(playerNames(page).nth(1)).toBeFocused();

    // Enter in a name doesn't save the club.
    await expect(page).toHaveURL(/\/clubs\/new$/);
    expect(await readStored(page, "clubs")).toBeNull();
  });

  test("Enter in a player name of an existing club appends a row", async ({ page }) => {
    const club = seedClub();
    await seedStorage(page, { clubs: [club] });
    await page.goto(`/clubs/${club.id}`);
    await expect(playerNames(page)).toHaveCount(3);

    await playerNames(page).nth(2).press("Enter");
    await expect(playerNames(page)).toHaveCount(4);
    await expect(playerNames(page).nth(3)).toBeFocused();
    await expect(playerNames(page).nth(3)).toHaveValue("");
  });

  test("a club with zero players can be saved", async ({ page }) => {
    await page.goto("/clubs");
    await page.getByRole("link", { name: "Add club" }).click();
    await clubNameField(page).fill("Solo");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/clubs$/);
    await expect(page.getByRole("link", { name: "Solo", exact: true })).toHaveAccessibleDescription(
      "No players This device only",
    );
  });
});

test.describe("Edit club", () => {
  test("shows players sorted; rename, change skill, remove, add → Save → reopen reflects", async ({
    page,
  }) => {
    const club = seedClub();
    await seedStorage(page, { clubs: [club] });
    await page.goto(`/clubs/${club.id}`);

    await expect(clubNameField(page)).toHaveValue("Friday Club");
    await expectRows(page, [
      ["alice", "beginner"],
      ["Mike", "intermediate"],
      ["Zoe", "advanced"],
    ]);

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

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/clubs$/);
    const row = page.getByRole("link", { name: "Friday Club", exact: true });
    await expect(row).toHaveAccessibleDescription("3 players This device only");

    await row.click();
    await expectRows(page, [
      ["Bob", "beginner"],
      ["Carl", "intermediate"],
      ["Mike", "advanced"],
    ]);
  });

  test("can rename the club to a different-cased version of its own name", async ({ page }) => {
    const club = seedClub();
    await seedStorage(page, { clubs: [club] });
    await page.goto(`/clubs/${club.id}`);
    await clubNameField(page).fill("friday club");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/clubs$/);
    await expect(page.getByRole("link", { name: "friday club", exact: true })).toBeVisible();
  });
});

test.describe("Validation", () => {
  test("empty club name blocks Save", async ({ page }) => {
    await page.goto("/clubs/new");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/clubs\/new$/);
    await expect(page.getByText("Enter a name")).toBeVisible();
    await expect(page.getByRole("alert")).toHaveText("Fix the highlighted fields to save.");
    await expect(clubNameField(page)).toHaveAttribute("aria-invalid", "true");
    expect(await readStored(page, "clubs")).toBeNull();
  });

  test("a club name longer than 40 characters blocks Save", async ({ page }) => {
    await page.goto("/clubs/new");
    await clubNameField(page).fill("x".repeat(41));
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/clubs\/new$/);
    await expect(page.getByText("Name is too long (at most 40 characters)")).toBeVisible();
    await expect(clubNameField(page)).toHaveAttribute("aria-invalid", "true");
    expect(await readStored(page, "clubs")).toBeNull();
  });

  test("duplicate club name (case-insensitive) blocks Save", async ({ page }) => {
    await seedStorage(page, { clubs: [makeClub({ name: "Friday Club" })] });
    await page.goto("/clubs/new");
    await clubNameField(page).fill("  friday CLUB ");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/clubs\/new$/);
    await expect(page.getByText("Club name already used")).toBeVisible();
    await expect(page.getByRole("alert")).toBeVisible();
  });

  test("empty player name blocks Save", async ({ page }) => {
    await page.goto("/clubs/new");
    await clubNameField(page).fill("Valid Club");
    await page.getByRole("button", { name: "Add player" }).click();
    await expect(playerNames(page)).toHaveCount(1);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/clubs\/new$/);
    await expect(page.getByText("Enter a name")).toBeVisible();
    await expect(playerNames(page).first()).toHaveAttribute("aria-invalid", "true");
    expect(await readStored(page, "clubs")).toBeNull();
  });

  test("duplicate player name (case-insensitive) blocks Save", async ({ page }) => {
    await page.goto("/clubs/new");
    await clubNameField(page).fill("Valid Club");
    await addPlayer(page, 0, "Sam");
    await addPlayer(page, 1, "sam");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/clubs\/new$/);
    // Both clashing rows are flagged.
    await expect(page.getByText("Name already used")).toHaveCount(2);
    expect(await readStored(page, "clubs")).toBeNull();

    // Fixing the error allows Save.
    await playerNames(page).nth(1).fill("Sally");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/clubs$/);
  });
});

test.describe("Delete club", () => {
  test("Cancel keeps the club; confirming removes it", async ({ page }) => {
    const club = seedClub();
    await seedStorage(page, { clubs: [club] });
    await page.goto(`/clubs/${club.id}`);

    await page.getByRole("button", { name: "Delete club" }).click();
    const dialog = page.getByRole("dialog", { name: "Delete Friday Club?" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleDescription("This can't be undone.");

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`/clubs/${club.id}$`));
    expect(await readStored(page, "clubs")).not.toBeNull();

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

test.describe("Back", () => {
  test("with no changes leaves immediately", async ({ page }) => {
    const club = seedClub();
    await seedStorage(page, { clubs: [club] });
    await page.goto("/clubs");
    await page.getByRole("link", { name: "Friday Club", exact: true }).click();
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page).toHaveURL(/\/clubs$/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("with changes asks; Keep editing keeps edits, Discard leaves without saving", async ({
    page,
  }) => {
    const club = seedClub();
    await seedStorage(page, { clubs: [club] });
    await page.goto("/clubs");
    await page.getByRole("link", { name: "Friday Club", exact: true }).click();

    await clubNameField(page).fill("Renamed Club");
    await page.getByRole("button", { name: "Back" }).click();

    const dialog = page.getByRole("dialog", { name: "Discard changes?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Keep editing" }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`/clubs/${club.id}$`));
    await expect(clubNameField(page)).toHaveValue("Renamed Club");

    await page.getByRole("button", { name: "Back" }).click();
    await page
      .getByRole("dialog", { name: "Discard changes?" })
      .getByRole("button", { name: "Discard" })
      .click();
    await expect(page).toHaveURL(/\/clubs$/);
    await expect(page.getByRole("link", { name: "Friday Club", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Renamed Club" })).toHaveCount(0);
  });

  test("on a new club with edits asks before leaving", async ({ page }) => {
    await page.goto("/clubs/new");
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page).toHaveURL(/\/clubs$/); // pristine form: no prompt

    await page.getByRole("link", { name: "Add club" }).click();
    await clubNameField(page).fill("Draft");
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByRole("dialog", { name: "Discard changes?" })).toBeVisible();
  });
});

test("unknown club id redirects to /clubs", async ({ page }) => {
  await page.goto("/clubs/does-not-exist");
  await expect(page).toHaveURL(/\/clubs$/);
  await expect(page.getByRole("heading", { level: 1, name: "Clubs" })).toBeVisible();
});

test.describe("Session link", () => {
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
    await seedStorage(page, { clubs: [club], endedSessions: [ended] });
    await page.goto(`/clubs/${club.id}`);

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
    const club = seedClub();
    await seedStorage(page, { clubs: [club] });
    await page.goto(`/clubs/${club.id}`);

    const card = (await page.getByRole("link", { name: "New session" }).boundingBox())!;
    const nameField = (await clubNameField(page).boundingBox())!;
    expect(Math.abs(card.width - nameField.width)).toBeLessThan(1);
  });

  test("New club has no session link", async ({ page }) => {
    await page.goto("/clubs/new");
    await expect(page.getByRole("heading", { level: 1, name: "New club" })).toBeVisible();
    await expect(page.getByRole("link", { name: "New session" })).toHaveCount(0);
  });
});
