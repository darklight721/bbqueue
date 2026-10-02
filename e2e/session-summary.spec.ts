import { expect, test, type Page } from "@playwright/test";
import type { Club, EndedSession } from "../src/domain/types.ts";
import {
  makeEndedSession,
  makeEndedSessionFromMatches,
  readStored,
  readStoredData,
  seedStorage,
} from "./fixtures.ts";
import { court, lineupOf, openScoreDialog, storedSession } from "./session-helpers.ts";

const stat = (page: Page, label: RegExp) =>
  page
    .locator("dl > div")
    .filter({ has: page.getByRole("term").filter({ hasText: label }) })
    .locator("dd");

const winnerRows = (page: Page) => page.getByRole("list").getByRole("listitem");

async function openSummary(page: Page, ended: EndedSession = makeEndedSession()) {
  await seedStorage(page, { endedSessions: [ended] });
  await page.goto(`/sessions/${ended.id}/summary`);
  await expect(page.getByRole("heading", { level: 1, name: "Session summary" })).toBeVisible();
}

const win = (a: [string, string], b: [string, string], score: [number, number] = [21, 10]) => ({
  a,
  b,
  score,
});

test.describe("Totals", () => {
  test("shows the session name, date line and totals", async ({ page }) => {
    const names = ["Ana", "Ben", "Cat", "Dan", "Eve", "Fay", "Gus", "Hal", "Ivy", "Jon"];
    const ended = makeEndedSessionFromMatches(
      Array.from({ length: 7 }, () => ({ a: ["Ana", "Ben"], b: ["Cat", "Dan"], score: null })),
      { name: "Friday smash" },
    );
    ended.players = names.map((name) => ({ id: name, name, skill: "intermediate" }));
    await openSummary(page, ended);

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
      await openSummary(page, makeEndedSession({ startedAt, endedAt: startedAt + ms }));
      await expect(stat(page, /^Duration$/)).toHaveText(expected);
    });
  }
});

test.describe("Top winners", () => {
  test("lists places with name, matches played and wins", async ({ page }) => {
    // Ana 2-0 in 2, Eve 1-0 in 1, Ben 1-1 in 2.
    await openSummary(
      page,
      makeEndedSessionFromMatches(
        [
          win(["Ana", "Ben"], ["Cat", "Dan"], [21, 10]),
          win(["Ana", "Eve"], ["Ben", "Fay"], [21, 15]),
        ],
        { skills: { Ana: "advanced" } },
      ),
    );
    await expect(page.getByRole("heading", { level: 2, name: "Top winners" })).toBeVisible();
    await expect(page.getByText("No scored matches")).toHaveCount(0);

    const rows = winnerRows(page);
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText("1st");
    await expect(rows.nth(0)).toContainText("Ana");
    await expect(rows.nth(0)).toContainText("2 matches played");
    await expect(rows.nth(0).getByText("2", { exact: true })).toBeVisible();
    await expect(rows.nth(0).getByText("wins", { exact: true })).toBeVisible();

    await expect(rows.nth(1)).toContainText("2nd");
    await expect(rows.nth(1)).toContainText("Eve");
    await expect(rows.nth(1)).toContainText("1 match played");
    await expect(rows.nth(1).getByText("win", { exact: true })).toBeVisible();
    await expect(rows.nth(2)).toContainText("3rd");
    await expect(rows.nth(2)).toContainText("Ben");
    await expect(rows.nth(2)).toContainText("2 matches played");
    for (const row of [rows.nth(0), rows.nth(1), rows.nth(2)]) {
      await expect(row).not.toContainText("Joint");
    }
  });

  test("tied places are shown as Joint: 1, 1, 3", async ({ page }) => {
    await openSummary(
      page,
      makeEndedSessionFromMatches([
        win(["Ana", "Ben"], ["Cat", "Dan"]),
        win(["Ana", "Ben"], ["Eve", "Fay"]),
        win(["Gus", "Hal"], ["Cat", "Eve"]),
      ]),
    );
    const rows = winnerRows(page);
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(0)).toContainText("Joint 1st");
    await expect(rows.nth(0)).toContainText("Ana");
    await expect(rows.nth(1)).toContainText("Joint 1st");
    await expect(rows.nth(1)).toContainText("Ben");
    await expect(rows.nth(2)).toContainText("Joint 3rd");
    await expect(rows.nth(3)).toContainText("Joint 3rd");
  });

  test("fewer losses rank before more matches played; a tie for 3rd shows more than three rows", async ({
    page,
  }) => {
    // Ana 4-0; Cat 2-1; Eve, Fay, Gus 1-1 in 2 matches share 3rd; Ben 1-2 is 6th and not shown.
    await openSummary(
      page,
      makeEndedSessionFromMatches([
        win(["Ana", "Ben"], ["Cat", "Dan"]),
        win(["Ana", "Cat"], ["Ben", "Eve"]),
        win(["Ana", "Eve"], ["Ben", "Fay"]),
        win(["Ana", "Fay"], ["Gus", "Hal"]),
        win(["Cat", "Gus"], ["Dan", "Hal"]),
      ]),
    );
    const rows = winnerRows(page);
    await expect(rows).toHaveCount(5);
    await expect(rows.nth(0)).toContainText("Ana");
    await expect(rows.nth(0)).not.toContainText("Joint");
    await expect(rows.nth(1)).toContainText("Cat");
    await expect(rows.nth(1)).not.toContainText("Joint");
    for (const index of [2, 3, 4]) await expect(rows.nth(index)).toContainText("Joint 3rd");
    await expect(page.getByText("Ben")).toHaveCount(0);
  });

  test("no winners → 'No scored matches'", async ({ page }) => {
    await openSummary(
      page,
      makeEndedSessionFromMatches([
        { a: ["Ana", "Ben"], b: ["Cat", "Dan"], score: null },
        { a: ["Eve", "Fay"], b: ["Gus", "Hal"], score: null },
      ]),
    );
    await expect(page.getByText("No scored matches")).toBeVisible();
    await expect(page.getByRole("list")).toHaveCount(0);
    await expect(stat(page, /^Matches played$/)).toHaveText("2");
    await expect(stat(page, /^Players$/)).toHaveText("8");
  });
});

test.describe("Persistence and navigation", () => {
  test("a reload keeps the summary", async ({ page }) => {
    const ended = makeEndedSessionFromMatches(
      [
        win(["Ana", "Ben"], ["Cat", "Dan"]),
        win(["Ana", "Ben"], ["Eve", "Fay"]),
        win(["Ana", "Ben"], ["Gus", "Hal"]),
      ],
      { name: "Reload night" },
    );
    await openSummary(page, ended);
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`/sessions/${ended.id}/summary$`));
    await expect(page.getByText("Reload night", { exact: true })).toBeVisible();
    await expect(stat(page, /^Matches played$/)).toHaveText("3");
    await expect(winnerRows(page)).toHaveCount(2);
  });

  test("Home goes to / and keeps the Ended session", async ({ page }) => {
    const ended = makeEndedSession();
    await openSummary(page, ended);

    await page.getByRole("link", { name: "Home" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: "Badminton Queue" })).toBeVisible();
    expect(await readStored(page, "endedSessions")).not.toBeNull();

    await page.goto(`/sessions/${ended.id}/summary`);
    await expect(page.getByRole("heading", { level: 1, name: "Session summary" })).toBeVisible();
  });

  test("an unknown id redirects to the past sessions list", async ({ page }) => {
    await page.goto("/sessions/xyz/summary");
    await expect(page).toHaveURL(/\/sessions$/);
    await expect(page.getByRole("heading", { level: 1, name: "Past sessions" })).toBeVisible();
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
    await page.goto("/sessions/new");
    await page.getByRole("textbox", { name: "Session name" }).fill("Journey night");
    await page.getByRole("button", { name: "Select all" }).click();
    await expect(page.getByText("8 players selected")).toBeVisible();
    await page.getByRole("button", { name: "Increase Courts" }).click();
    await expect(page.getByRole("spinbutton", { name: "Courts" })).toHaveValue("2");
    await page.getByRole("button", { name: "Start session" }).click();
    await expect(page).toHaveURL(/\/sessions\/(?!new$)[^/]+$/);
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
    const sessionId = (await storedSession(page)).id;
    await confirm.getByRole("button", { name: "End session" }).click();
    await expect(page).toHaveURL(new RegExp(`/sessions/${sessionId}/summary$`));

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

    // The session is gone, the Ended session is stored.
    expect(await readStored(page, "session")).toBeNull();
    const stored = (await readStoredData<EndedSession[]>(page, "endedSessions"))!;
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ id: sessionId, name: "Journey night" });
    expect(stored[0]!.matches).toHaveLength(2);

    // 6. A reload keeps the summary and the Ended session.
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Session summary" })).toBeVisible();

    // 7. Home now offers Past sessions; the list shows the Ended session.
    await page.getByRole("link", { name: "Home" }).click();
    const past = page.getByRole("link", { name: "Past sessions" });
    await expect(past).toHaveAccessibleDescription("1 session");
    await past.click();
    await expect(page).toHaveURL(/\/sessions$/);
    const row = page.getByRole("link", { name: "Journey night" });
    await expect(row).toHaveAttribute("href", `/sessions/${sessionId}`);
    await expect(row).toContainText("2 matches · 8 players");
    await expect(row).toHaveAccessibleDescription(/ · .+–.+ 2 matches · 8 players$/);

    // 8. The details: when, totals, Top winners and the matches oldest first.
    await row.click();
    await expect(page).toHaveURL(new RegExp(`/sessions/${sessionId}$`));
    await expect(page.getByRole("heading", { level: 1, name: "Journey night" })).toBeVisible();
    await expect(page.getByText("Ended session", { exact: true })).toBeVisible();
    await expect(page.getByText(/^.+–.+$/).first()).toBeVisible(); // "18:00–20:15"
    await expect(stat(page, /^Matches played$/)).toHaveText("2");
    await expect(stat(page, /^Players$/)).toHaveText("8");
    const detailWinners = page.getByRole("region", { name: "Top winners" }).getByRole("listitem");
    await expect(detailWinners).toHaveCount(2);
    await expect(detailWinners.nth(0)).toContainText("Joint 1st");

    const matches = page.getByRole("list", { name: "Matches" }).getByRole("listitem");
    await expect(matches).toHaveCount(2);
    await expect(matches.nth(0)).toContainText("Match #1 · Court 1");
    await expect(matches.nth(0).getByText("Won, 21")).toBeVisible();
    await expect(matches.nth(0).getByText("15", { exact: true })).toBeVisible();
    await expect(matches.nth(0)).not.toContainText("No score");
    for (const name of [...one.a, ...one.b]) await expect(matches.nth(0)).toContainText(name);
    await expect(matches.nth(1)).toContainText("Match #2 · Court 2");
    await expect(matches.nth(1)).toContainText("No score");
    await expect(page.getByText(/\d+ pts/)).toHaveCount(0);
    await expect(page.getByRole("link", { name: /summary/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /delete/i })).toHaveCount(0);

    // 9. A reload keeps the details; Back goes to the list.
    await page.reload();
    await expect(page.getByRole("list", { name: "Matches" }).getByRole("listitem")).toHaveCount(2);
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page).toHaveURL(/\/sessions$/);
    await expect(page.getByRole("heading", { level: 1, name: "Past sessions" })).toBeVisible();
  });
});
