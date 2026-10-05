import { expect, test } from "@playwright/test";
import type { Account, Club } from "../src/domain/types.ts";
import {
  makeClub,
  makeEndedSessionFromMatches,
  readFakeAccount,
  readFakeClubs,
  readStoredData,
  seedStorage,
} from "./fixtures.ts";

const roy: Account = { accountId: "roy-7k3f", name: "Roy Smith" };
const ana: Account = { accountId: "ana-2222", name: "Ana Bell" };

const row = (id: string, name: string, who?: Account, role: "organizer" | "player" = "player") => ({
  id,
  name,
  skill: "intermediate" as const,
  ...(who ? { link: { accountId: who.accountId, role } } : {}),
});

test.describe("Delete Account", () => {
  test("alone on a Shared club, with a Local club too: the dialog lists the Shared club, and after it the device is signed out with the Local club kept", async ({
    page,
  }) => {
    const solo: Club = makeClub({
      id: "club-solo",
      name: "Solo Club",
      kind: "shared",
      players: [row("p-roy", "Roy Smith", roy, "organizer"), row("p-cat", "Cat")],
    });
    const garage = makeClub({ id: "club-garage", name: "Garage", kind: "local", players: [] });
    const night = makeEndedSessionFromMatches(
      [{ a: ["Ana", "Ben"], b: ["Cat", "Dan"], score: [21, 15] }],
      { name: "Solo night", clubId: solo.id, clubName: solo.name },
    );
    await seedStorage(page, {
      account: roy,
      clubs: [garage],
      sharedClubs: [solo],
      sharedEndedSessions: [night],
    });
    await page.goto("/account");

    await page.getByRole("button", { name: "Delete Account" }).click();
    const dialog = page.getByRole("dialog", { name: "Delete your Account?" });
    await expect(dialog).toContainText("These shared clubs will be deleted:");
    await expect(dialog).toContainText("Solo Club and its 1 past session");
    await expect(dialog).toContainText("Your local clubs and the sessions on this device stay.");
    await dialog.getByRole("button", { name: "Delete Account" }).click();

    // Home, signed out: the default avatar, the Local club, no Shared club.
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("link", { name: "Account settings, no Account" })).toBeVisible();
    expect(await readFakeAccount(page)).toBeNull();
    expect(await readFakeClubs(page)).toEqual([]);
    expect(await readStoredData<Club[]>(page, "sharedClubs")).toEqual([]);
    await page.goto("/clubs");
    await expect(page.getByRole("link", { name: /Garage/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Solo Club/ })).toHaveCount(0);
    // The Account ID stays reserved on the "server".
    const reserved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("bq:fake:account-ids") ?? "[]"),
    );
    expect(reserved).toContain(roy.accountId);
  });

  test("the only Organizer of a Club with a Player: deleting is blocked and names the Club", async ({
    page,
  }) => {
    const stuck: Club = makeClub({
      id: "club-stuck",
      name: "Stuck Club",
      kind: "shared",
      players: [row("p-roy", "Roy Smith", roy, "organizer"), row("p-ana", "Ana Bell", ana)],
    });
    await seedStorage(page, { account: roy, otherAccounts: [ana], sharedClubs: [stuck] });
    await page.goto("/account");

    await expect(page.getByRole("button", { name: "Delete Account" })).toBeDisabled();
    await expect(page.getByText("You're the only Organizer of:")).toBeVisible();
    await expect(page.getByText("Stuck Club", { exact: true })).toBeVisible();
    await expect(page.getByText("Make someone else an Organizer first.")).toBeVisible();
  });

  test("offline it says it needs a connection", async ({ page, context }) => {
    await seedStorage(page, { account: roy });
    await page.goto("/account");
    await expect(page.getByRole("button", { name: "Delete Account" })).toBeEnabled();

    await context.setOffline(true);

    await expect(page.getByRole("button", { name: "Delete Account" })).toBeDisabled();
    await expect(
      page.getByText("You're offline. Deleting your Account needs a connection."),
    ).toBeVisible();
  });
});
