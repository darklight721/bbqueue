import { expect, test, type Page } from "@playwright/test";
import { makeMidMatchSession, seedStorage } from "./fixtures.ts";
import {
  court,
  idNames,
  lineupOf,
  NAMES,
  openScoreDialog,
  parseTimer,
  playersOf,
  splitKey,
  startSession,
  storedSession,
  type Lineup,
} from "./session-helpers.ts";

test.describe("Session shell", () => {
  test("shows the name, point system and Courts heading; Back goes Home with Resume", async ({
    page,
  }) => {
    await startSession(page);
    await expect(page.getByText("21 pts")).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Courts" })).toBeVisible();

    await page.getByRole("button", { name: "Back" }).click();
    await expect(page).toHaveURL(/\/$/);
    const resume = page.getByRole("link", { name: "Resume session" });
    await expect(resume).toBeVisible();
    await expect(resume).toContainText("Courtside");
    await resume.click();
    await expect(page).toHaveURL(/\/sessions\/(?!new$)[^/]+$/);
    await expect(court(page, 1)).toBeVisible();
  });

  test("an unknown /sessions/:id redirects to the past sessions list", async ({ page }) => {
    await page.goto("/sessions/xyz");
    await expect(page).toHaveURL(/\/sessions$/);
    await expect(page.getByRole("heading", { level: 1, name: "Past sessions" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Resume session" })).toHaveCount(0);
  });
});

test.describe("Courts and Lineups", () => {
  test("8 players / 2 courts: both Courts are Idle with disjoint Lineups", async ({ page }) => {
    await startSession(page);
    for (const number of [1, 2]) {
      await expect(court(page, number).getByText("Idle", { exact: true })).toBeVisible();
      await expect(court(page, number).getByText("Lineup", { exact: true })).toBeVisible();
    }
    const one = await lineupOf(court(page, 1));
    const two = await lineupOf(court(page, 2));
    const all = [...playersOf(one), ...playersOf(two)];
    expect(new Set(all).size).toBe(8);
    expect([...all].sort()).toEqual([...NAMES].sort());
  });

  test("Start match → Playing with a timer; the other Court's Lineup is unchanged", async ({
    page,
  }) => {
    await startSession(page);
    const before = await lineupOf(court(page, 1));
    const otherBefore = await lineupOf(court(page, 2));

    await court(page, 1).getByRole("button", { name: "Start match" }).click();
    const one = court(page, 1);
    await expect(one.getByText("Playing", { exact: true })).toBeVisible();
    await expect(one.getByRole("timer", { name: "Match time" })).toHaveText(/^\d\d:\d\d$/);
    await expect(one.getByRole("button", { name: "End match" })).toBeVisible();
    await expect(one.getByRole("button", { name: "Start match" })).toHaveCount(0);

    // Same teams on Court 1, untouched Lineup on Court 2.
    expect(await lineupOf(one)).toEqual(before);
    expect(await lineupOf(court(page, 2))).toEqual(otherBefore);
    await expect(court(page, 2).getByText("Idle", { exact: true })).toBeVisible();

    const session = await storedSession(page);
    expect(session.matches).toHaveLength(1);
    expect(session.matches[0]).toMatchObject({ status: "active", courtNumber: 1, score: null });
  });

  test("Rehash changes Court 1's Lineup", async ({ page }) => {
    await startSession(page);
    const before = await lineupOf(court(page, 1));
    const otherBefore = await lineupOf(court(page, 2));

    await court(page, 1).getByRole("button", { name: "Rehash", exact: true }).click();
    await expect
      .poll(async () => splitKey(await lineupOf(court(page, 1))))
      .not.toBe(splitKey(before));
    // The same four players are still on Court 1; Court 2 is untouched.
    expect(playersOf(await lineupOf(court(page, 1)))).toEqual(playersOf(before));
    expect(await lineupOf(court(page, 2))).toEqual(otherBefore);
  });

  test("Rehash all is hidden with one Court, then needs two Idle Courts", async ({ page }) => {
    await startSession(page, { players: 4, courts: 1 });
    const rehashAll = page.getByRole("button", { name: "Rehash all" });
    await expect(court(page, 1)).toBeVisible();
    await expect(rehashAll).toHaveCount(0);

    await page.getByRole("button", { name: "Add court" }).click();
    await expect(court(page, 2)).toBeVisible();
    await expect(rehashAll).toBeEnabled();

    // A Busy Court no longer counts as Idle: still shown (2 Courts), but disabled.
    await court(page, 1).getByRole("button", { name: "Start match" }).click();
    await expect(court(page, 1).getByText("Playing", { exact: true })).toBeVisible();
    await expect(rehashAll).toBeDisabled();
    await expect(rehashAll).toHaveAttribute("title", "Needs at least 2 idle courts");

    // Back to one Court: hidden again.
    await court(page, 2).getByRole("button", { name: "Remove court 2", exact: true }).click();
    await expect(court(page, 2)).toHaveCount(0);
    await expect(rehashAll).toHaveCount(0);
  });

  test("Rehash all re-picks Lineups for all Idle Courts", async ({ page }) => {
    await startSession(page);
    const beforeOne = await lineupOf(court(page, 1));
    const beforeTwo = await lineupOf(court(page, 2));
    const arrangement = (a: Lineup, b: Lineup) => [splitKey(a), splitKey(b)].sort().join(" || ");

    await page.getByRole("button", { name: "Rehash all" }).click();
    await expect
      .poll(async () => arrangement(await lineupOf(court(page, 1)), await lineupOf(court(page, 2))))
      .not.toBe(arrangement(beforeOne, beforeTwo));

    const afterOne = await lineupOf(court(page, 1));
    const afterTwo = await lineupOf(court(page, 2));
    expect(new Set([...playersOf(afterOne), ...playersOf(afterTwo)]).size).toBe(8);
  });

  test("Add court → Court 3 waiting for players; Idle courts can be removed", async ({ page }) => {
    await startSession(page);
    await page.getByRole("button", { name: "Add court" }).click();
    const three = court(page, 3);
    await expect(three).toBeVisible();
    await expect(three.getByText("Waiting for players")).toBeVisible();
    await expect(three.getByRole("button", { name: "Start match" })).toBeDisabled();
    await expect(three.getByRole("button", { name: "Rehash", exact: true })).toBeDisabled();
    expect((await storedSession(page)).courts.map((c) => c.number)).toEqual([1, 2, 3]);

    await three.getByRole("button", { name: "Remove court 3", exact: true }).click();
    await expect(court(page, 3)).toHaveCount(0);
    expect((await storedSession(page)).courts).toHaveLength(2);

    // The freed number is reused.
    await page.getByRole("button", { name: "Add court" }).click();
    await expect(court(page, 3)).toBeVisible();
  });

  test("Remove court is only offered on Idle courts", async ({ page }) => {
    await startSession(page);
    await court(page, 1).getByRole("button", { name: "Start match" }).click();
    await expect(court(page, 1).getByText("Playing")).toBeVisible();
    await expect(court(page, 1).getByRole("button", { name: /^Remove court/ })).toHaveCount(0);
    await expect(
      court(page, 2).getByRole("button", { name: "Remove court 2", exact: true }),
    ).toBeEnabled();
  });

  test("Add court is disabled at 10 Courts", async ({ page }) => {
    await startSession(page);
    const add = page.getByRole("button", { name: "Add court" });
    for (let number = 3; number <= 10; number++) {
      await add.click();
      await expect(court(page, number)).toBeVisible();
    }
    await expect(add).toBeDisabled();
    await expect(page.getByText("Up to 10 courts.")).toBeVisible();
  });
});

test.describe("Ending and removing matches", () => {
  async function startFirstMatch(page: Page) {
    await startSession(page);
    const before = await lineupOf(court(page, 1));
    const otherBefore = await lineupOf(court(page, 2));
    await court(page, 1).getByRole("button", { name: "Start match" }).click();
    await expect(court(page, 1).getByText("Playing", { exact: true })).toBeVisible();
    return { before, otherBefore };
  }

  test("End with a valid score → new Lineup right away, '1 played', score stored", async ({
    page,
  }) => {
    const { before, otherBefore } = await startFirstMatch(page);
    const dialog = await openScoreDialog(page, 1);

    const teamA = before.a.join(" & ");
    const teamB = before.b.join(" & ");
    await dialog.getByRole("textbox", { name: teamA, exact: true }).fill("21");
    await dialog.getByRole("textbox", { name: teamB, exact: true }).fill("15");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();

    const one = court(page, 1);
    await expect(one.getByText("Idle", { exact: true })).toBeVisible();
    await expect(one.getByText("Lineup", { exact: true })).toBeVisible();
    const after = await lineupOf(one);
    expect(playersOf(after)).toHaveLength(4);
    // Those four just played one match each.
    await expect(one.getByText("1 played")).toHaveCount(4);
    expect(await lineupOf(court(page, 2))).toEqual(otherBefore);

    const session = await storedSession(page);
    expect(session.matches).toHaveLength(1);
    const names = idNames(session);
    const match = session.matches[0]!;
    expect(match).toMatchObject({ status: "ended", number: 1, score: [21, 15] });
    expect(match.teams.map((team) => team.map((id) => names.get(id)))).toEqual([
      before.a,
      before.b,
    ]);
    expect(session.courts.find((c) => c.number === 1)!.activeMatchId).toBeNull();
  });

  test("an invalid score shows messages and keeps the dialog open", async ({ page }) => {
    const { before } = await startFirstMatch(page);
    const dialog = await openScoreDialog(page, 1);
    const fieldA = dialog.getByRole("textbox", { name: before.a.join(" & "), exact: true });
    const fieldB = dialog.getByRole("textbox", { name: before.b.join(" & "), exact: true });

    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByText("Enter both scores, or end without a score.")).toBeVisible();

    await fieldA.fill("15");
    await fieldB.fill("15");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByText("Scores can't be level. One team has to win.")).toBeVisible();

    await fieldA.fill("10");
    await fieldB.fill("5");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByText("The winning team needs at least 21 points.")).toBeVisible();

    await expect(dialog).toBeVisible();
    const session = await storedSession(page);
    expect(session.matches[0]).toMatchObject({ status: "active", score: null });

    // Cancel leaves the match running.
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(court(page, 1).getByText("Playing", { exact: true })).toBeVisible();
  });

  test("End without score stores a match with no score", async ({ page }) => {
    await startFirstMatch(page);
    const dialog = await openScoreDialog(page, 1);
    await dialog.getByRole("button", { name: "End without score" }).click();
    await expect(dialog).toBeHidden();

    await expect(court(page, 1).getByText("Idle", { exact: true })).toBeVisible();
    const match = (await storedSession(page)).matches[0]!;
    expect(match).toMatchObject({ status: "ended", number: 1, score: null });
    // An ended match still counts as played.
    await expect(court(page, 1).getByText("1 played")).toHaveCount(4);
  });

  test("Remove match: Cancel keeps it; confirming removes it without counting", async ({
    page,
  }) => {
    await startFirstMatch(page);
    const one = court(page, 1);
    await one.getByRole("button", { name: "Remove match" }).click();
    const dialog = page.getByRole("dialog", { name: "Remove this match?" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleDescription("It won't count.");

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(one.getByText("Playing", { exact: true })).toBeVisible();
    expect((await storedSession(page)).matches).toHaveLength(1);

    await one.getByRole("button", { name: "Remove match" }).click();
    await page
      .getByRole("dialog", { name: "Remove this match?" })
      .getByRole("button", { name: "Remove match" })
      .click();

    await expect(one.getByText("Idle", { exact: true })).toBeVisible();
    await expect(one.getByText("Lineup", { exact: true })).toBeVisible();
    await expect(one.getByText("0 played")).toHaveCount(4);
    expect((await storedSession(page)).matches).toHaveLength(0);
  });
});

test.describe("Reload", () => {
  test("mid-match reload keeps the match and the timer keeps counting from the start", async ({
    page,
  }) => {
    const startedAt = Date.now() - 5 * 60_000;
    const session = makeMidMatchSession({ startedAt });
    await seedStorage(page, { session });
    await page.goto(`/sessions/${session.id}`);

    const one = court(page, 1);
    const timer = one.getByRole("timer", { name: "Match time" });
    await expect(one.getByText("Playing", { exact: true })).toBeVisible();
    await expect(timer).toHaveText(/^0[5-9]:\d\d$/);
    const lineup = await lineupOf(one);
    expect(lineup).toEqual({ a: ["Ana", "Ben"], b: ["Cat", "Dan"] });
    const otherLineup = await lineupOf(court(page, 2));

    // It ticks.
    const first = parseTimer((await timer.textContent())!);
    await expect.poll(async () => parseTimer((await timer.textContent())!)).toBeGreaterThan(first);

    const beforeReload = parseTimer((await timer.textContent())!);
    await page.reload();

    await expect(one.getByText("Playing", { exact: true })).toBeVisible();
    await expect(timer).toBeVisible();
    expect(parseTimer((await timer.textContent())!)).toBeGreaterThanOrEqual(beforeReload);
    expect(await lineupOf(one)).toEqual(lineup);
    expect(await lineupOf(court(page, 2))).toEqual(otherLineup);
    expect((await storedSession(page)).matches[0]).toMatchObject({ startedAt, status: "active" });
  });

  test("a match started in the UI survives a reload", async ({ page }) => {
    await startSession(page);
    await court(page, 1).getByRole("button", { name: "Start match" }).click();
    const lineup = await lineupOf(court(page, 1));
    await page.reload();
    await expect(court(page, 1).getByText("Playing", { exact: true })).toBeVisible();
    expect(await lineupOf(court(page, 1))).toEqual(lineup);
    await expect(court(page, 1).getByRole("timer", { name: "Match time" })).toBeVisible();
  });
});
