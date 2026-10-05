import { expect, test, type Page } from "@playwright/test";
import { court, lineupOf, playersOf } from "../session-helpers.ts";
import { startSession, twoPeople, watchFromHome } from "./sessions.ts";

// Roy hosts; Ana is a Player who is also a Session player. Roy's Session has five players
// (Roy Smith, Ana Bell, Cat, Dan, Eve) on one Court, so a Lineup always leaves one out.

async function setUp(
  page: Page,
  browser: Parameters<typeof twoPeople>[1],
  baseURL: string | undefined,
) {
  const { club, anaPage } = await twoPeople(page, browser, baseURL);
  await startSession(page, club);
  await watchFromHome(anaPage);
  return { anaPage };
}

const hostRow = (page: Page, name: string) =>
  page
    .getByRole("list", { name: "Session players" })
    .getByRole("listitem")
    .filter({ hasText: name });

test.describe("Players ask the Session host", () => {
  test("a Player asks to sit out: Waiting for host, then applied, and the host's Lineups stop picking them; then back in", async ({
    page,
    browser,
    baseURL,
  }) => {
    const { anaPage } = await setUp(page, browser, baseURL);

    await anaPage.getByRole("button", { name: "Ask to sit out" }).click();
    await expect(anaPage.getByText("Waiting for host")).toBeVisible();

    // Applied: she is Sitting out, the waiting note goes, and the control now asks to come back.
    await expect(anaPage.getByRole("button", { name: "Ask to be back in" })).toBeVisible({
      timeout: 25_000,
    });
    await expect(anaPage.getByText("Waiting for host")).toHaveCount(0);
    await expect(anaPage.getByText("Sitting out", { exact: true })).toBeVisible();

    // The host's Lineup leaves her out, and the host sees her Sitting out.
    await expect(hostRow(page, "Ana Bell")).toContainText("Sitting out");
    expect(playersOf(await lineupOf(court(page, 1)))).not.toContain("Ana Bell");
    await expect(
      hostRow(page, "Ana Bell").getByRole("button", { name: "Back in Ana Bell" }),
    ).toBeVisible();

    // And back in again.
    await anaPage.getByRole("button", { name: "Ask to be back in" }).click();
    await expect(anaPage.getByText("Waiting for host")).toBeVisible();
    await expect(anaPage.getByRole("button", { name: "Ask to sit out" })).toBeVisible({
      timeout: 25_000,
    });
    await expect(hostRow(page, "Ana Bell")).not.toContainText("Sitting out");

    await anaPage.context().close();
  });

  test("a Player leaves: removed for the host, and the Player sees they've left with no way to rejoin; an Organizer can add them back", async ({
    page,
    browser,
    baseURL,
  }) => {
    const { anaPage } = await setUp(page, browser, baseURL);

    await anaPage.getByRole("button", { name: "Leave this session" }).click();
    await anaPage.getByRole("dialog").getByRole("button", { name: "Leave" }).click();
    await expect(anaPage.getByText("Waiting for host")).toBeVisible();

    await expect(
      anaPage.getByText("You left this session. An Organizer can add you back."),
    ).toBeVisible({ timeout: 25_000 });
    await expect(hostRow(page, "Ana Bell")).toHaveCount(0);
    await expect(anaPage.getByRole("button", { name: /Ask to|Leave this session/ })).toHaveCount(0);
    expect(playersOf(await lineupOf(court(page, 1)))).not.toContain("Ana Bell");

    // Only the Organizer can bring her back: adding her by name restores her.
    await page.getByRole("textbox", { name: "Player name" }).fill("Ana Bell");
    await page.getByRole("button", { name: "Add player" }).click();
    await expect(hostRow(page, "Ana Bell")).toBeVisible();
    await expect(anaPage.getByRole("button", { name: "Ask to sit out" })).toBeVisible({
      timeout: 25_000,
    });
    await expect(anaPage.getByText("You left this session.")).toHaveCount(0);

    await anaPage.context().close();
  });

  test("with the host offline the request keeps waiting, and is applied once the host reconnects", async ({
    page,
    context,
    browser,
    baseURL,
  }) => {
    const { anaPage } = await setUp(page, browser, baseURL);

    await context.setOffline(true);
    await anaPage.getByRole("button", { name: "Ask to sit out" }).click();
    await expect(anaPage.getByText("Waiting for host")).toBeVisible();
    await page.waitForTimeout(3000);
    await expect(anaPage.getByText("Waiting for host")).toBeVisible();
    await expect(anaPage.getByRole("button", { name: "Ask to be back in" })).toHaveCount(0);

    await context.setOffline(false);
    await expect(anaPage.getByRole("button", { name: "Ask to be back in" })).toBeVisible({
      timeout: 45_000,
    });
    await expect(anaPage.getByText("Waiting for host")).toHaveCount(0);
    await expect(hostRow(page, "Ana Bell")).toContainText("Sitting out");

    await anaPage.context().close();
  });
});
