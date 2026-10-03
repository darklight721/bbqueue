import { expect, test, type Page } from "@playwright/test";
import {
  FAKE_BACKEND_KEYS,
  makeClub,
  readFakeClubs,
  readFakePendingClubOps,
  readStoredData,
  seedStorage,
} from "./fixtures.ts";
import type { Account, Club } from "../src/domain/types.ts";

const roy: Account = { accountId: "roy-7k3f", name: "Roy Smith" };

const playerNames = (page: Page) =>
  page
    .getByRole("textbox", { name: "Player name" })
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));

async function createClub(page: Page, name: string) {
  await page.goto("/clubs/new");
  await page.getByRole("textbox", { name: "Club name" }).fill(name);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/clubs$/);
}

test.describe("Shared clubs", () => {
  test("signed in: a new Club has me as Organizer on the roster, and survives a reload", async ({
    page,
  }) => {
    await seedStorage(page, { account: roy });
    await createClub(page, "Tuesday");

    const row = page.getByRole("link", { name: /Tuesday/ });
    await expect(row).toBeVisible();
    await expect(row).not.toContainText("This device only");

    await row.click();
    await expect.poll(() => playerNames(page)).toEqual(["Roy Smith"]);
    await expect(page.getByRole("combobox", { name: "Skill level for Roy Smith" })).toHaveValue(
      "intermediate",
    );

    const [shared] = await readFakeClubs(page);
    expect(shared).toMatchObject({ name: "Tuesday" });
    expect(shared?.players[0]?.link).toEqual({ accountId: roy.accountId, role: "organizer" });
    expect(await readStoredData<Club[]>(page, "clubs")).toBeNull();

    await page.reload();
    await expect.poll(() => playerNames(page)).toEqual(["Roy Smith"]);
    await page.goto("/clubs");
    await expect(page.getByRole("link", { name: /Tuesday/ })).toBeVisible();
  });

  test("signed out: a new Club is labelled This device only, and stays Local after signing up", async ({
    page,
  }) => {
    await createClub(page, "Tuesday");
    const row = page.getByRole("link", { name: /Tuesday/ });
    await expect(row).toContainText("This device only");
    expect(await readFakeClubs(page)).toEqual([]);
    expect(await readStoredData<Club[]>(page, "clubs")).toMatchObject([
      { name: "Tuesday", kind: "local" },
    ]);

    // Sign up (the Account screens come later): the device now has an Account.
    await page.evaluate(
      ([fakeKey, appKey, account]) => {
        localStorage.setItem(fakeKey!, account!);
        localStorage.setItem(appKey!, JSON.stringify({ version: 1, data: JSON.parse(account!) }));
      },
      [FAKE_BACKEND_KEYS.account, "bq:v1:account", JSON.stringify(roy)],
    );
    await page.reload();

    await expect(page.getByRole("link", { name: /Tuesday/ })).toContainText("This device only");
    await page.getByRole("link", { name: /Tuesday/ }).click();
    await expect(page.getByText("This device only")).toBeVisible();

    // A Club made now is Shared, next to the Local one.
    await createClub(page, "Friday");
    await expect(page.getByRole("link", { name: /Friday/ })).not.toContainText("This device only");
    await expect(page.getByRole("link", { name: /Tuesday/ })).toContainText("This device only");
  });

  test("offline: Skill level edits save and sync later, and adding a player is turned off", async ({
    page,
    context,
  }) => {
    const club = makeClub({
      id: "shared-1",
      name: "Tuesday",
      kind: "shared",
      players: [
        {
          id: "p-roy",
          name: roy.name,
          skill: "intermediate",
          link: { accountId: roy.accountId, role: "organizer" },
        },
        { id: "p-ana", name: "Ana", skill: "beginner" },
      ],
    });
    await seedStorage(page, { account: roy, sharedClubs: [club] });
    await page.goto("/clubs/shared-1");
    await expect.poll(() => playerNames(page)).toEqual(["Ana", "Roy Smith"]);
    await expect(page.getByRole("button", { name: "Add player" })).toBeEnabled();

    await context.setOffline(true);
    await expect(page.getByRole("button", { name: "Add player" })).toBeDisabled();
    await expect(
      page.getByText("You're offline. Adding players needs a connection."),
    ).toBeVisible();

    await page.getByRole("combobox", { name: "Skill level for Ana" }).selectOption("advanced");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/clubs$/);

    // Waiting for the connection: not on the "server" yet, but this device already shows it.
    expect(await readFakePendingClubOps(page)).toHaveLength(1);
    expect((await readFakeClubs(page))[0]?.players.find((p) => p.id === "p-ana")?.skill).toBe(
      "beginner",
    );
    await page.getByRole("link", { name: /Tuesday/ }).click();
    await expect(page.getByRole("combobox", { name: "Skill level for Ana" })).toHaveValue(
      "advanced",
    );

    await context.setOffline(false);
    await expect.poll(() => readFakePendingClubOps(page)).toEqual([]);
    const synced = await readFakeClubs(page);
    expect(synced[0]?.players.find((p) => p.id === "p-ana")?.skill).toBe("advanced");
  });
});
