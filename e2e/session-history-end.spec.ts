import { expect, test, type Page } from "@playwright/test";
import type { EndedSession, Match, Session } from "../src/domain/types.ts";
import {
  makeCourt,
  makeSession,
  makeSessionPlayer,
  readStored,
  readStoredData,
  seedStorage,
} from "./fixtures.ts";
import {
  court,
  lineupOf,
  openScoreDialog,
  startSession,
  storedSession,
} from "./session-helpers.ts";

const NAMES = ["Ana", "Ben", "Cat", "Dan", "Eve", "Fay", "Gus", "Hal", "Ivy", "Jon"];

type Pair = [string, string];
interface PlayedMatch {
  a: Pair;
  b: Pair;
  /** null = ended without a score. */
  score: [number, number] | null;
  court?: number;
  seconds?: number;
}
interface Scenario {
  matches?: PlayedMatch[];
  /** A match still in progress (on Court 1 unless `court` is given). */
  active?: { a: Pair; b: Pair; court?: number };
  removed?: string[];
  names?: string[];
}

/** Session with ended matches (numbered in order) and optionally one Active match. */
function build({ matches = [], active, removed = [], names = NAMES }: Scenario = {}): Session {
  const players = names.map((name) => makeSessionPlayer({ name, removed: removed.includes(name) }));
  const id = (name: string) => players.find((player) => player.name === name)!.id;
  const team = (pair: Pair): [string, string] => [id(pair[0]), id(pair[1])];

  let clock = Date.now() - 3 * 3_600_000;
  const list: Match[] = matches.map((played, index) => {
    const startedAt = clock;
    const endedAt = startedAt + (played.seconds ?? 600) * 1000;
    clock = endedAt + 60_000;
    return {
      id: `ended-${index + 1}`,
      number: index + 1,
      courtNumber: played.court ?? 1,
      teams: [team(played.a), team(played.b)],
      freeAtStart: [],
      startedAt,
      target: 21,
      endedAt,
      score: played.score,
      status: "ended",
    };
  });

  const courts = [makeCourt(1), makeCourt(2)];
  if (active) {
    const courtNumber = active.court ?? 1;
    const match: Match = {
      id: "active-1",
      number: null,
      courtNumber,
      teams: [team(active.a), team(active.b)],
      freeAtStart: [],
      startedAt: Date.now() - 120_000,
      target: 21,
      endedAt: null,
      score: null,
      status: "active",
    };
    list.push(match);
    courts.find((candidate) => candidate.number === courtNumber)!.activeMatchId = match.id;
  }

  return makeSession({ name: "History night", players, matches: list, courts });
}

/** Match #1 on Court 1: 21–15 in 12:34. Match #2 on Court 2: no score, 08:05. */
const TWO_MATCHES: Scenario = {
  matches: [
    { a: ["Ana", "Ben"], b: ["Cat", "Dan"], score: [21, 15], court: 1, seconds: 754 },
    { a: ["Eve", "Fay"], b: ["Gus", "Hal"], score: null, court: 2, seconds: 485 },
  ],
};

async function openSeeded(page: Page, scenario: Scenario = {}) {
  const session = build(scenario);
  await seedStorage(page, { session });
  await page.goto(`/sessions/${session.id}`);
  await expect(historyRegion(page)).toBeVisible();
  return session;
}

const historyRegion = (page: Page) => page.getByRole("region", { name: "History", exact: true });
const historyList = (page: Page) => page.getByRole("list", { name: "Match history" });
const showHistory = (page: Page) =>
  historyRegion(page).getByRole("button", { name: "Show history" });

async function endSessionViaDialog(page: Page) {
  await page
    .getByRole("region", { name: "End session" })
    .getByRole("button", { name: "End session" })
    .click();
  const dialog = page.getByRole("dialog", { name: "End session?" });
  await expect(dialog).toBeVisible();
  return dialog;
}

const confirmEnd = async (page: Page) => {
  const dialog = await endSessionViaDialog(page);
  await dialog.getByRole("button", { name: "End session" }).click();
  await expect(page).toHaveURL(/\/sessions\/[^/]+\/summary$/);
};

const storedEnded = async (page: Page) =>
  (await readStoredData<EndedSession[]>(page, "endedSessions")) ?? [];

test.describe("History", () => {
  test("with no ended matches: empty text and no toggle", async ({ page }) => {
    await openSeeded(page);
    await expect(page.getByRole("heading", { level: 2, name: "History" })).toBeVisible();
    await expect(historyRegion(page).getByText("No matches played yet.")).toBeVisible();
    await expect(historyRegion(page).getByText("0 matches")).toBeVisible();
    await expect(historyRegion(page).getByRole("button")).toHaveCount(0);
    await expect(historyList(page)).toHaveCount(0);
  });

  test("is collapsed by default; Show history lists matches newest first with details", async ({
    page,
  }) => {
    await openSeeded(page, TWO_MATCHES);
    await expect(historyRegion(page).getByText("2 matches")).toBeVisible();

    const toggle = showHistory(page);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(historyList(page)).toHaveCount(0);

    await toggle.click();
    const hide = historyRegion(page).getByRole("button", { name: "Hide history" });
    await expect(hide).toHaveAttribute("aria-expanded", "true");
    const entries = historyList(page).getByRole("listitem");
    await expect(entries).toHaveCount(2);

    // Newest first.
    const [newest, oldest] = [entries.nth(0), entries.nth(1)];
    await expect(newest).toContainText("Match #2 · Court 2");
    await expect(newest).toContainText("No score");
    await expect(newest).toContainText("08:05");
    for (const name of ["Eve", "Fay", "Gus", "Hal"]) await expect(newest).toContainText(name);
    await expect(newest.getByText("Won, ")).toHaveCount(0);

    await expect(oldest).toContainText("Match #1 · Court 1");
    await expect(oldest).toContainText("12:34");
    await expect(oldest).not.toContainText("No score");
    for (const name of ["Ana", "Ben", "Cat", "Dan"]) await expect(oldest).toContainText(name);
    await expect(oldest.getByText("Won, 21")).toBeVisible();
    await expect(oldest.getByText("15", { exact: true })).toBeVisible();
    await expect(oldest.getByText("Won, ")).toHaveCount(1); // only the winning side

    await hide.click();
    await expect(historyList(page)).toHaveCount(0);
    await expect(showHistory(page)).toHaveAttribute("aria-expanded", "false");
  });

  test("ending a scored and an unscored match through the UI fills History", async ({ page }) => {
    await startSession(page);
    const one = await lineupOf(court(page, 1));
    const two = await lineupOf(court(page, 2));
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

    await expect(historyRegion(page).getByText("2 matches")).toBeVisible();
    await showHistory(page).click();
    const entries = historyList(page).getByRole("listitem");
    await expect(entries).toHaveCount(2);

    await expect(entries.nth(0)).toContainText("Match #2 · Court 2");
    await expect(entries.nth(0)).toContainText("No score");
    for (const name of [...two.a, ...two.b]) await expect(entries.nth(0)).toContainText(name);

    await expect(entries.nth(1)).toContainText("Match #1 · Court 1");
    await expect(entries.nth(1).getByText("Won, 21")).toBeVisible();
    for (const name of [...one.a, ...one.b]) await expect(entries.nth(1)).toContainText(name);
    for (const entry of [entries.nth(0), entries.nth(1)]) {
      await expect(entry).toContainText(/\d\d:\d\d/);
    }
  });

  test("a removed player still appears in History by name", async ({ page }) => {
    await openSeeded(page, { ...TWO_MATCHES, removed: ["Ben"] });
    await expect(
      page.getByRole("region", { name: "Players" }).getByRole("button", { name: "Sit out Ben" }),
    ).toHaveCount(0);

    await showHistory(page).click();
    await expect(historyList(page).getByRole("listitem").nth(1)).toContainText("Ben");
  });
});

test.describe("End session", () => {
  test("with no matches in progress: no warning; Cancel keeps everything", async ({ page }) => {
    const session = await openSeeded(page, TWO_MATCHES);
    const dialog = await endSessionViaDialog(page);
    await expect(dialog).toHaveAccessibleDescription("");
    await expect(dialog.getByText(/in progress/)).toHaveCount(0);

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/sessions\/(?!new$)[^/]+$/);
    expect((await storedSession(page)).id).toBe(session.id);
    expect(await storedEnded(page)).toEqual([]);
  });

  test("confirming lands on /sessions/<id>/summary with a stored Ended session and no session", async ({
    page,
  }) => {
    const session = await openSeeded(page, TWO_MATCHES);
    await confirmEnd(page);
    await expect(page).toHaveURL(new RegExp(`/sessions/${session.id}/summary$`));

    expect(await readStoredData<Session>(page, "session")).toBeNull();
    const [ended, ...rest] = await storedEnded(page);
    expect(rest).toEqual([]);
    expect(ended).toMatchObject({ id: session.id, name: "History night" });
    expect(ended!.matches).toHaveLength(2);
    expect(ended!.players).toHaveLength(8);
    expect(ended!.endedAt).toBeGreaterThanOrEqual(ended!.startedAt);
    // Only the scored match has winners.
    const rows = page.getByRole("region", { name: "Top winners" }).getByRole("listitem");
    await expect(rows).toHaveCount(2);
    const shown = (await rows.allInnerTexts()).join("\n");
    expect(shown).toContain("Ana");
    expect(shown).toContain("Ben");
  });

  test("ending with no ended matches goes Home and keeps nothing", async ({ page }) => {
    await openSeeded(page);
    const dialog = await endSessionViaDialog(page);
    await dialog.getByRole("button", { name: "End session" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: "Badminton Queue" })).toBeVisible();

    expect(await readStoredData<Session>(page, "session")).toBeNull();
    expect(await readStored(page, "endedSessions")).toBeNull();
    await expect(page.getByRole("link", { name: "Resume session" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Past sessions" })).toHaveCount(0);
  });

  test("a match in progress is mentioned, then ended without a score and counted", async ({
    page,
  }) => {
    await openSeeded(page, { ...TWO_MATCHES, active: { a: ["Ivy", "Jon"], b: ["Ana", "Ben"] } });
    await expect(court(page, 1).getByText("Playing", { exact: true })).toBeVisible();

    const dialog = await endSessionViaDialog(page);
    await expect(dialog).toHaveAccessibleDescription(
      "1 match in progress will be ended without a score.",
    );
    await dialog.getByRole("button", { name: "End session" }).click();
    await expect(page).toHaveURL(/\/sessions\/[^/]+\/summary$/);

    expect(await readStoredData<Session>(page, "session")).toBeNull();
    const [ended] = await storedEnded(page);
    expect(ended!.matches).toHaveLength(3);
    expect(ended!.matches.at(-1)!.score).toBeNull();
    expect(ended!.players).toHaveLength(10); // Ivy and Jon only played in the match that was in progress
  });

  test("several matches in progress use the plural", async ({ page }) => {
    const session = build({ active: { a: ["Ana", "Ben"], b: ["Cat", "Dan"], court: 1 } });
    const second: Match = {
      id: "active-2",
      number: null,
      courtNumber: 2,
      teams: [
        [session.players[4]!.id, session.players[5]!.id],
        [session.players[6]!.id, session.players[7]!.id],
      ],
      freeAtStart: [],
      startedAt: Date.now() - 60_000,
      target: 21,
      endedAt: null,
      score: null,
      status: "active",
    };
    session.matches.push(second);
    session.courts[1]!.activeMatchId = second.id;
    await seedStorage(page, { session });
    await page.goto(`/sessions/${session.id}`);

    const dialog = await endSessionViaDialog(page);
    await expect(dialog).toHaveAccessibleDescription(
      "2 matches in progress will be ended without a score.",
    );
    await dialog.getByRole("button", { name: "Cancel" }).click();
  });

  test("top winners share places (1, 1, 3) when wins, losses and games played tie", async ({
    page,
  }) => {
    await openSeeded(page, {
      matches: [
        { a: ["Ana", "Ben"], b: ["Cat", "Dan"], score: [21, 10] },
        { a: ["Ana", "Ben"], b: ["Eve", "Fay"], score: [21, 15] },
        { a: ["Cat", "Gus"], b: ["Eve", "Hal"], score: [21, 19] },
      ],
    });
    await confirmEnd(page);

    const [ended] = await storedEnded(page);
    expect(ended!.matches).toHaveLength(3);
    expect(ended!.players).toHaveLength(8);
    const rows = page.getByRole("region", { name: "Top winners" }).getByRole("listitem");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText("Joint 1st");
    await expect(rows.nth(0)).toContainText("Ana");
    await expect(rows.nth(1)).toContainText("Joint 1st");
    await expect(rows.nth(1)).toContainText("Ben");
    await expect(rows.nth(2)).toContainText("3rd");
    await expect(rows.nth(2)).not.toContainText("Joint");
    await expect(rows.nth(2)).toContainText("Gus");
  });

  test("afterwards Home has no Resume link, and a reload keeps the summary", async ({ page }) => {
    await openSeeded(page, TWO_MATCHES);
    await confirmEnd(page);

    await page.reload();
    await expect(page).toHaveURL(/\/sessions\/[^/]+\/summary$/);
    await expect(page.getByRole("heading", { level: 1, name: "Session summary" })).toBeVisible();
    expect(await storedEnded(page)).toHaveLength(1);
    expect(await readStoredData<Session>(page, "session")).toBeNull();

    await page.goto("/");
    await expect(page.getByRole("link", { name: "New session" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Resume session" })).toHaveCount(0);
  });
});

test.describe("Jump bar", () => {
  test("History is offered last and scrolls to the section", async ({ page }) => {
    await openSeeded(page, TWO_MATCHES);
    const nav = page.getByRole("navigation", { name: "Sections" });
    await expect(nav.getByRole("button").first()).toBeVisible();
    expect(await nav.getByRole("button").allInnerTexts()).toEqual([
      "Courts",
      "Queues",
      "Players",
      "History",
    ]);

    const heading = page.getByRole("heading", { level: 2, name: "History" });
    await expect(historyList(page)).toHaveCount(0);
    await nav.getByRole("button", { name: "History" }).click();
    // Jumping opens the collapsed list.
    await expect(historyList(page)).toBeVisible();
    await expect(heading).toBeInViewport();
    await expect(nav.getByRole("button", { name: "History" })).toHaveAttribute(
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
  });
});
