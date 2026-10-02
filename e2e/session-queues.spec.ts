import { expect, test, type Locator, type Page } from "@playwright/test";
import type { Match, Session, SkillLevel } from "../src/domain/types.ts";
import {
  makeCourt,
  makeMidMatchSession,
  makeSession,
  makeSessionPlayer,
  seedStorage,
} from "./fixtures.ts";
import { court, lineupOf, playersOf, storedSession } from "./session-helpers.ts";

/**
 * Seeded layout (10 players), deliberately not alphabetical:
 *   Court 1 Busy:    Zoe + Ben  vs  ana + Dan
 *   Court 2 Lineup:  Eve + Fay  vs  Gus + Hal
 *   Free: Ivy, Jon
 */
const NAMES = ["Zoe", "Ben", "ana", "Dan", "Eve", "Fay", "Gus", "Hal", "Ivy", "Jon"];
const SORTED = ["ana", "Ben", "Dan", "Eve", "Fay", "Gus", "Hal", "Ivy", "Jon", "Zoe"];

interface Tweaks {
  sittingOut?: string[];
  skills?: Record<string, SkillLevel>;
  /** Ended matches to add: teams by player name. */
  history?: [[string, string], [string, string]][];
}

function buildSession({ sittingOut = [], skills = {}, history = [] }: Tweaks = {}): Session {
  const session = makeMidMatchSession({ startedAt: Date.now() - 60_000, names: NAMES });
  const idOf = (name: string) => session.players.find((player) => player.name === name)!.id;
  for (const player of session.players) {
    if (sittingOut.includes(player.name)) player.sittingOut = true;
    const skill = skills[player.name];
    if (skill) player.skill = skill;
  }
  history.forEach(([a, b], index) => {
    const endedAt = Date.now() - (30 - index) * 60_000;
    const match: Match = {
      id: `history-${index}`,
      number: index + 1,
      courtNumber: 1,
      teams: [
        [idOf(a[0]), idOf(a[1])],
        [idOf(b[0]), idOf(b[1])],
      ],
      freeAtStart: [],
      startedAt: endedAt - 10 * 60_000,
      target: 21,
      endedAt,
      score: [21, 10],
      status: "ended",
    };
    session.matches.unshift(match);
  });
  return session;
}

async function openSeeded(page: Page, session: Session = buildSession()) {
  await seedStorage(page, { session });
  await page.goto(`/sessions/${session.id}`);
  await expect(queuesRegion(page)).toBeVisible();
  return session;
}

const queuesRegion = (page: Page) => page.getByRole("region", { name: "Queues", exact: true });
const queue = (page: Page, number: number) =>
  page.getByRole("region", { name: `Queue ${number}`, exact: true });
const picker = (page: Page) => page.getByRole("dialog", { name: "Pick a player" });
const notice = (page: Page, text: string | RegExp) =>
  page.getByRole("status").filter({ hasText: text });

async function addQueue(page: Page) {
  await page.getByRole("button", { name: "Add queue" }).click();
}

type TeamLabel = "Team A" | "Team B";

async function pick(page: Page, q: Locator, team: TeamLabel, spot: 1 | 2, name: string) {
  await q.getByRole("button", { name: `Pick player for ${team}, spot ${spot}` }).click();
  await expect(picker(page)).toBeVisible();
  await picker(page).getByRole("button", { name, exact: true }).click();
  await expect(picker(page)).toBeHidden();
  await expect(q.getByRole("button", { name: `Clear ${name}`, exact: true })).toBeVisible();
}

/** Fill a Queue: [Team A spot 1, Team A spot 2, Team B spot 1, Team B spot 2]. */
async function fill(page: Page, q: Locator, names: [string, string, string, string]) {
  await pick(page, q, "Team A", 1, names[0]);
  await pick(page, q, "Team A", 2, names[1]);
  await pick(page, q, "Team B", 1, names[2]);
  await pick(page, q, "Team B", 2, names[3]);
  await expect(q.getByText("4 of 4")).toBeVisible();
}

const move = (q: Locator, label: string) =>
  q.getByRole("group", { name: "Move to court" }).getByRole("button", { name: label, exact: true });

const pickerNames = (page: Page) =>
  picker(page)
    .getByRole("list", { name: "Players" })
    .getByRole("button")
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")!));

test.describe("Queues section", () => {
  test("empty state, then Add queue creates Queue 1 with 0 of 4", async ({ page }) => {
    await openSeeded(page);
    await expect(page.getByRole("heading", { level: 2, name: "Queues" })).toBeVisible();
    await expect(
      queuesRegion(page).getByText(
        "Pick the next four players by hand, then move them onto a free court.",
      ),
    ).toBeVisible();
    await expect(page.getByRole("region", { name: /^Queue \d/ })).toHaveCount(0);

    await addQueue(page);
    await expect(queue(page, 1)).toBeVisible();
    await expect(queue(page, 1).getByText("0 of 4")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add queue" })).toHaveCount(1);
    await expect(queuesRegion(page).getByText("Pick the next four players")).toHaveCount(0);
    expect((await storedSession(page)).queues).toHaveLength(1);

    for (const team of ["Team A", "Team B"]) {
      await expect(
        queue(page, 1).getByRole("list", { name: team }).getByRole("button"),
      ).toHaveCount(2);
    }
  });

  test("Remove queue removes the card and brings back the empty state", async ({ page }) => {
    await openSeeded(page);
    await addQueue(page);
    await queue(page, 1).getByRole("button", { name: "Remove queue 1" }).click();
    await expect(queue(page, 1)).toHaveCount(0);
    await expect(queuesRegion(page).getByText("Pick the next four players")).toBeVisible();
    expect((await storedSession(page)).queues).toHaveLength(0);
  });
});

test.describe("Picking players", () => {
  test("picker lists everyone with status; filter narrows; Cancel closes", async ({ page }) => {
    await openSeeded(page);
    await addQueue(page);
    const q = queue(page, 1);
    await q.getByRole("button", { name: "Pick player for Team A, spot 1" }).click();

    await expect(picker(page)).toHaveAccessibleDescription("Team A · spot 1");
    expect(await pickerNames(page)).toEqual(SORTED);
    const list = picker(page).getByRole("list", { name: "Players" });
    await expect(
      list.getByRole("button", { name: "Zoe", exact: true }),
    ).toHaveAccessibleDescription("On court 1");
    await expect(
      list.getByRole("button", { name: "Eve", exact: true }),
    ).toHaveAccessibleDescription("In lineup · court 2");
    await expect(
      list.getByRole("button", { name: "Ivy", exact: true }),
    ).toHaveAccessibleDescription("Free");

    const filter = picker(page).getByRole("searchbox", { name: "Filter players" });
    await filter.fill("an");
    await expect.poll(() => pickerNames(page)).toEqual(["ana", "Dan"]);
    await filter.fill("zzz");
    await expect(picker(page).getByText("No players match.")).toBeVisible();
    await expect(picker(page).getByRole("list", { name: "Players" })).toHaveCount(0);

    await picker(page).getByRole("button", { name: "Cancel" }).click();
    await expect(picker(page)).toBeHidden();
    await expect(q.getByText("0 of 4")).toBeVisible();
  });

  test("players already in this Queue are excluded; lineup and on-court players can be picked", async ({
    page,
  }) => {
    await openSeeded(page);
    await addQueue(page);
    const q = queue(page, 1);

    await pick(page, q, "Team A", 1, "Ivy");
    await q.getByRole("button", { name: "Pick player for Team A, spot 2" }).click();
    const names = await pickerNames(page);
    expect(names).toHaveLength(9);
    expect(names).not.toContain("Ivy");
    expect(names).toContain("Zoe"); // on court
    expect(names).toContain("Eve"); // in a Lineup
    await picker(page).getByRole("button", { name: "Zoe", exact: true }).click();

    await pick(page, q, "Team B", 1, "Eve");
    await expect(q.getByText("3 of 4")).toBeVisible();

    // Queues don't hold players: Eve is still in Court 2's Lineup.
    expect(playersOf(await lineupOf(court(page, 2)))).toContain("Eve");

    const stored = (await storedSession(page)).queues[0]!;
    const names3 = new Map((await storedSession(page)).players.map((p) => [p.id, p.name]));
    expect(stored.slots.map((pair) => pair.map((id) => (id ? names3.get(id) : null)))).toEqual([
      ["Ivy", "Zoe"],
      ["Eve", null],
    ]);
  });

  test("clearing a spot drops the count and reopens the spot", async ({ page }) => {
    await openSeeded(page);
    await addQueue(page);
    const q = queue(page, 1);
    await pick(page, q, "Team A", 1, "Ivy");
    await pick(page, q, "Team B", 2, "Jon");
    await expect(q.getByText("2 of 4")).toBeVisible();

    await q.getByRole("button", { name: "Clear Ivy" }).click();
    await expect(q.getByText("1 of 4")).toBeVisible();
    await expect(q.getByRole("button", { name: "Pick player for Team A, spot 1" })).toBeVisible();
    await expect(q.getByRole("button", { name: "Clear Ivy" })).toHaveCount(0);

    // Ivy can be picked again.
    await pick(page, q, "Team A", 1, "Ivy");
  });

  test("two Queues can share a player; Queues are numbered by position", async ({ page }) => {
    await openSeeded(page);
    await addQueue(page);
    await pick(page, queue(page, 1), "Team A", 1, "Ivy");
    await addQueue(page);
    await expect(queue(page, 2)).toBeVisible();
    await pick(page, queue(page, 2), "Team B", 1, "Ivy");

    const session = await storedSession(page);
    const ivy = session.players.find((p) => p.name === "Ivy")!.id;
    expect(session.queues).toHaveLength(2);
    expect(session.queues[0]!.slots[0][0]).toBe(ivy);
    expect(session.queues[1]!.slots[1][0]).toBe(ivy);

    await queue(page, 1).getByRole("button", { name: "Remove queue 1" }).click();
    await expect(queue(page, 2)).toHaveCount(0);
    await expect(queue(page, 1).getByRole("button", { name: "Clear Ivy" })).toBeVisible();
  });
});

test.describe("Move to court", () => {
  test("starts the match with exactly the hand-set Teams; the Queue disappears", async ({
    page,
  }) => {
    await openSeeded(page);
    await addQueue(page);
    const q = queue(page, 1);
    await fill(page, q, ["Ivy", "Jon", "Eve", "Fay"]);

    await expect(move(q, "Court 2 · Idle")).toBeEnabled();
    await move(q, "Court 2 · Idle").click();

    await expect(notice(page, "Match started on court 2")).toBeVisible();
    await expect(page.getByRole("region", { name: /^Queue \d/ })).toHaveCount(0);
    await expect(queuesRegion(page).getByText("Pick the next four players")).toBeVisible();

    const two = court(page, 2);
    await expect(two.getByText("Playing", { exact: true })).toBeVisible();
    expect(await lineupOf(two)).toEqual({ a: ["Ivy", "Jon"], b: ["Eve", "Fay"] });
    await expect(court(page, 1).getByText("Playing", { exact: true })).toBeVisible();

    const session = await storedSession(page);
    const names = new Map(session.players.map((p) => [p.id, p.name]));
    const active = session.matches.filter((m) => m.status === "active");
    expect(active).toHaveLength(2);
    const started = active.find((m) => m.courtNumber === 2)!;
    expect(started.teams.map((team) => team.map((id) => names.get(id)))).toEqual([
      ["Ivy", "Jon"],
      ["Eve", "Fay"],
    ]);
    expect(session.queues).toHaveLength(0);
  });

  test("is disabled for an incomplete Queue, a Busy court, and a player on court", async ({
    page,
  }) => {
    await openSeeded(page);
    await addQueue(page);
    const q = queue(page, 1);

    // Incomplete.
    await pick(page, q, "Team A", 1, "Ivy");
    await expect(move(q, "Court 2 · Idle")).toBeDisabled();
    await expect(move(q, "Court 2 · Idle")).toHaveAccessibleDescription("Fill all 4 spots");
    await expect(move(q, "Court 1 · Playing")).toBeDisabled();
    await expect(move(q, "Court 1 · Playing")).toHaveAccessibleDescription("Court in use");

    // Complete, but Ben is on court 1.
    await pick(page, q, "Team A", 2, "Jon");
    await pick(page, q, "Team B", 1, "Eve");
    await pick(page, q, "Team B", 2, "Ben");
    await expect(move(q, "Court 2 · Idle")).toBeDisabled();
    await expect(move(q, "Court 2 · Idle")).toHaveAccessibleDescription("Ben is on court 1");
    await expect(move(q, "Court 1 · Playing")).toBeDisabled();
    await expect(move(q, "Court 1 · Playing")).toHaveAccessibleDescription("Court in use");

    // Swap Ben for Fay → Idle court becomes available, Busy court stays blocked.
    await q.getByRole("button", { name: "Clear Ben" }).click();
    await pick(page, q, "Team B", 2, "Fay");
    await expect(move(q, "Court 2 · Idle")).toBeEnabled();
    await expect(move(q, "Court 1 · Playing")).toBeDisabled();
    await expect(move(q, "Court 1 · Playing")).toHaveAccessibleDescription("Court in use");
  });

  test("another Court's Lineup only loses the queued player", async ({ page }) => {
    const names = [
      "Ann",
      "Bea",
      "Cal",
      "Dee",
      "Eli",
      "Fox",
      "Gia",
      "Hui",
      "Ian",
      "Joy",
      "Kai",
      "Lee",
    ];
    const players = names.map((name) => makeSessionPlayer({ name }));
    const id = (name: string) => players.find((p) => p.name === name)!.id;
    const lineup = (a: [string, string], b: [string, string]) => ({
      teams: [
        [id(a[0]), id(a[1])],
        [id(b[0]), id(b[1])],
      ] as [[string, string], [string, string]],
    });
    const session = makeSession({
      name: "Three courts",
      players,
      courts: [
        makeCourt(1, { lineup: lineup(["Ann", "Bea"], ["Cal", "Dee"]) }),
        makeCourt(2, { lineup: lineup(["Eli", "Fox"], ["Gia", "Hui"]) }),
        makeCourt(3),
      ],
    });
    await openSeeded(page, session);
    await expect(court(page, 3).getByText("Waiting for players")).toBeVisible();

    await addQueue(page);
    const q = queue(page, 1);
    await fill(page, q, ["Ann", "Ian", "Joy", "Kai"]);
    await move(q, "Court 2 · Idle").click();
    await expect(notice(page, "Match started on court 2")).toBeVisible();

    await expect(court(page, 2).getByText("Playing", { exact: true })).toBeVisible();
    expect(await lineupOf(court(page, 2))).toEqual({ a: ["Ann", "Ian"], b: ["Joy", "Kai"] });

    // Court 1 kept Bea, Cal and Dee; only Ann was swapped out.
    await expect.poll(async () => playersOf(await lineupOf(court(page, 1)))).not.toContain("Ann");
    const after = playersOf(await lineupOf(court(page, 1)));
    expect(after).toHaveLength(4);
    for (const name of ["Bea", "Cal", "Dee"]) expect(after).toContain(name);
    const replacement = after.find((name) => !["Bea", "Cal", "Dee"].includes(name))!;
    expect(["Eli", "Fox", "Gia", "Hui", "Lee"]).toContain(replacement);
  });

  test("a sitting-out player can be queued with a warning, and moving brings them back in", async ({
    page,
  }) => {
    await openSeeded(page, buildSession({ sittingOut: ["Jon"] }));
    await addQueue(page);
    const q = queue(page, 1);
    await fill(page, q, ["Jon", "Ivy", "Eve", "Fay"]);

    await expect(
      q.getByRole("list", { name: "Warnings" }).getByText("Sitting out: Jon"),
    ).toBeVisible();
    await expect(move(q, "Court 2 · Idle")).toBeEnabled();
    await move(q, "Court 2 · Idle").click();
    await expect(notice(page, "Match started on court 2")).toBeVisible();

    expect(await lineupOf(court(page, 2))).toEqual({ a: ["Jon", "Ivy"], b: ["Eve", "Fay"] });
    const stored = await storedSession(page);
    expect(stored.players.find((p) => p.name === "Jon")!.sittingOut).toBe(false);
    await expect(
      page.getByRole("region", { name: "Players" }).getByRole("button", { name: "Sit out Jon" }),
    ).toBeVisible();
  });
});

test.describe("Warnings", () => {
  test("Unbalanced shows for 2 advanced vs 2 beginners, not for a mixed split", async ({
    page,
  }) => {
    await openSeeded(
      page,
      buildSession({
        skills: { Ivy: "advanced", Jon: "advanced", Eve: "beginner", Fay: "beginner" },
      }),
    );
    await addQueue(page);
    await fill(page, queue(page, 1), ["Ivy", "Jon", "Eve", "Fay"]);
    await expect(
      queue(page, 1)
        .getByRole("list", { name: "Warnings" })
        .getByText("Unbalanced", { exact: true }),
    ).toBeVisible();

    await addQueue(page);
    await fill(page, queue(page, 2), ["Ivy", "Eve", "Jon", "Fay"]);
    await expect(queue(page, 2).getByRole("list", { name: "Warnings" })).toHaveCount(0);

    // Warnings are non-blocking.
    await expect(move(queue(page, 1), "Court 2 · Idle")).toBeEnabled();
  });

  test("Repeat partners shows when a pair has partnered before", async ({ page }) => {
    await openSeeded(
      page,
      buildSession({
        history: [
          [
            ["Ivy", "Jon"],
            ["Eve", "Fay"],
          ],
        ],
      }),
    );
    await addQueue(page);
    await fill(page, queue(page, 1), ["Ivy", "Jon", "Gus", "Hal"]);
    await expect(
      queue(page, 1)
        .getByRole("list", { name: "Warnings" })
        .getByText("Repeat partners: Ivy & Jon"),
    ).toBeVisible();
  });
});

test.describe("Jump bar", () => {
  test("has Courts, Queues and Players; Queues scrolls to the section", async ({ page }) => {
    await openSeeded(page);
    const nav = page.getByRole("navigation", { name: "Sections" });
    // Later sections (History) may follow; these three come first, in screen order.
    await expect(nav.getByRole("button").first()).toBeVisible();
    expect((await nav.getByRole("button").allInnerTexts()).slice(0, 3)).toEqual([
      "Courts",
      "Queues",
      "Players",
    ]);

    const heading = page.getByRole("heading", { level: 2, name: "Queues" });
    await nav.getByRole("button", { name: "Players" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Players" })).toBeInViewport();
    await expect(heading).not.toBeInViewport();

    await nav.getByRole("button", { name: "Queues" }).click();
    await expect(heading).toBeInViewport();
    await expect(nav.getByRole("button", { name: "Queues" })).toHaveAttribute(
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
