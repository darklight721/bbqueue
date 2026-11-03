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

const cat = "Cat";
const role = (page: Page, who: string) => page.getByRole("radiogroup", { name: `Role for ${who}` });
/** One side of a Role pill: "Player" or "Organizer". */
const roleRadio = (page: Page, who: string, label: "Player" | "Organizer") =>
  role(page, who).getByRole("radio", { name: label });
const catField = (page: Page) => page.getByRole("textbox", { name: "Player name" }).nth(0);
const editPlayers = (page: Page) => page.getByRole("link", { name: "Edit players" }).click();
/** Saved: off Edit players, back on the Club page. */
const expectSaved = async (page: Page, clubId: string) => {
  await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/clubs/${clubId}$`));
};

test.describe("Linking Accounts (one device)", () => {
  test.beforeEach(async ({ page }) => {
    await seedStorage(page, { account: roy, otherAccounts: [ana], sharedClubs: [club] });
    await page.goto("/clubs/shared-1");
    await editPlayers(page);
    await expect(roleRadio(page, roy.name, "Organizer")).toBeChecked();
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
    await expect(roleRadio(page, "Ana Bell", "Player")).toBeChecked();
    await page.getByRole("button", { name: "Save" }).click();
    await expectSaved(page, "shared-1");

    const [saved] = await readFakeClubs(page);
    expect(saved?.players.find((p) => p.id === "p-cat")).toEqual({
      id: "p-cat",
      name: "Ana Bell",
      skill: "beginner",
      link: { accountId: "ana-2222", role: "player" },
    });

    await editPlayers(page);
    await expect(roleRadio(page, "Ana Bell", "Player")).toBeChecked();
    await expect(page.getByText("ana-2222", { exact: true })).toBeVisible();
  });

  test("an unknown or already-linked Account ID is rejected under the field", async ({ page }) => {
    await catField(page).fill("@nobody-abcd");
    await expect(page.getByText("No Account has that Account ID.")).toBeVisible();
    await expect(catField(page)).toHaveAttribute("aria-invalid", "true");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Fix the highlighted fields to save.")).toBeVisible();
    await expect(page.getByText("Enter a name")).toHaveCount(0);
    await expect(page).toHaveURL(/\/clubs\/shared-1\/players$/);

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
    await expectSaved(page, "shared-1");
    const [saved] = await readFakeClubs(page);
    expect(saved?.players.find((p) => p.id === "p-cat")?.link).toBeUndefined();
  });

  test("tapping Organizer on the Role pill makes a linked player an Organizer when saved", async ({
    page,
  }) => {
    await catField(page).fill("@ana-2222");
    await expect(roleRadio(page, "Ana Bell", "Player")).toBeChecked();
    await role(page, "Ana Bell").getByText("Organizer", { exact: true }).click();
    await expect(roleRadio(page, "Ana Bell", "Organizer")).toBeChecked();
    await expect(roleRadio(page, "Ana Bell", "Player")).not.toBeChecked();
    await page.getByRole("button", { name: "Save" }).click();
    await expectSaved(page, "shared-1");

    const [saved] = await readFakeClubs(page);
    expect(saved?.players.find((p) => p.id === "p-cat")?.link).toEqual({
      accountId: "ana-2222",
      role: "organizer",
    });
  });

  test("the Role starts right under the Skill level and reaches under Remove", async ({ page }) => {
    const skill = (await page
      .getByRole("combobox", { name: `Skill level for ${cat}` })
      .boundingBox())!;
    const remove = (await page.getByRole("button", { name: `Remove ${cat}` }).boundingBox())!;
    const roleBox = (await role(page, roy.name).boundingBox())!;
    expect(Math.abs(roleBox.x - skill.x)).toBeLessThan(1);
    expect(roleBox.x + roleBox.width).toBeGreaterThan(remove.x + remove.width / 2);
    expect(roleBox.x + roleBox.width).toBeLessThanOrEqual(remove.x + remove.width);
  });

  test("the last Organizer can't demote themselves, and can't leave", async ({ page }) => {
    await role(page, roy.name).getByText("Player", { exact: true }).click();

    await expect(page.getByRole("alert")).toContainText("A Club needs at least one Organizer.");
    await expect(roleRadio(page, roy.name, "Organizer")).toBeChecked();
    await expect(page.getByRole("button", { name: "Remove Roy Smith" })).toHaveCount(0);
    // The Danger zone is on the Club page, not on Edit players.
    await expect(page.getByRole("button", { name: "Leave club" })).toHaveCount(0);
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByRole("button", { name: "Leave club" })).toBeDisabled();
    await expect(page.getByText(/You're the only Organizer/)).toBeVisible();
  });

  test("offline: linking and Roles are turned off, with the reason", async ({ page, context }) => {
    await context.setOffline(true);

    await expect(roleRadio(page, roy.name, "Organizer")).toBeDisabled();
    await expect(roleRadio(page, roy.name, "Player")).toBeDisabled();
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
    await editPlayers(page);
    await expect(roleRadio(page, ana.name, "Player")).toBeChecked();
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
    await expectSaved(page, "shared-4");
    expect((await readFakeClubs(page))[0]?.players.find((p) => p.id === "p-ana")).toEqual({
      id: "p-ana",
      name: ana.name,
      skill: "beginner",
    });

    await page.reload();
    await editPlayers(page);
    await expect(page.getByRole("textbox", { name: "Player name" }).first()).toHaveValue(ana.name);
    await expect(page.getByText(ana.accountId, { exact: true })).toHaveCount(0);
    await expect(role(page, ana.name)).toHaveCount(0);
    await expect(page.getByRole("button", { name: `Unlink ${ana.name}` })).toHaveCount(0);
    // Roy's own row is untouched.
    await expect(roleRadio(page, roy.name, "Organizer")).toBeChecked();
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
  await editPlayers(page);

  await expect(page.getByText("This Account no longer exists.")).toBeVisible();
  await page.getByRole("button", { name: "Unlink Gus" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expectSaved(page, "shared-2");

  const [saved] = await readFakeClubs(page);
  expect(saved?.players.find((p) => p.id === "p-gus")).toEqual({
    id: "p-gus",
    name: "Gus",
    skill: "beginner",
  });
});

test("a Player sees the Club page without Edit, with You on their row and no Account IDs, opens Stats from the roster, and can leave", async ({
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

  await expect(page.getByRole("heading", { level: 1, name: "Club" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Thursday" })).toBeVisible();
  await expect(page.getByText("Shared club · You're a Player")).toBeVisible();
  await expect(page.getByText("You", { exact: true })).toHaveCount(1);
  await expect(page.getByText(roy.accountId)).toHaveCount(0);
  await expect(page.getByText(ana.accountId)).toHaveCount(0);
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit club name" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Edit players" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: roy.name })).toHaveAccessibleDescription(
    "Organizer, Linked to an account, Intermediate",
  );

  // A roster row opens that Club player's Stats, and Back returns here.
  await page.getByRole("link", { name: roy.name }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Stats" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: roy.name })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL(/\/clubs\/shared-3$/);

  // Edit players isn't for a Player: its URL lands on the Club page.
  await page.goto("/clubs/shared-3/players");
  await expect(page).toHaveURL(/\/clubs\/shared-3$/);
  await expect(page.getByRole("textbox")).toHaveCount(0);

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
