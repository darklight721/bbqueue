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

const role = (page: Page, who: string) => page.getByRole("combobox", { name: `Role for ${who}` });
const catField = (page: Page) => page.getByRole("textbox", { name: "Player name" }).nth(0);

test.describe("Linking Accounts (one device)", () => {
  test.beforeEach(async ({ page }) => {
    await seedStorage(page, { account: roy, otherAccounts: [ana], sharedClubs: [club] });
    await page.goto("/clubs/shared-1");
    await expect(role(page, roy.name)).toHaveValue("organizer");
    // Rows are sorted by name: Cat first.
    await expect(catField(page)).toHaveValue("Cat");
  });

  test("an Organizer types @Account ID in any capitalisation in a name: the Account's name replaces it, saved as Player", async ({
    page,
  }) => {
    await expect(catField(page)).toHaveAttribute("placeholder", "Name or @Account ID");
    await catField(page).fill("@ANA-2222");
    await expect(page.getByText("ana-2222", { exact: true })).toBeVisible();
    await expect(catField(page)).toHaveValue("Ana Bell");
    await expect(catField(page)).toBeFocused();
    await expect(role(page, "Ana Bell")).toHaveValue("player");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/clubs$/);

    const [saved] = await readFakeClubs(page);
    expect(saved?.players.find((p) => p.id === "p-cat")).toEqual({
      id: "p-cat",
      name: "Ana Bell",
      skill: "beginner",
      link: { accountId: "ana-2222", role: "player" },
    });

    await page.getByRole("link", { name: /Tuesday/ }).click();
    await expect(role(page, "Ana Bell")).toHaveValue("player");
    await expect(page.getByText("ana-2222", { exact: true })).toBeVisible();
  });

  test("an unknown or already-linked Account ID is rejected under the field", async ({ page }) => {
    await catField(page).fill("@nobody-abcd");
    await expect(page.getByText("No Account has that Account ID.")).toBeVisible();
    await expect(catField(page)).toHaveAttribute("aria-invalid", "true");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Fix the highlighted fields to save.")).toBeVisible();
    await expect(page.getByText("Enter a name")).toHaveCount(0);
    await expect(page).toHaveURL(/\/clubs\/shared-1$/);

    await catField(page).fill("@Roy-7K3F");
    await expect(page.getByText("That Account is already on this roster.")).toBeVisible();
  });

  test("Unlink takes back a link that isn't saved yet, and clears the name", async ({ page }) => {
    await catField(page).fill("@ana-2222");
    await expect(catField(page)).toHaveValue("Ana Bell");
    await page.getByRole("button", { name: "Unlink Ana Bell" }).click();

    await expect(catField(page)).toHaveValue("");
    await expect(catField(page)).toBeFocused();
    await expect(page.getByText("ana-2222", { exact: true })).toHaveCount(0);
    await catField(page).fill("Cat");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/clubs$/);
    const [saved] = await readFakeClubs(page);
    expect(saved?.players.find((p) => p.id === "p-cat")?.link).toBeUndefined();
  });

  test("the Role sits right under the Skill level", async ({ page }) => {
    const skill = (await page
      .getByRole("combobox", { name: `Skill level for ${roy.name}` })
      .boundingBox())!;
    const roleBox = (await role(page, roy.name).boundingBox())!;
    expect(Math.abs(roleBox.x - skill.x)).toBeLessThan(1);
    expect(Math.abs(roleBox.width - skill.width)).toBeLessThan(1);
    expect(roleBox.y).toBeGreaterThan(skill.y + skill.height);
  });

  test("the last Organizer can't demote themselves, and can't leave", async ({ page }) => {
    await role(page, roy.name).selectOption("player");

    await expect(page.getByRole("alert")).toContainText("A Club needs at least one Organizer.");
    await expect(role(page, roy.name)).toHaveValue("organizer");
    await expect(page.getByRole("button", { name: "Remove Roy Smith" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Leave club" })).toBeDisabled();
    await expect(page.getByText(/You're the only Organizer/)).toBeVisible();
  });

  test("offline: linking and Roles are turned off, with the reason", async ({ page, context }) => {
    await context.setOffline(true);

    await expect(role(page, roy.name)).toBeDisabled();
    await expect(
      page.getByText("You're offline. Linking Accounts and changing Roles need a connection."),
    ).toBeVisible();
    await catField(page).fill("@ana-2222");
    await expect(page.getByText("Linking an Account needs a connection.")).toBeVisible();
  });
});

test.describe("Unlinking a live Account (one device)", () => {
  const withAna: Club = makeClub({
    id: "shared-4",
    name: "Wednesday",
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

  test.beforeEach(async ({ page }) => {
    await seedStorage(page, { account: roy, otherAccounts: [ana], sharedClubs: [withAna] });
    await page.goto("/clubs/shared-4");
    await expect(role(page, ana.name)).toHaveValue("player");
  });

  test("an Organizer's own row says You, and has no Unlink", async ({ page }) => {
    await expect(page.getByText(roy.accountId, { exact: true })).toBeVisible();
    await expect(page.getByText("You", { exact: true })).toHaveCount(1);
    await expect(page.getByRole("button", { name: `Unlink ${roy.name}` })).toHaveCount(0);
    await expect(page.getByRole("button", { name: `Unlink ${ana.name}` })).toBeVisible();
  });

  test("Unlink on a saved link, then Save: the row stays on the roster, unlinked, also after a reload", async ({
    page,
  }) => {
    await expect(page.getByText(ana.accountId, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: `Unlink ${ana.name}` }).click();

    // Nothing is saved until Save: the chip and the Role go from the screen.
    await expect(page.getByText(ana.accountId, { exact: true })).toHaveCount(0);
    await expect(role(page, ana.name)).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Player name" }).first()).toHaveValue(ana.name);
    expect((await readFakeClubs(page))[0]?.players.find((p) => p.id === "p-ana")?.link).toEqual({
      accountId: ana.accountId,
      role: "player",
    });

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/clubs$/);
    expect((await readFakeClubs(page))[0]?.players.find((p) => p.id === "p-ana")).toEqual({
      id: "p-ana",
      name: ana.name,
      skill: "beginner",
    });

    await page.goto("/clubs/shared-4");
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Player name" }).first()).toHaveValue(ana.name);
    await expect(page.getByText(ana.accountId, { exact: true })).toHaveCount(0);
    await expect(role(page, ana.name)).toHaveCount(0);
    await expect(page.getByRole("button", { name: `Unlink ${ana.name}` })).toHaveCount(0);
    // Roy's own row is untouched.
    await expect(role(page, roy.name)).toHaveValue("organizer");
  });

  test("offline, Unlink on a saved link is turned off", async ({ page, context }) => {
    await context.setOffline(true);

    await expect(page.getByRole("button", { name: `Unlink ${ana.name}` })).toBeDisabled();
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
