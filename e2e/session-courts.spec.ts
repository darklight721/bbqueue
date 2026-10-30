import { expect, test, type Page } from "@playwright/test";
import type { Club, Match, Session, SkillLevel, Team } from "../src/domain/types.ts";
import {
  makeClub,
  makeCourt,
  makeMidMatchSession,
  makeSession,
  makeSessionPlayer,
  seedStorage,
} from "./fixtures.ts";
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

test.describe("Club name under the title", () => {
  const open = async (page: Page, overrides: Partial<Session>, clubs: Club[]) => {
    const session = makeMidMatchSession({ startedAt: Date.now() - 60_000, overrides });
    await seedStorage(page, { clubs, session });
    await page.goto(`/sessions/${session.id}`);
    await expect(page.getByRole("heading", { level: 1, name: "Mid match" })).toBeVisible();
  };

  test("shows the Club name", async ({ page }) => {
    const club = makeClub({ name: "Alpha Club" });
    await open(page, { clubId: club.id, clubName: club.name }, [club]);
    await expect(page.getByRole("banner").getByText("Alpha Club", { exact: true })).toBeVisible();
  });

  test("a guests-only Session shows no Club line, even with a stale saved name", async ({
    page,
  }) => {
    await open(page, { clubId: null, clubName: "Stale Club" }, []);
    await expect(page.getByText("Stale Club")).toHaveCount(0);
    await expect(page.getByRole("banner").getByRole("paragraph")).toHaveCount(0);
  });

  test("a renamed Club shows its current name", async ({ page }) => {
    const club = makeClub({ name: "Fresh Name" });
    await open(page, { clubId: club.id, clubName: "Old Name" }, [club]);
    await expect(page.getByRole("banner").getByText("Fresh Name", { exact: true })).toBeVisible();
    await expect(page.getByText("Old Name")).toHaveCount(0);
  });

  test("a deleted Club shows the name saved at Start", async ({ page }) => {
    await open(page, { clubId: "deleted-club", clubName: "Saved Name" }, []);
    await expect(page.getByRole("banner").getByText("Saved Name", { exact: true })).toBeVisible();
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

  test("opening the dialog doesn't focus a score field (no phone keyboard); the title is focused", async ({
    page,
  }) => {
    const { before } = await startFirstMatch(page);
    const dialog = await openScoreDialog(page, 1);
    const fieldA = dialog.getByRole("textbox", { name: before.a.join(" & "), exact: true });
    const fieldB = dialog.getByRole("textbox", { name: before.b.join(" & "), exact: true });

    await expect(dialog.getByRole("heading", { name: "End match — Court 1" })).toBeFocused();
    await expect(fieldA).not.toBeFocused();
    await expect(fieldB).not.toBeFocused();
    expect(await page.evaluate(() => document.activeElement instanceof HTMLInputElement)).toBe(
      false,
    );

    // A field still takes focus when tapped.
    await fieldA.click();
    await expect(fieldA).toBeFocused();
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

test.describe("Spare players notice", () => {
  const note = (page: Page) => page.getByRole("note", { name: "Few spare players" });
  const playersRegion = (page: Page) => page.getByRole("region", { name: "Players" });
  const dismissedKey = (sessionId: string) => `bq:v1:spare-notice-dismissed:${sessionId}`;

  async function addPlayers(page: Page, names: string[]) {
    const region = playersRegion(page);
    for (const name of names) {
      await region.getByRole("textbox", { name: "Player name" }).fill(name);
      await region.getByRole("button", { name: "Add player" }).click();
      await expect(
        region.getByRole("button", { name: `Remove ${name}`, exact: true }),
      ).toBeVisible();
    }
  }

  async function removePlayer(page: Page, name: string) {
    await playersRegion(page)
      .getByRole("button", { name: `Remove ${name}`, exact: true })
      .click();
    await page
      .getByRole("dialog", { name: `Remove ${name} from this session?` })
      .getByRole("button", { name: "Remove", exact: true })
      .click();
    await expect(
      playersRegion(page).getByRole("button", { name: `Remove ${name}`, exact: true }),
    ).toHaveCount(0);
  }

  test("comes and goes live as players and Courts change, with no toast", async ({ page }) => {
    // 8 players on 2 Courts: no Spare players, so the notice already shows.
    await startSession(page, { players: 8, courts: 2 });
    await expect(note(page)).toContainText("8 players on 2 courts");
    await expect(note(page)).toContainText("nobody sits out");

    await addPlayers(page, ["Kim", "Lou"]);
    await expect(note(page)).toContainText("10 players on 2 courts");
    await expect(note(page)).toContainText("only 2 sit out");
    await expect(note(page)).toContainText("Use 1 court or add players");
    // It's a note, not a toast or an alert.
    await expect(
      page.getByRole("status").filter({ hasText: /spare|sit out|players on/i }),
    ).toHaveCount(0);
    await expect(page.getByRole("alert")).toHaveCount(0);

    await addPlayers(page, ["Max", "Ned"]);
    await expect(playersRegion(page).getByText("12 players", { exact: true })).toBeVisible();
    await expect(note(page)).toHaveCount(0);

    await page.getByRole("button", { name: "Add court" }).click();
    await expect(court(page, 3)).toBeVisible();
    await expect(note(page)).toContainText("12 players on 3 courts");
    await expect(note(page)).toContainText("nobody sits out");
    await expect(note(page)).toContainText("Use 2 courts or add players");

    await court(page, 3).getByRole("button", { name: "Remove court 3", exact: true }).click();
    await expect(court(page, 3)).toHaveCount(0);
    await expect(note(page)).toHaveCount(0);
  });

  test("Sitting out drops the count into the notice; Back in hides it", async ({ page }) => {
    await startSession(page, { players: 8, courts: 2 });
    await addPlayers(page, ["Kim", "Lou", "Max"]);
    // 11 on 2 Courts: 3 Spare players.
    await expect(playersRegion(page).getByText("11 players", { exact: true })).toBeVisible();
    await expect(note(page)).toHaveCount(0);

    await playersRegion(page).getByRole("button", { name: "Sit out Max" }).click();
    await expect(playersRegion(page).getByText("11 players · 1 sitting out")).toBeVisible();
    await expect(note(page)).toContainText("10 players on 2 courts");
    await expect(note(page)).toContainText("only 2 sit out");

    await playersRegion(page).getByRole("button", { name: "Back in Max" }).click();
    await expect(playersRegion(page).getByRole("button", { name: "Sit out Max" })).toBeVisible();
    await expect(note(page)).toHaveCount(0);
  });

  test("dismissing hides it for that count, across a reload, until the count changes", async ({
    page,
  }) => {
    await startSession(page, { players: 8, courts: 2 });
    await addPlayers(page, ["Kim", "Lou"]);
    await expect(note(page)).toContainText("10 players on 2 courts");
    const sessionId = (await storedSession(page)).id;

    await note(page).getByRole("button", { name: "Dismiss" }).click();
    await expect(note(page)).toHaveCount(0);
    expect(await page.evaluate((key) => localStorage.getItem(key), dismissedKey(sessionId))).toBe(
      JSON.stringify({ version: 1, data: "10/2" }),
    );

    await page.reload();
    await expect(playersRegion(page).getByText("10 players", { exact: true })).toBeVisible();
    await expect(note(page)).toHaveCount(0);

    // Another count that shows the notice brings it back.
    await removePlayer(page, "Lou");
    await expect(note(page)).toContainText("9 players on 2 courts");
    await expect(note(page)).toContainText("only 1 sits out");
  });

  test("with 1 Court: 6 players show nothing; 5 show the 1-Court text without a Use suggestion", async ({
    page,
  }) => {
    await startSession(page, { players: 6, courts: 1 });
    await expect(playersRegion(page).getByText("6 players", { exact: true })).toBeVisible();
    await expect(note(page)).toHaveCount(0);

    // Remove one of the two players who aren't in the Lineup.
    const inLineup = playersOf(await lineupOf(court(page, 1)));
    const free = NAMES.slice(0, 6).filter((name) => !inLineup.includes(name));
    expect(free).toHaveLength(2);
    await removePlayer(page, free[0]!);

    await expect(note(page)).toContainText("5 players on 1 court");
    await expect(note(page)).toContainText("only 1 sits out each match");
    await expect(note(page)).toContainText("Add players to give everyone more rests");
    await expect(note(page)).not.toContainText("Use ");
  });
});

test.describe("Rehash when no one else can come in", () => {
  // Court 1's Lineup is Ana+Ben vs Cat+Dan. Ivy and Jon are free but played the last two Matches
  // in a row (Streak 2), so Rest keeps them out: the only allowed four is the current Lineup.
  const LINEUP = ["Ana", "Ben", "Cat", "Dan"];
  const RESTED = ["Ivy", "Jon"];
  const OTHER_COURT = ["Eve", "Fay", "Gus", "Hal"];
  // The description may go on with more lines (e.g. "No other balanced Teams for these four.").
  const BLOCKED_TEXT = /^Anyone else would play a third match in a row\./;

  /** Ended Match 1: Ivy+Jon with Ana+Ben. Ended Match 2: Ivy+Jon with Cat+Dan. */
  function history(everyone: string[]): Match[] {
    const now = Date.now();
    const ended = (
      id: string,
      number: number,
      startedAt: number,
      teams: Match["teams"],
    ): Match => ({
      id,
      number,
      courtNumber: 1,
      teams,
      freeAtStart: everyone.filter((name) => !teams.flat().includes(name)),
      startedAt,
      target: 21,
      endedAt: startedAt + 10 * 60_000,
      score: null,
      status: "ended",
    });
    return [
      ended("m1", 1, now - 40 * 60_000, [
        ["Ivy", "Jon"],
        ["Ana", "Ben"],
      ]),
      ended("m2", 2, now - 20 * 60_000, [
        ["Ivy", "Jon"],
        ["Cat", "Dan"],
      ]),
    ];
  }

  /** 6 players on 1 Court, or 10 on 2 Courts with a second Idle Lineup, in the state above. */
  async function openBlocked(
    page: Page,
    courts: 1 | 2,
    options: { skills?: Record<string, SkillLevel>; teams?: [Team, Team] } = {},
  ) {
    const names = [...LINEUP, ...(courts === 2 ? OTHER_COURT : []), ...RESTED];
    const players = names.map((name) =>
      makeSessionPlayer({ id: name, name, skill: options.skills?.[name] ?? "intermediate" }),
    );
    const session: Session = makeSession({
      name: "Rest blocked",
      players,
      matches: history(names),
      courts: [
        makeCourt(1, {
          lineup: {
            teams: options.teams ?? [
              ["Ana", "Ben"],
              ["Cat", "Dan"],
            ],
          },
        }),
        ...(courts === 2
          ? [
              makeCourt(2, {
                lineup: {
                  teams: [
                    ["Eve", "Fay"],
                    ["Gus", "Hal"],
                  ],
                },
              }),
            ]
          : []),
      ],
    });
    await seedStorage(page, { session });
    await page.goto(`/sessions/${session.id}`);
    await expect(court(page, 1).getByText("Lineup", { exact: true })).toBeVisible();
    expect(playersOf(await lineupOf(court(page, 1)))).toEqual(LINEUP);
  }

  const rehash = (page: Page) =>
    court(page, 1).getByRole("button", { name: "Rehash", exact: true });
  const sheet = (page: Page) => page.getByRole("dialog", { name: "No one else can come in" });

  async function openSheet(page: Page) {
    await rehash(page).click();
    await expect(sheet(page)).toBeVisible();
    await expect(sheet(page)).toHaveAccessibleDescription(BLOCKED_TEXT);
  }

  test("the sheet opens with the Lineup unchanged; New Teams re-splits the same four", async ({
    page,
  }) => {
    await openBlocked(page, 1);
    const before = await lineupOf(court(page, 1));

    await openSheet(page);
    // Nothing happens until a choice is made.
    expect(await lineupOf(court(page, 1))).toEqual(before);
    // One Court: there is no Rehash all to offer.
    await expect(sheet(page).getByRole("button", { name: "Rehash all idle courts" })).toHaveCount(
      0,
    );

    await sheet(page).getByRole("button", { name: "New Teams" }).click();
    await expect(sheet(page)).toBeHidden();
    const after = await lineupOf(court(page, 1));
    expect(playersOf(after)).toEqual(LINEUP);
    expect(splitKey(after)).not.toEqual(splitKey(before));
  });

  test("Swap anyway brings in one player who was resting", async ({ page }) => {
    await openBlocked(page, 1);
    await openSheet(page);
    await sheet(page).getByRole("button", { name: "Swap anyway" }).click();
    await expect(sheet(page)).toBeHidden();

    const after = playersOf(await lineupOf(court(page, 1)));
    expect(after).toHaveLength(4);
    const stayed = after.filter((name) => LINEUP.includes(name));
    const incoming = after.filter((name) => !LINEUP.includes(name));
    expect(stayed).toHaveLength(3);
    expect(incoming).toHaveLength(1);
    expect(RESTED).toContain(incoming[0]);
  });

  test("Cancel and Escape leave the Lineup exactly as it was", async ({ page }) => {
    await openBlocked(page, 1);
    const before = await lineupOf(court(page, 1));
    const stored = (await storedSession(page)).courts[0]!.lineup;

    await openSheet(page);
    await sheet(page).getByRole("button", { name: "Cancel" }).click();
    await expect(sheet(page)).toBeHidden();
    expect(await lineupOf(court(page, 1))).toEqual(before);

    await openSheet(page);
    await page.keyboard.press("Escape");
    await expect(sheet(page)).toBeHidden();
    expect(await lineupOf(court(page, 1))).toEqual(before);
    expect((await storedSession(page)).courts[0]!.lineup).toEqual(stored);
  });

  test("with two Idle Courts the sheet offers Rehash all idle courts, which changes both Lineups", async ({
    page,
  }) => {
    await openBlocked(page, 2);
    const beforeOne = await lineupOf(court(page, 1));
    const beforeTwo = await lineupOf(court(page, 2));

    await openSheet(page);
    const all = sheet(page).getByRole("button", { name: "Rehash all idle courts" });
    await expect(all).toBeVisible();
    await expect(all).toHaveAccessibleDescription("Also changes the Lineup on Court 2.");

    await all.click();
    await expect(sheet(page)).toBeHidden();
    const afterOne = await lineupOf(court(page, 1));
    const afterTwo = await lineupOf(court(page, 2));
    expect(splitKey(afterOne)).not.toEqual(splitKey(beforeOne));
    expect(splitKey(afterTwo)).not.toEqual(splitKey(beforeTwo));
    // Rest still keeps the two who played twice in a row out; the other eight fill both Courts.
    expect([...playersOf(afterOne), ...playersOf(afterTwo)].sort()).toEqual(
      [...LINEUP, ...OTHER_COURT].sort(),
    );
  });

  test("when the current split is the only balanced one, the sheet has no New Teams", async ({
    page,
  }) => {
    // Skills 3, 2, 2, 1: only Ana+Dan (4) v Ben+Cat (4) is balanced; the other splits are 5 v 3.
    // Ivy and Jon (Intermediate) are kept out by Rest whatever their Skill.
    await openBlocked(page, 1, {
      skills: { Ana: "advanced", Ben: "intermediate", Cat: "intermediate", Dan: "beginner" },
      teams: [
        ["Ana", "Dan"],
        ["Ben", "Cat"],
      ],
    });
    const before = await lineupOf(court(page, 1));
    const stored = (await storedSession(page)).courts[0]!.lineup;

    await openSheet(page);
    await expect(sheet(page).getByText("No other balanced Teams for these four.")).toBeVisible();
    await expect(sheet(page).getByRole("button", { name: "New Teams" })).toHaveCount(0);
    await expect(sheet(page).getByRole("button", { name: "Swap anyway" })).toBeVisible();

    await sheet(page).getByRole("button", { name: "Cancel" }).click();
    await expect(sheet(page)).toBeHidden();
    expect(await lineupOf(court(page, 1))).toEqual(before);
    expect((await storedSession(page)).courts[0]!.lineup).toEqual(stored);
  });

  test("with enough Spare players Rehash acts straight away, with no sheet", async ({ page }) => {
    await startSession(page, { players: 8, courts: 1 });
    const before = await lineupOf(court(page, 1));

    await rehash(page).click();
    await expect
      .poll(async () => splitKey(await lineupOf(court(page, 1))))
      .not.toEqual(splitKey(before));
    await expect(sheet(page)).toHaveCount(0);
  });
});
