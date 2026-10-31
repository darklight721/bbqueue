import { expect, test } from "@playwright/test";
import { court } from "../session-helpers.ts";
import { endMatchWithoutScore, startSession, twoPeople, watchFromHome } from "./sessions.ts";

// Two people on the Firebase emulators: Roy (Organizer, and Session host) and Ana (a Player).

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
    await expect(court(anaPage, 1).getByText("Playing", { exact: true })).toBeVisible();
    await expect(anaPage.getByRole("button", { name: /End match|Remove match/ })).toHaveCount(0);

    await endMatchWithoutScore(page);
    await expect(court(anaPage, 1).getByText("Idle", { exact: true })).toBeVisible();
    await expect(anaPage.getByText("1 match", { exact: true })).toBeVisible();

    // The Club screen, too, offers Roy the running Session instead of a second one.
    await page.goto("/clubs");
    await page.getByRole("link", { name: new RegExp(club.name) }).click();
    await expect(page.getByRole("link", { name: "Open active session" })).toBeVisible();
    await expect(page.getByRole("link", { name: "New session" })).toHaveCount(0);

    await anaPage.context().close();
  });

  test("the Player sees the same Up next as the host, with their own row marked You", async ({
    page,
    browser,
    baseURL,
  }) => {
    const { club, anaPage } = await twoPeople(page, browser, baseURL);
    await startSession(page, club);
    await watchFromHome(anaPage);

    // Roy hand-queues everyone but Ana onto Court 1, so Ana is the one left free.
    await page.getByRole("button", { name: "Add queue" }).click();
    const q = page.getByRole("region", { name: "Queue 1", exact: true });
    const spots = ["Team A, spot 1", "Team A, spot 2", "Team B, spot 1", "Team B, spot 2"];
    for (const [index, name] of ["Roy Smith", "Cat", "Dan", "Eve"].entries()) {
      await q.getByRole("button", { name: `Pick player for ${spots[index]}` }).click();
      const picker = page.getByRole("dialog", { name: "Pick a player" });
      await picker.getByRole("button", { name, exact: true }).click();
      await expect(picker).toBeHidden();
    }
    await q
      .getByRole("group", { name: "Move to court" })
      .getByRole("button", { name: "Court 1 · Idle", exact: true })
      .click();
    await expect(court(page, 1).getByText("Playing", { exact: true })).toBeVisible();

    for (const viewer of [page, anaPage]) {
      const upNext = viewer.getByRole("region", { name: "Up next", exact: true });
      await expect(upNext.getByRole("listitem")).toHaveCount(1);
      await expect(upNext.getByRole("listitem")).toContainText("Ana Bell");
      await expect(
        upNext.getByText("The rest will come from whoever comes off court."),
      ).toBeVisible();
    }
    const anaUpNext = anaPage.getByRole("region", { name: "Up next", exact: true });
    await expect(anaUpNext.getByText("You", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Up next", exact: true }).getByText("You", { exact: true }),
    ).toHaveCount(0);
    await expect(anaPage.getByRole("button", { name: "Queue these four" })).toHaveCount(0);

    await anaPage.context().close();
  });

  test("the Spare players icon shows for the host, not for the Player watching", async ({
    page,
    browser,
    baseURL,
  }) => {
    // 5 players on the default 1 Court: 1 Spare player.
    const { club, anaPage } = await twoPeople(page, browser, baseURL);
    await startSession(page, club);
    await watchFromHome(anaPage);

    const hostIcon = page.getByRole("button", { name: "Few spare players" });
    await expect(hostIcon).toBeVisible();
    await hostIcon.click();
    await expect(page.getByRole("note", { name: "Few spare players" })).toContainText(
      "5 players on 1 court",
    );

    // The Player has the same Session in front of them, with the Courts loaded, but no icon.
    await expect(court(anaPage, 1).getByText("Lineup", { exact: true })).toBeVisible();
    await expect(anaPage.getByRole("button", { name: "Few spare players" })).toHaveCount(0);
    await expect(anaPage.getByRole("note", { name: "Few spare players" })).toHaveCount(0);
    await expect(anaPage.getByText(/players on 1 court/)).toHaveCount(0);

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

    await expect(anaPage).toHaveURL(/\/$/);
    await expect(anaPage.getByText("'Thursday night' has ended.")).toBeVisible();
    await expect(anaPage.getByRole("link", { name: "View session" })).toHaveCount(0);

    await anaPage.context().close();
  });
});
