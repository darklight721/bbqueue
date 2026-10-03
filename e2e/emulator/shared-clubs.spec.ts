import { expect, test } from "@playwright/test";
import type { Club } from "../../src/domain/types.ts";
import { readServerClub, seedSharedClub, signUp, uniqueId } from "./emulator.ts";

test.describe("Shared clubs on the server", () => {
  test("a new Club reaches the server with the creator as Organizer, and is still there after a reload", async ({
    page,
  }) => {
    const roy = await signUp(page, "Roy Smith");
    const clubName = uniqueId("Tuesday");

    await page.goto("/clubs/new");
    await page.getByRole("textbox", { name: "Club name" }).fill(clubName);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/clubs$/);
    await expect(page.getByRole("link", { name: new RegExp(clubName) })).toBeVisible();

    await expect
      .poll(async () => {
        const url = await page
          .getByRole("link", { name: new RegExp(clubName) })
          .getAttribute("href");
        const club = await readServerClub(url!.split("/").at(-1)!);
        return club && { name: club.name, rows: club.players.map((p) => [p.name, p.link]) };
      })
      .toEqual({
        name: clubName,
        rows: [["Roy Smith", { accountId: roy.accountId, role: "organizer" }]],
      });

    await page.reload();
    await expect(page.getByRole("link", { name: new RegExp(clubName) })).toBeVisible();
  });

  test("an offline Skill level edit reaches the server and the other person when the connection is back", async ({
    page,
    context,
    browser,
    baseURL,
  }) => {
    // Two people: Roy (Organizer, this page) and Ana (a Player in the same Club, in her own context).
    const roy = await signUp(page, "Roy Smith");
    const anaPage = await (await browser.newContext({ baseURL })).newPage();
    const ana = await signUp(anaPage, "Ana Bell");

    const clubId = uniqueId("shared");
    const club: Club = {
      id: clubId,
      name: "Tuesday",
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
        { id: "p-cat", name: "Cat", skill: "beginner" },
      ],
    };
    await seedSharedClub(club);

    // Both people see the Club straight away.
    await page.goto("/clubs");
    await expect(page.getByRole("link", { name: /Tuesday/ })).toBeVisible();
    await anaPage.goto(`/clubs/${clubId}`);
    // Ana is a Player: a read-only roster.
    const anaCat = anaPage.getByRole("listitem").filter({ hasText: "Cat" });
    await expect(anaCat).toContainText("Beginner");
    await expect(anaPage.getByRole("combobox")).toHaveCount(0);

    // Roy edits while offline.
    await page.goto(`/clubs/${clubId}`);
    await expect(page.getByRole("combobox", { name: "Skill level for Cat" })).toHaveValue(
      "beginner",
    );
    await context.setOffline(true);
    await expect(page.getByRole("button", { name: "Add player" })).toBeDisabled();
    await page.getByRole("combobox", { name: "Skill level for Cat" }).selectOption("advanced");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/clubs$/);

    // This device shows the change; the server and Ana don't have it yet.
    await page.getByRole("link", { name: /Tuesday/ }).click();
    await expect(page.getByRole("combobox", { name: "Skill level for Cat" })).toHaveValue(
      "advanced",
    );
    expect((await readServerClub(clubId))?.players.find((p) => p.id === "p-cat")?.skill).toBe(
      "beginner",
    );

    // Back online: it reaches the server, and Ana sees it live.
    await context.setOffline(false);
    await expect
      .poll(
        async () => (await readServerClub(clubId))?.players.find((p) => p.id === "p-cat")?.skill,
        {
          timeout: 30_000,
        },
      )
      .toBe("advanced");
    await expect(anaCat).toContainText("Advanced", { timeout: 15_000 });

    await anaPage.context().close();
  });
});
