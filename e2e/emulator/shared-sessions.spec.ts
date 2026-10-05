import { expect, test, type Browser, type Page } from "@playwright/test";
import type { Club } from "../../src/domain/types.ts";
import { court, openScoreDialog } from "../session-helpers.ts";
import { seedSharedClub, signUp, uniqueId } from "./emulator.ts";

// Two people on the Firebase emulators: Roy (Organizer, and Session host) and Ana (a Player).

/** Roy runs a new Shared club with Ana as a Player and three more on the roster. */
async function twoPeople(page: Page, browser: Browser, baseURL: string | undefined) {
  const roy = await signUp(page, "Roy Smith");
  const anaPage = await (await browser.newContext({ baseURL })).newPage();
  const ana = await signUp(anaPage, "Ana Bell");
  const club: Club = {
    id: uniqueId("shared"),
    name: uniqueId("Riverside"),
    kind: "shared",
    players: [
      {
        id: "p-roy",
        name: "Roy Smith",
        skill: "intermediate",
        link: { accountId: roy.accountId, role: "organizer" },
      },
      {
        id: "p-ana",
        name: "Ana Bell",
        skill: "beginner",
        link: { accountId: ana.accountId, role: "player" },
      },
      { id: "p-cat", name: "Cat", skill: "advanced" },
      { id: "p-dan", name: "Dan", skill: "intermediate" },
      { id: "p-eve", name: "Eve", skill: "beginner" },
    ],
  };
  await seedSharedClub(club);
  return { club, anaPage };
}

/** Roy starts a Session for the Club from its Club screen. */
async function startSession(page: Page, club: Club) {
  await page.goto("/clubs");
  await page.getByRole("link", { name: new RegExp(club.name) }).click();
  await page.getByRole("link", { name: "New session" }).click();
  await page.getByRole("textbox", { name: "Session name" }).fill("Thursday night");
  await page.getByRole("button", { name: "Select all" }).click();
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page).toHaveURL(/\/sessions\/(?!new)[^/]+$/);
  await expect(page.getByRole("heading", { level: 1, name: "Thursday night" })).toBeVisible();
}

/** Ana opens the Session from Home. */
async function watchFromHome(anaPage: Page) {
  await anaPage.goto("/");
  const view = anaPage.getByRole("link", { name: "View session" });
  await expect(view).toBeVisible({ timeout: 20_000 });
  await expect(view).toContainText("Host: Roy Smith");
  await view.click();
  await expect(anaPage.getByText("Watching. Roy Smith runs this session.")).toBeVisible();
}

async function endMatchWithoutScore(page: Page) {
  const dialog = await openScoreDialog(page, 1);
  await dialog.getByRole("button", { name: "End without score" }).click();
  await expect(court(page, 1).getByText("Idle", { exact: true })).toBeVisible();
}

test.describe("Shared active session between two people", () => {
  test("the Player sees the host's Session on Home, opens it, and watches a Match start live, with nothing to change it", async ({
    page,
    browser,
    baseURL,
  }) => {
    const { club, anaPage } = await twoPeople(page, browser, baseURL);

    await startSession(page, club);
    await watchFromHome(anaPage);

    // Read-only: the same Courts and Lineup, no controls.
    await expect(court(anaPage, 1).getByText("Idle", { exact: true })).toBeVisible();
    await expect(court(anaPage, 1).getByText("Lineup", { exact: true })).toBeVisible();
    for (const name of [
      /Start match/,
      /Rehash/,
      /Add court/,
      /Add queue/,
      /Sit out/,
      /End session/,
    ]) {
      await expect(anaPage.getByRole("button", { name })).toHaveCount(0);
    }

    // The host starts a Match; the Player sees it without doing anything.
    await court(page, 1).getByRole("button", { name: "Start match" }).click();
    await expect(court(page, 1).getByText("Playing", { exact: true })).toBeVisible();
    await expect(court(anaPage, 1).getByText("Playing", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(anaPage.getByRole("button", { name: /End match|Remove match/ })).toHaveCount(0);

    await endMatchWithoutScore(page);
    await expect(court(anaPage, 1).getByText("Idle", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(anaPage.getByText("1 match", { exact: true })).toBeVisible();

    // The Club screen, too, offers Roy the running Session instead of a second one.
    await page.goto("/clubs");
    await page.getByRole("link", { name: new RegExp(club.name) }).click();
    await expect(page.getByRole("link", { name: "Open active session" })).toBeVisible();
    await expect(page.getByRole("link", { name: "New session" })).toHaveCount(0);

    await anaPage.context().close();
  });

  test("the host plays offline, and the Player catches up when the host is back online", async ({
    page,
    context,
    browser,
    baseURL,
  }) => {
    const { club, anaPage } = await twoPeople(page, browser, baseURL);
    await startSession(page, club);
    await watchFromHome(anaPage);
    await expect(anaPage.getByText("0 matches", { exact: true })).toBeVisible();

    // The host loses the connection and starts and ends a Match.
    await context.setOffline(true);
    await court(page, 1).getByRole("button", { name: "Start match" }).click();
    await expect(court(page, 1).getByText("Playing", { exact: true })).toBeVisible();
    await endMatchWithoutScore(page);
    await expect(page.getByText("1 match", { exact: true })).toBeVisible();
    await page.waitForTimeout(2000);
    // Meanwhile the Player's copy is as it was.
    await expect(anaPage.getByText("0 matches", { exact: true })).toBeVisible();

    await context.setOffline(false);
    await expect(anaPage.getByText("1 match", { exact: true })).toBeVisible({ timeout: 45_000 });

    await anaPage.context().close();
  });

  test("a Player who is offline sees the last copy and how old it is, then catches up", async ({
    page,
    browser,
    baseURL,
  }) => {
    const { club, anaPage } = await twoPeople(page, browser, baseURL);
    await startSession(page, club);
    await watchFromHome(anaPage);

    await anaPage.context().setOffline(true);
    await expect(
      anaPage.getByText(/You're offline\. Showing the last copy, updated/),
    ).toBeVisible();
    await expect(anaPage.getByText("Offline", { exact: true })).toBeVisible();

    await court(page, 1).getByRole("button", { name: "Start match" }).click();
    await expect(court(page, 1).getByText("Playing", { exact: true })).toBeVisible();
    await page.waitForTimeout(2500);
    await expect(court(anaPage, 1).getByText("Idle", { exact: true })).toBeVisible();

    await anaPage.context().setOffline(false);
    await expect(court(anaPage, 1).getByText("Playing", { exact: true })).toBeVisible({
      timeout: 45_000,
    });
    await expect(anaPage.getByText(/You're offline/)).toHaveCount(0);
    await expect(anaPage.getByText("Live", { exact: true })).toBeVisible();

    await anaPage.context().close();
  });

  test("when the host ends the Session, the Player is sent Home with a notice and the Session is gone", async ({
    page,
    browser,
    baseURL,
  }) => {
    const { club, anaPage } = await twoPeople(page, browser, baseURL);
    await startSession(page, club);
    await watchFromHome(anaPage);
    await court(page, 1).getByRole("button", { name: "Start match" }).click();
    await endMatchWithoutScore(page);

    await page.getByRole("button", { name: "End session" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "End session" }).click();
    await expect(page).toHaveURL(/\/sessions\/[^/]+\/summary$/);

    await expect(anaPage).toHaveURL(/\/$/, { timeout: 20_000 });
    await expect(anaPage.getByText("'Thursday night' has ended.")).toBeVisible();
    await expect(anaPage.getByRole("link", { name: "View session" })).toHaveCount(0);

    await anaPage.context().close();
  });
});
