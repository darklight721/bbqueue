import { expect, test } from "@playwright/test";
import { makeEndedSessionFromMatches } from "../fixtures.ts";
import { seedSharedEndedSession, uniqueId } from "./emulator.ts";
import { twoPeople } from "./sessions.ts";

// Roy is an Organizer of a Shared club and Ana a Player. The Club has one Ended session on the
// server, in which Roy and Ana partnered twice (one win, one loss). Ana, a Player, opens Roy's
// Stats from its Standings: anyone who can open the Ended session can open the Club view.

const ROW_IDS: Record<string, string> = {
  "Roy Smith": "p-roy",
  "Ana Bell": "p-ana",
  Cat: "p-cat",
  Dan: "p-dan",
};

test.describe("Stats of a Shared club", () => {
  test("a Player on another device opens a Club player's Stats from the Ended session's Standings", async ({
    page,
    browser,
    baseURL,
  }) => {
    const { club, anaPage, roy } = await twoPeople(page, browser, baseURL);
    const ended = makeEndedSessionFromMatches(
      [
        { a: ["Roy Smith", "Ana Bell"], b: ["Cat", "Dan"], score: [21, 15] },
        { a: ["Roy Smith", "Ana Bell"], b: ["Cat", "Dan"], score: [15, 21] },
      ],
      {
        id: uniqueId("ended"),
        name: "Thursday night",
        clubId: club.id,
        clubName: club.name,
        startedAt: Date.now() - 3 * 3_600_000,
        endedAt: Date.now() - 3_600_000,
      },
    );
    ended.players = ended.players.map((player) => ({
      ...player,
      clubPlayerId: ROW_IDS[player.name] ?? null,
    }));
    await seedSharedEndedSession(club.id, ended, roy.accountId);

    // Past sessions → the session, once the server's copy has reached Ana's device.
    await anaPage.goto("/sessions");
    await anaPage.getByRole("link", { name: /Thursday night/ }).click();
    await expect(anaPage.getByRole("heading", { level: 1, name: "Thursday night" })).toBeVisible();

    await anaPage
      .getByRole("list", { name: "Standings" })
      .getByRole("link", { name: "Stats for Roy Smith" })
      .click();

    await expect(anaPage).toHaveURL(new RegExp(`/clubs/${club.id}/players/p-roy/stats`));
    await expect(anaPage.getByRole("heading", { level: 1, name: "Stats" })).toBeVisible();
    await expect(anaPage.getByRole("heading", { level: 2, name: "Roy Smith" })).toBeVisible();
    await expect(anaPage.getByText(club.name).first()).toBeVisible();
    const figure = (label: string) =>
      anaPage.locator("dt", { hasText: label }).locator("xpath=following-sibling::dd");
    await expect(figure("Matches")).toHaveText("2");
    await expect(figure("Wins")).toHaveText("1");
    await expect(figure("Losses")).toHaveText("1");
    await expect(figure("Win rate")).toHaveText("50%");
    await expect(figure("Sessions")).toHaveText("1");
    await expect(anaPage.getByRole("article", { name: "Most frequent partner" })).toContainText(
      "Ana Bell",
    );

    await anaPage.getByRole("button", { name: "Back" }).click();
    await expect(anaPage).toHaveURL(new RegExp(`/sessions/${ended.id}$`));
    await expect(anaPage.getByRole("heading", { level: 1, name: "Thursday night" })).toBeVisible();

    await anaPage.context().close();
  });
});
