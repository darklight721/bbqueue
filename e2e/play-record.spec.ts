import { expect, test, type Locator, type Page } from "@playwright/test";
import type { Club, EndedSession } from "../src/domain/types.ts";
import { makeClub, makeEndedSessionFromMatches, seedStorage } from "./fixtures.ts";

const DAY = 86_400_000;
const BASE = 1_760_000_000_000;

type Pair = [string, string];
const row = (a: Pair, b: Pair, score: [number, number] | null) => ({ a, b, score });

/**
 * An Ended session of `club` whose Session player ids are their names. `ids` says which Club
 * player each name was copied from; a name that isn't in it is a Guest (`clubPlayerId: null`).
 * `legacy` leaves the field out altogether, as an Ended session from before it was saved does.
 */
function endedOf(
  club: Club | null,
  name: string,
  daysAgo: number,
  rows: ReturnType<typeof row>[],
  ids: Record<string, string>,
  legacy = false,
): EndedSession {
  const session = makeEndedSessionFromMatches(rows, {
    name,
    clubId: club?.id ?? null,
    clubName: club?.name ?? null,
    startedAt: BASE - daysAgo * DAY,
    endedAt: BASE - daysAgo * DAY + 7_200_000,
  });
  session.players = session.players.map((player) => {
    if (legacy) return player as never;
    return { ...player, clubPlayerId: ids[player.name] ?? null };
  });
  return session;
}

const ALPHA_IDS = { Ann: "cp-ann", Bob: "cp-bob", Cat: "cp-cat", Dan: "cp-dan" };

function alphaClub(): Club {
  return makeClub({
    name: "Alpha Club",
    players: [
      { id: "cp-ann", name: "Ann", skill: "intermediate" },
      { id: "cp-bob", name: "Bob", skill: "intermediate" },
      { id: "cp-cat", name: "Cat", skill: "intermediate" },
      { id: "cp-dan", name: "Dan", skill: "intermediate" },
    ],
  });
}

/**
 * Ann's figures in Alpha Club.
 * Thursday (a week ago): Ann 1 win, 1 loss, 1 unscored match; 2nd place.
 * Friday (yesterday): Ann 3 wins with Bob twice and the Guest Gus once; 1st place.
 * Ann in total: 6 matches, 4 wins, 1 loss, 80%, 2 sessions. Bob is her most frequent and best Partner.
 */
function alphaSessions(club: Club) {
  const thursday = endedOf(
    club,
    "Thursday ladder",
    7,
    [
      row(["Ann", "Bob"], ["Cat", "Dan"], [21, 10]),
      row(["Ann", "Cat"], ["Bob", "Dan"], [12, 21]),
      row(["Ann", "Dan"], ["Bob", "Cat"], null),
    ],
    ALPHA_IDS,
  );
  const friday = endedOf(
    club,
    "Friday smash",
    1,
    [
      row(["Ann", "Bob"], ["Cat", "Dan"], [21, 15]),
      row(["Ann", "Gus"], ["Bob", "Dan"], [21, 18]),
      row(["Ann", "Bob"], ["Cat", "Gus"], [21, 5]),
    ],
    ALPHA_IDS,
  );
  return { thursday, friday };
}

const heading = (page: Page, name: string) => page.getByRole("heading", { level: 1, name });
const back = (page: Page) => page.getByRole("button", { name: "Back" });
const standings = (page: Page) => page.getByRole("list", { name: "Standings" });
const sessionRows = (page: Page) => page.getByRole("list", { name: "Sessions" }).getByRole("link");
const dots = (page: Page) =>
  page.getByRole("group", { name: "Win rate per session" }).getByRole("button");
const partner = (page: Page, which: "Most frequent" | "Best") =>
  page.getByRole("article", { name: `${which} partner` });
const statsPath = (clubId: string, clubPlayerId: string) =>
  `/clubs/${clubId}/players/${clubPlayerId}/stats`;
const endsWith = (suffix: string) => new RegExp(`${suffix.replace(/[?.]/g, "\\$&")}$`);

/** The number under a headline label ("Wins", "Win rate", …). */
function headline(page: Page, label: string): Locator {
  return page.locator("dt", { hasText: label }).locator("xpath=following-sibling::dd");
}

async function expectAnnFigures(page: Page) {
  await expect(headline(page, "Matches")).toHaveText("6");
  await expect(headline(page, "Wins")).toHaveText("4");
  await expect(headline(page, "Losses")).toHaveText("1");
  await expect(headline(page, "Win rate")).toHaveText("80%");
  await expect(headline(page, "Sessions")).toHaveText("2");
}

test.describe("Club view", () => {
  test("a Standings name opens that player's Stats in the Club; Back returns to the Ended session", async ({
    page,
  }) => {
    const club = alphaClub();
    const { thursday, friday } = alphaSessions(club);
    await seedStorage(page, { clubs: [club], endedSessions: [thursday, friday] });

    await page.goto(`/sessions/${friday.id}`);
    await expect(heading(page, "Friday smash")).toBeVisible();
    await standings(page).getByRole("link", { name: "Stats for Ann" }).click();

    await expect(page).toHaveURL(new RegExp(`/clubs/${club.id}/players/cp-ann/stats`));
    await expect(heading(page, "Stats")).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Ann" })).toBeVisible();
    await expect(page.getByText("Alpha Club").first()).toBeVisible();
    await expectAnnFigures(page);
    await expect(sessionRows(page)).toHaveCount(2);
    await expect(sessionRows(page).first()).toHaveAccessibleName(/3 wins, 0 losses, 1st place$/);
    await expect(sessionRows(page).last()).toHaveAccessibleName(/1 win, 1 loss, 2nd place$/);
    await expect(partner(page, "Most frequent")).toContainText("Bob");
    await expect(partner(page, "Best")).toContainText("Bob");
    await expect(partner(page, "Best")).toContainText("100%");
    // The Guest partnered Ann too, but has no Stats.
    await expect(partner(page, "Most frequent")).not.toContainText("Gus");

    await back(page).click();
    await expect(page).toHaveURL(endsWith(`/sessions/${friday.id}`));
    await expect(heading(page, "Friday smash")).toBeVisible();
  });

  test("Back keeps returning to the Ended session after a reload of the Stats", async ({
    page,
  }) => {
    const club = alphaClub();
    const { thursday, friday } = alphaSessions(club);
    await seedStorage(page, { clubs: [club], endedSessions: [thursday, friday] });

    await page.goto(`/sessions/${friday.id}`);
    await standings(page).getByRole("link", { name: "Stats for Bob" }).click();
    await expect(heading(page, "Stats")).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Bob" })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { level: 2, name: "Bob" })).toBeVisible();
    await back(page).click();
    await expect(page).toHaveURL(endsWith(`/sessions/${friday.id}`));
    await expect(heading(page, "Friday smash")).toBeVisible();
  });

  test("opened by its URL, it keeps its content after a reload, and Back goes to the Club's Past sessions", async ({
    page,
  }) => {
    const club = alphaClub();
    const { thursday, friday } = alphaSessions(club);
    await seedStorage(page, { clubs: [club], endedSessions: [thursday, friday] });

    await page.goto(statsPath(club.id, "cp-ann"));
    await expect(heading(page, "Stats")).toBeVisible();
    await expectAnnFigures(page);

    await page.reload();
    await expect(heading(page, "Stats")).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Ann" })).toBeVisible();
    await expectAnnFigures(page);
    await expect(sessionRows(page)).toHaveCount(2);

    await back(page).click();
    await expect(page).toHaveURL(endsWith(`/clubs/${club.id}/sessions`));
  });

  test("a Session row opens that Ended session, and Back returns to the Stats; a chart dot highlights its row", async ({
    page,
  }) => {
    const club = alphaClub();
    const { thursday, friday } = alphaSessions(club);
    await seedStorage(page, { clubs: [club], endedSessions: [thursday, friday] });
    await page.goto(statsPath(club.id, "cp-ann"));
    await expect(sessionRows(page)).toHaveCount(2);

    // The chart runs oldest to newest: the first dot is Thursday, which is the last row.
    await expect(dots(page)).toHaveCount(2);
    await dots(page).first().click();
    await expect(sessionRows(page).last()).toHaveAttribute("data-highlighted", "true");
    await expect(sessionRows(page).first()).not.toHaveAttribute("data-highlighted", "true");
    await dots(page).last().click();
    await expect(sessionRows(page).first()).toHaveAttribute("data-highlighted", "true");

    await sessionRows(page).last().click();
    await expect(page).toHaveURL(new RegExp(`/sessions/${thursday.id}`));
    await expect(heading(page, "Thursday ladder")).toBeVisible();

    await back(page).click();
    await expect(page).toHaveURL(endsWith(statsPath(club.id, "cp-ann")));
    await expect(heading(page, "Stats")).toBeVisible();
    await expectAnnFigures(page);
  });

  test("a Club player with no Ended sessions gets an empty state and can still go Back", async ({
    page,
  }) => {
    const club = alphaClub();
    await seedStorage(page, { clubs: [club], endedSessions: [] });
    await page.goto(statsPath(club.id, "cp-nobody"));
    await expect(heading(page, "Stats")).toBeVisible();
    await expect(page.getByText("No stats to show")).toBeVisible();
    await back(page).click();
    await expect(page).toHaveURL(endsWith(`/clubs/${club.id}/sessions`));
  });
});

test.describe("Standings links", () => {
  test("a Guest who wasn't saved to the Club is plain text, Club players are links", async ({
    page,
  }) => {
    const club = alphaClub();
    const { friday } = alphaSessions(club);
    await seedStorage(page, { clubs: [club], endedSessions: [friday] });
    await page.goto(`/sessions/${friday.id}`);
    await expect(heading(page, "Friday smash")).toBeVisible();

    const list = standings(page);
    for (const name of ["Ann", "Bob", "Cat", "Dan"]) {
      await expect(list.getByRole("link", { name: `Stats for ${name}` })).toBeVisible();
    }
    await expect(list.getByRole("listitem").filter({ hasText: "Gus" })).toBeVisible();
    await expect(list.getByRole("link", { name: /Gus/ })).toHaveCount(0);
  });

  test("an older Ended session without Club player ids, or one without a Club, has no links", async ({
    page,
  }) => {
    const club = alphaClub();
    const rows = [row(["Ann", "Bob"], ["Cat", "Dan"], [21, 10])];
    const older = endedOf(club, "Old night", 3, rows, ALPHA_IDS, true);
    const clubless = endedOf(null, "Open play", 2, rows, ALPHA_IDS);
    await seedStorage(page, { clubs: [club], endedSessions: [older, clubless] });

    for (const [ended, title] of [
      [older, "Old night"],
      [clubless, "Open play"],
    ] as const) {
      await page.goto(`/sessions/${ended.id}`);
      await expect(heading(page, title)).toBeVisible();
      await expect(standings(page).getByRole("listitem")).toHaveCount(4);
      await expect(standings(page).getByRole("link")).toHaveCount(0);
    }
  });
});

test.describe("Account view", () => {
  const ROY = { accountId: "roy-7k3f", name: "Roy Smith" };

  test("Your stats on the Account page combines the Clubs Roy is linked in; Back returns to the Account page", async ({
    page,
  }) => {
    const alpha = makeClub({
      name: "Alpha Club",
      players: [
        {
          id: "cp-roy-a",
          name: "Roy",
          skill: "intermediate",
          link: { accountId: ROY.accountId, role: "player" },
        },
        { id: "cp-ann", name: "Ann", skill: "intermediate" },
        { id: "cp-cat", name: "Cat", skill: "intermediate" },
        { id: "cp-dan", name: "Dan", skill: "intermediate" },
      ],
    });
    const bravo = makeClub({
      name: "Bravo Club",
      players: [
        {
          id: "cp-roy-b",
          name: "Roy",
          skill: "intermediate",
          link: { accountId: ROY.accountId, role: "player" },
        },
        { id: "cp-eve", name: "Eve", skill: "intermediate" },
        { id: "cp-fay", name: "Fay", skill: "intermediate" },
        { id: "cp-gus", name: "Gus", skill: "intermediate" },
      ],
    });
    // Alpha: Roy wins 2 of 2 (with Ann). Bravo: Roy wins 1, loses 1, one unscored (with Eve).
    const inAlpha = endedOf(
      alpha,
      "Alpha night",
      2,
      [
        row(["Roy", "Ann"], ["Cat", "Dan"], [21, 10]),
        row(["Roy", "Ann"], ["Cat", "Dan"], [21, 12]),
      ],
      { Roy: "cp-roy-a", Ann: "cp-ann", Cat: "cp-cat", Dan: "cp-dan" },
    );
    const inBravo = endedOf(
      bravo,
      "Bravo night",
      1,
      [
        row(["Roy", "Eve"], ["Fay", "Gus"], [21, 19]),
        row(["Roy", "Eve"], ["Fay", "Gus"], [17, 21]),
        row(["Roy", "Eve"], ["Fay", "Gus"], null),
      ],
      { Roy: "cp-roy-b", Eve: "cp-eve", Fay: "cp-fay", Gus: "cp-gus" },
    );
    await seedStorage(page, {
      account: ROY,
      clubs: [alpha, bravo],
      endedSessions: [inAlpha, inBravo],
    });

    await page.goto("/account");
    await expect(heading(page, "Account")).toBeVisible();
    await page.getByRole("link", { name: "Your stats" }).click();

    await expect(page).toHaveURL(endsWith("/account/stats"));
    await expect(heading(page, "Your stats")).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Roy Smith" })).toBeVisible();
    // 5 matches, 3 wins, 1 loss, 75%, 2 sessions: both Clubs together.
    await expect(headline(page, "Matches")).toHaveText("5");
    await expect(headline(page, "Wins")).toHaveText("3");
    await expect(headline(page, "Losses")).toHaveText("1");
    await expect(headline(page, "Win rate")).toHaveText("75%");
    await expect(headline(page, "Sessions")).toHaveText("2");
    // With more than one Club, the rows and Partners say which Club they are in.
    await expect(sessionRows(page)).toHaveCount(2);
    await expect(sessionRows(page).first()).toHaveAccessibleName(/Bravo Club/);
    await expect(sessionRows(page).last()).toHaveAccessibleName(/Alpha Club/);
    await expect(partner(page, "Most frequent")).toContainText("Eve");
    await expect(partner(page, "Most frequent")).toContainText("Bravo Club");

    await back(page).click();
    await expect(page).toHaveURL(endsWith("/account"));
    await expect(heading(page, "Account")).toBeVisible();
  });

  test("without an Account, it sends you to the Account page", async ({ page }) => {
    await page.goto("/account/stats");
    await expect(page).toHaveURL(endsWith("/account"));
    await expect(heading(page, "Account")).toBeVisible();
  });

  test("with no Club player linked to the Account, it says stats come once an Organizer links you", async ({
    page,
  }) => {
    const club = alphaClub();
    const { friday } = alphaSessions(club);
    await seedStorage(page, { account: ROY, clubs: [club], endedSessions: [friday] });
    await page.goto("/account/stats");
    await expect(heading(page, "Your stats")).toBeVisible();
    await expect(page.getByText(/once an Organizer adds you/)).toBeVisible();
    await expect(page.locator("dt", { hasText: "Matches" })).toHaveCount(0);
  });
});
