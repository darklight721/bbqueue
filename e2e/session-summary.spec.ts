import { expect, test, type Page } from "@playwright/test";
import type { Club, SessionSummary } from "../src/domain/types.ts";
import { makeSummary, makeTopWinner, readStored, readStoredData, seedStorage } from "./fixtures.ts";
import { court, lineupOf, openScoreDialog, storedSession } from "./session-helpers.ts";

const stat = (page: Page, label: RegExp) =>
  page
    .locator("dl > div")
    .filter({ has: page.getByRole("term").filter({ hasText: label }) })
    .locator("dd");

const winnerRows = (page: Page) => page.getByRole("list").getByRole("listitem");

async function openSummary(page: Page, summary: SessionSummary = makeSummary()) {
  await seedStorage(page, { summary });
  await page.goto("/session/summary");
  await expect(page.getByRole("heading", { level: 1, name: "Session summary" })).toBeVisible();
}

test.describe("Totals", () => {
  test("shows the session name, date line and totals", async ({ page }) => {
    await openSummary(
      page,
      makeSummary({ sessionName: "Friday smash", totalMatches: 7, totalPlayers: 10 }),
    );

    // The name is upper-cased by CSS only; the text keeps its case.
    await expect(page.getByText("Friday smash", { exact: true })).toBeVisible();
    await expect(page.getByText(/ · .+–.+/)).toBeVisible(); // "Fri, 2 Oct · 18:00–20:15" (locale-dependent)
    await expect(stat(page, /^Matches played$/)).toHaveText("7");
    await expect(stat(page, /^Players$/)).toHaveText("10");
    await expect(page.getByRole("link", { name: "Home" })).toBeVisible();
  });

  const HOUR = 3_600_000;
  const MINUTE = 60_000;
  const durations: [string, number, string][] = [
    ["hours and minutes", 2 * HOUR + 15 * MINUTE, "2 h 15 min"],
    ["minutes only", 45 * MINUTE, "45 min"],
    ["whole hours", HOUR, "1 h"],
    ["under a minute", 30_000, "Under 1 min"],
  ];
  for (const [label, ms, expected] of durations) {
    test(`duration: ${label} → ${expected}`, async ({ page }) => {
      const startedAt = 1_760_000_000_000;
      await openSummary(page, makeSummary({ startedAt, endedAt: startedAt + ms }));
      await expect(stat(page, /^Duration$/)).toHaveText(expected);
    });
  }
});

test.describe("Top winners", () => {
  test("lists places with name, matches played and wins", async ({ page }) => {
    await openSummary(
      page,
      makeSummary({
        topWinners: [
          makeTopWinner({ place: 1, name: "Ana", skill: "advanced", wins: 4, played: 5 }),
          makeTopWinner({ place: 2, name: "Ben", wins: 1, played: 1 }),
          makeTopWinner({ place: 3, name: "Cat", wins: 1, played: 2 }),
        ],
      }),
    );
    await expect(page.getByRole("heading", { level: 2, name: "Top winners" })).toBeVisible();
    await expect(page.getByText("No scored matches")).toHaveCount(0);

    const rows = winnerRows(page);
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText("1st");
    await expect(rows.nth(0)).toContainText("Ana");
    await expect(rows.nth(0)).toContainText("5 matches played");
    await expect(rows.nth(0).getByText("4", { exact: true })).toBeVisible();
    await expect(rows.nth(0).getByText("wins", { exact: true })).toBeVisible();

    await expect(rows.nth(1)).toContainText("2nd");
    await expect(rows.nth(1)).toContainText("1 match played");
    await expect(rows.nth(1).getByText("win", { exact: true })).toBeVisible();
    await expect(rows.nth(2)).toContainText("3rd");
    await expect(rows.nth(2)).toContainText("2 matches played");
    for (const row of [rows.nth(0), rows.nth(1), rows.nth(2)]) {
      await expect(row).not.toContainText("Joint");
    }
  });

  test("tied places are shown as Joint: 1, 1, 3", async ({ page }) => {
    await openSummary(
      page,
      makeSummary({
        topWinners: [
          makeTopWinner({ place: 1, name: "Ana", wins: 2, played: 2 }),
          makeTopWinner({ place: 1, name: "Ben", wins: 2, played: 2 }),
          makeTopWinner({ place: 3, name: "Gus", wins: 1, played: 1 }),
        ],
      }),
    );
    const rows = winnerRows(page);
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText("Joint 1st");
    await expect(rows.nth(0)).toContainText("Ana");
    await expect(rows.nth(1)).toContainText("Joint 1st");
    await expect(rows.nth(1)).toContainText("Ben");
    await expect(rows.nth(2)).toContainText("3rd");
    await expect(rows.nth(2)).not.toContainText("Joint");
    await expect(rows.nth(2)).toContainText("Gus");
  });

  test("a tie for 3rd shows more than three rows", async ({ page }) => {
    await openSummary(
      page,
      makeSummary({
        topWinners: [
          makeTopWinner({ place: 1, name: "Ana", wins: 3, played: 3 }),
          makeTopWinner({ place: 2, name: "Ben", wins: 2, played: 2 }),
          makeTopWinner({ place: 3, name: "Cat", wins: 1, played: 1 }),
          makeTopWinner({ place: 3, name: "Dan", wins: 1, played: 1 }),
        ],
      }),
    );
    const rows = winnerRows(page);
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(0)).not.toContainText("Joint");
    await expect(rows.nth(1)).not.toContainText("Joint");
    await expect(rows.nth(2)).toContainText("Joint 3rd");
    await expect(rows.nth(3)).toContainText("Joint 3rd");
  });

  test("no winners → 'No scored matches'", async ({ page }) => {
    await openSummary(page, makeSummary({ topWinners: [], totalMatches: 2, totalPlayers: 8 }));
    await expect(page.getByText("No scored matches")).toBeVisible();
    await expect(page.getByRole("list")).toHaveCount(0);
    await expect(stat(page, /^Matches played$/)).toHaveText("2");
  });
});

test.describe("Persistence and navigation", () => {
  test("a reload keeps the summary", async ({ page }) => {
    await openSummary(
      page,
      makeSummary({
        sessionName: "Reload night",
        totalMatches: 3,
        topWinners: [makeTopWinner({ name: "Ana" })],
      }),
    );
    await page.reload();
    await expect(page).toHaveURL(/\/session\/summary$/);
    await expect(page.getByText("Reload night", { exact: true })).toBeVisible();
    await expect(stat(page, /^Matches played$/)).toHaveText("3");
    await expect(winnerRows(page)).toHaveCount(1);
  });

  test("Home goes to / and clears the summary; revisiting redirects Home", async ({ page }) => {
    await openSummary(page);
    expect(await readStored(page, "summary")).not.toBeNull();

    await page.getByRole("link", { name: "Home" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: "Badminton Queue" })).toBeVisible();
    await expect.poll(() => readStored(page, "summary")).toBeNull();

    await page.goto("/session/summary");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: "Badminton Queue" })).toBeVisible();
  });

  test("with no stored summary /session/summary redirects Home", async ({ page }) => {
    await page.goto("/session/summary");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("link", { name: "New session" })).toBeVisible();
  });
});

test.describe("Full journey", () => {
  test("club → new session → play two matches → end session → summary", async ({ page }) => {
    const names = ["Ana", "Ben", "Cat", "Dan", "Eve", "Fay", "Gus", "Hal"];

    // 1. Create a Club with 8 players.
    await page.goto("/clubs/new");
    await page.getByRole("textbox", { name: "Club name" }).fill("Journey Club");
    for (const [index, name] of names.entries()) {
      await page.getByRole("button", { name: "Add player" }).click();
      const field = page.getByRole("textbox", { name: "Player name" }).nth(index);
      await expect(field).toBeFocused();
      await field.fill(name);
    }
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/clubs$/);
    await expect(
      page.getByRole("link", { name: "Journey Club", exact: true }),
    ).toHaveAccessibleDescription("8 players");
    const clubs = await readStoredData<Club[]>(page, "clubs");
    expect(clubs![0]!.players).toHaveLength(8);

    // 2. New session: the only Club is preselected; tick everyone; 2 courts.
    await page.goto("/session/new");
    await page.getByRole("textbox", { name: "Session name" }).fill("Journey night");
    await page.getByRole("button", { name: "Select all" }).click();
    await expect(page.getByText("8 players selected")).toBeVisible();
    await page.getByRole("button", { name: "Increase Courts" }).click();
    await expect(page.getByRole("spinbutton", { name: "Courts" })).toHaveValue("2");
    await page.getByRole("button", { name: "Start session" }).click();
    await expect(page).toHaveURL(/\/session$/);
    await expect(page.getByRole("heading", { level: 1, name: "Journey night" })).toBeVisible();
    expect((await storedSession(page)).clubId).toBe(clubs![0]!.id);

    // 3. Start both matches; end one with a score, the other without.
    const one = await lineupOf(court(page, 1));
    await court(page, 1).getByRole("button", { name: "Start match" }).click();
    await court(page, 2).getByRole("button", { name: "Start match" }).click();
    await expect(court(page, 2).getByText("Playing", { exact: true })).toBeVisible();

    let dialog = await openScoreDialog(page, 1);
    await dialog.getByRole("textbox", { name: one.a.join(" & "), exact: true }).fill("21");
    await dialog.getByRole("textbox", { name: one.b.join(" & "), exact: true }).fill("15");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();

    dialog = await openScoreDialog(page, 2);
    await dialog.getByRole("button", { name: "End without score" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("region", { name: "History" }).getByText("2 matches"),
    ).toBeVisible();

    // 4. End the session (no matches in progress: courts hold Lineups only).
    await page
      .getByRole("region", { name: "End session" })
      .getByRole("button", { name: "End session" })
      .click();
    const confirm = page.getByRole("dialog", { name: "End session?" });
    await expect(confirm).toHaveAccessibleDescription("");
    await confirm.getByRole("button", { name: "End session" }).click();
    await expect(page).toHaveURL(/\/session\/summary$/);

    // 5. Summary.
    await expect(page.getByRole("heading", { level: 1, name: "Session summary" })).toBeVisible();
    await expect(page.getByText("Journey night", { exact: true })).toBeVisible();
    await expect(stat(page, /^Matches played$/)).toHaveText("2");
    await expect(stat(page, /^Players$/)).toHaveText("8");
    await expect(stat(page, /^Duration$/)).toHaveText(/^(Under 1 min|\d+ min|\d+ h( \d+ min)?)$/);

    // The winning pair (Team A, 21–15) share 1st: one scored match each.
    const rows = winnerRows(page);
    await expect(rows).toHaveCount(2);
    for (const index of [0, 1]) {
      await expect(rows.nth(index)).toContainText("Joint 1st");
      await expect(rows.nth(index)).toContainText("1 match played");
      await expect(rows.nth(index).getByText("win", { exact: true })).toBeVisible();
    }
    const shown = (await rows.allInnerTexts()).join("\n");
    for (const name of one.a) expect(shown).toContain(name);
    for (const name of one.b) expect(shown).not.toContain(name);

    // The session is gone, the summary is stored.
    expect(await readStored(page, "session")).toBeNull();
    expect((await readStoredData<SessionSummary>(page, "summary"))!.totalMatches).toBe(2);
  });
});
