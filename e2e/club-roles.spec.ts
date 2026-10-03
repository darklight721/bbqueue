import { expect, test, type Page } from "@playwright/test";
import type { Account, Club } from "../src/domain/types.ts";
import { makeClub, readFakeClubs, seedStorage } from "./fixtures.ts";

// One device on the local fake Backend. What a second person sees is in e2e/emulator/roles.spec.ts.

const roy: Account = { accountId: "roy-7k3f", name: "Roy Smith" };
const ana: Account = { accountId: "ana-2222", name: "Ana Bell" };

const club: Club = makeClub({
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
    { id: "p-cat", name: "Cat", skill: "beginner" },
  ],
});

const idField = (page: Page, who: string) =>
  page.getByRole("textbox", { name: new RegExp(`Account ID.* for ${who}`) });
const role = (page: Page, who: string) => page.getByRole("combobox", { name: `Role for ${who}` });

test.describe("Linking Accounts (one device)", () => {
  test.beforeEach(async ({ page }) => {
    await seedStorage(page, { account: roy, otherAccounts: [ana], sharedClubs: [club] });
    await page.goto("/clubs/shared-1");
    await expect(role(page, roy.name)).toHaveValue("organizer");
  });

  test("an Organizer links a Club player by Account ID in any capitalisation: ✓ Name, saved as Player", async ({
    page,
  }) => {
    await idField(page, "Cat").fill("ANA-2222");
    await expect(page.getByText("✓ Ana Bell")).toBeVisible();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/clubs$/);

    const [saved] = await readFakeClubs(page);
    expect(saved?.players.find((p) => p.id === "p-cat")?.link).toEqual({
      accountId: "ana-2222",
      role: "player",
    });

    await page.getByRole("link", { name: /Tuesday/ }).click();
    await expect(role(page, "Cat")).toHaveValue("player");
  });

  test("an unknown or already-linked Account ID is rejected", async ({ page }) => {
    await idField(page, "Cat").fill("nobody-abcd");
    await expect(page.getByText("No Account has that Account ID.")).toBeVisible();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Fix the highlighted fields to save.")).toBeVisible();
    await expect(page).toHaveURL(/\/clubs\/shared-1$/);

    await idField(page, "Cat").fill("Roy-7K3F");
    await expect(page.getByText("That Account is already on this roster.")).toBeVisible();
  });

  test("the last Organizer can't demote themselves, and can't leave", async ({ page }) => {
    await role(page, roy.name).selectOption("player");

    await expect(page.getByRole("alert")).toContainText("A Club needs at least one Organizer.");
    await expect(role(page, roy.name)).toHaveValue("organizer");
    await expect(page.getByRole("button", { name: "Remove Roy Smith" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Leave club" })).toBeDisabled();
    await expect(page.getByText(/You're the only Organizer/)).toBeVisible();
  });

  test("offline: Account IDs and Roles are turned off, with the reason", async ({
    page,
    context,
  }) => {
    await context.setOffline(true);

    await expect(idField(page, "Cat")).toBeDisabled();
    await expect(role(page, roy.name)).toBeDisabled();
    await expect(
      page.getByText("You're offline. Linking Accounts and changing Roles need a connection."),
    ).toBeVisible();
  });
});

test("Organizers can unlink an Account that no longer exists", async ({ page }) => {
  const haunted: Club = makeClub({
    id: "shared-2",
    name: "Haunted",
    kind: "shared",
    players: [
      {
        id: "p-roy",
        name: roy.name,
        skill: "intermediate",
        link: { accountId: roy.accountId, role: "organizer" },
      },
      {
        id: "p-gus",
        name: "Gus",
        skill: "beginner",
        link: { accountId: "ghost-abcd", role: "player" },
      },
    ],
  });
  await seedStorage(page, { account: roy, sharedClubs: [haunted] });
  await page.goto("/clubs/shared-2");

  await expect(page.getByText("This Account no longer exists.")).toBeVisible();
  await page.getByRole("button", { name: "Unlink Gus" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/clubs$/);

  const [saved] = await readFakeClubs(page);
  expect(saved?.players.find((p) => p.id === "p-gus")).toEqual({
    id: "p-gus",
    name: "Gus",
    skill: "beginner",
  });
});

test("a Player sees a read-only Club with You on their row and no Account IDs, and can leave", async ({
  page,
}) => {
  const theirs: Club = makeClub({
    id: "shared-3",
    name: "Thursday",
    kind: "shared",
    players: [
      {
        id: "p-roy",
        name: roy.name,
        skill: "intermediate",
        link: { accountId: roy.accountId, role: "organizer" },
      },
      {
        id: "p-ana",
        name: ana.name,
        skill: "beginner",
        link: { accountId: ana.accountId, role: "player" },
      },
    ],
  });
  await seedStorage(page, { account: ana, otherAccounts: [roy], sharedClubs: [theirs] });
  await page.goto("/clubs");
  await page.getByRole("link", { name: /Thursday/ }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Thursday" })).toBeVisible();
  await expect(page.getByText("You", { exact: true })).toHaveCount(1);
  await expect(page.getByText(roy.accountId)).toHaveCount(0);
  await expect(page.getByText(ana.accountId)).toHaveCount(0);
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);

  await page.getByRole("button", { name: "Leave club" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Leave club" }).click();

  await expect(page).toHaveURL(/\/clubs$/);
  await expect(page.getByRole("link", { name: /Thursday/ })).toHaveCount(0);
  const [stays] = await readFakeClubs(page);
  expect(stays?.players.find((p) => p.id === "p-ana")).toEqual({
    id: "p-ana",
    name: "Ana Bell",
    skill: "beginner",
  });
});
