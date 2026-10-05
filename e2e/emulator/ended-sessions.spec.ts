import { expect, test } from "@playwright/test";
import { court } from "../session-helpers.ts";
import { endMatchWithoutScore, startSession, twoPeople, watchFromHome } from "./sessions.ts";

// Roy hosts a Session for a Shared club and ends it; Ana, a Player, looks back on it.

test.describe("Ended sessions of a Shared club", () => {
  test("the host ends a Session with Matches: the Player finds it in Past sessions and the Club's sessions, and opens details and the summary", async ({
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

    // Ana is sent Home; the Active session is gone from her Home, and the Ended one is in Past sessions.
    await expect(anaPage).toHaveURL(/\/$/, { timeout: 20_000 });
    await expect(anaPage.getByRole("link", { name: "View session" })).toHaveCount(0);
    const past = anaPage.getByRole("link", { name: "Past sessions" });
    await expect(past).toBeVisible({ timeout: 20_000 });
    await past.click();
    await expect(anaPage.getByRole("link", { name: /Thursday night/ })).toBeVisible();

    // The Club's own list.
    await anaPage.goto("/clubs");
    await anaPage.getByRole("link", { name: new RegExp(club.name) }).click();
    await anaPage.getByRole("link", { name: /Sessions/ }).click();
    await anaPage.getByRole("link", { name: /Thursday night/ }).click();
    await expect(anaPage.getByRole("heading", { level: 1, name: "Thursday night" })).toBeVisible();
    await anaPage.getByRole("link", { name: "View summary" }).click();
    await expect(anaPage.getByRole("heading", { level: 1, name: "Session summary" })).toBeVisible();
    await expect(anaPage.getByText("Thursday night")).toBeVisible();

    // Roy's Home has no Active session either.
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Resume session" })).toHaveCount(0);

    await anaPage.context().close();
  });

  test("a Session the host ends while offline is published once the host is back online", async ({
    page,
    context,
    browser,
    baseURL,
  }) => {
    const { club, anaPage } = await twoPeople(page, browser, baseURL);
    await startSession(page, club);
    await watchFromHome(anaPage);
    await court(page, 1).getByRole("button", { name: "Start match" }).click();
    await endMatchWithoutScore(page);

    await context.setOffline(true);
    await page.getByRole("button", { name: "End session" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "End session" }).click();
    await expect(page).toHaveURL(/\/sessions\/[^/]+\/summary$/);
    // The host has it on the device at once; Ana hasn't heard.
    await page.waitForTimeout(2000);
    await expect(anaPage.getByText("Watching. Roy Smith runs this session.")).toBeVisible();

    await context.setOffline(false);
    await expect(anaPage).toHaveURL(/\/$/, { timeout: 45_000 });
    await anaPage.getByRole("link", { name: "Past sessions" }).click();
    await expect(anaPage.getByRole("link", { name: /Thursday night/ })).toBeVisible({
      timeout: 20_000,
    });

    await anaPage.context().close();
  });

  test("a Session ended without any Ended match leaves nothing in Past sessions", async ({
    page,
    browser,
    baseURL,
  }) => {
    const { club, anaPage } = await twoPeople(page, browser, baseURL);
    await startSession(page, club);
    await watchFromHome(anaPage);

    await page.getByRole("button", { name: "End session" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "End session" }).click();

    await expect(anaPage).toHaveURL(/\/$/, { timeout: 20_000 });
    await expect(anaPage.getByRole("link", { name: "View session" })).toHaveCount(0);
    await expect(anaPage.getByRole("link", { name: "Past sessions" })).toHaveCount(0);

    await anaPage.context().close();
  });
});
