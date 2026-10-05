import { expect, test, type Page } from "@playwright/test";
import { readServerClub, signUp, uniqueId } from "./emulator.ts";

// Two people on the Firebase emulators: an Organizer (Roy) and the person he adds (Ana).

/** Cat's name field (rows are sorted by name: Cat comes before Roy Smith). */
async function catField(page: Page) {
  const field = page.getByRole("textbox", { name: "Player name" }).first();
  await expect(field).toHaveValue("Cat");
  return field;
}
const role = (page: Page, who: string) => page.getByRole("combobox", { name: `Role for ${who}` });

/** Roy creates a Club with a row for Cat; returns its id. */
async function createClubWithCat(page: Page, clubName: string): Promise<string> {
  await page.goto("/clubs/new");
  await page.getByRole("textbox", { name: "Club name" }).fill(clubName);
  await page.getByRole("button", { name: "Add player" }).click();
  await page.getByRole("textbox", { name: "Player name" }).last().fill("Cat");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/clubs$/);
  const link = page.getByRole("link", { name: new RegExp(clubName) });
  await expect(link).toBeVisible();
  return (await link.getAttribute("href"))!.split("/").at(-1)!;
}

test.describe("Linking Accounts between two people", () => {
  test("Roy links Ana by typing @ her Account ID in a name; she sees a read-only Club with You, no Account IDs, and can leave", async ({
    page,
    browser,
    baseURL,
  }) => {
    const roy = await signUp(page, "Roy Smith");
    const anaPage = await (await browser.newContext({ baseURL })).newPage();
    const ana = await signUp(anaPage, "Ana Bell");
    await anaPage.goto("/clubs");

    // Roy: an unknown Account ID is rejected; Ana's, in capitals, is found.
    const clubName = uniqueId("Tuesday");
    const clubId = await createClubWithCat(page, clubName);
    await page.goto(`/clubs/${clubId}`);
    await expect(role(page, "Roy Smith")).toHaveValue("organizer");

    const field = await catField(page);
    await field.fill("@nobody-abcd");
    await expect(page.getByText("No Account has that Account ID.")).toBeVisible();
    await field.fill(`@${ana.accountId.toUpperCase()}`);
    // The Account's name replaces the text; the linked line and a Role appear.
    await expect(field).toHaveValue("Ana Bell");
    await expect(page.getByText(ana.accountId, { exact: true })).toBeVisible();
    await expect(role(page, "Ana Bell")).toHaveValue("player");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/clubs$/);

    // Ana: the Club is in her list straight away, with nothing to accept.
    const anaRow = anaPage.getByRole("link", { name: new RegExp(clubName) });
    await expect(anaRow).toBeVisible();
    await anaRow.click();

    // Read-only: You on her row, no Account IDs, nothing to edit.
    await expect(anaPage.getByRole("heading", { level: 1, name: clubName })).toBeVisible();
    await expect(anaPage.getByText("You", { exact: true })).toHaveCount(1);
    await expect(anaPage.getByText(roy.accountId)).toHaveCount(0);
    await expect(anaPage.getByText(ana.accountId)).toHaveCount(0);
    await expect(anaPage.getByRole("textbox")).toHaveCount(0);
    await expect(anaPage.getByRole("button", { name: "Save" })).toHaveCount(0);
    await expect(anaPage.getByRole("button", { name: "Add player" })).toHaveCount(0);

    // She leaves: the Club is gone from her list, but her row stays on Roy's roster, unlinked.
    await anaPage.getByRole("button", { name: "Leave club" }).click();
    await anaPage.getByRole("dialog").getByRole("button", { name: "Leave club" }).click();
    await expect(anaPage).toHaveURL(/\/clubs$/);
    await expect(anaPage.getByRole("link", { name: new RegExp(clubName) })).toHaveCount(0);

    await expect
      .poll(async () => {
        const server = await readServerClub(clubId);
        return server?.players.map((p) => [p.name, p.link?.role ?? null]).sort();
      })
      .toEqual([
        ["Ana Bell", null],
        ["Roy Smith", "organizer"],
      ]);

    await anaPage.context().close();
  });

  test("the last Organizer can't demote themselves or leave; with a second Organizer they can step down", async ({
    page,
    browser,
    baseURL,
  }) => {
    await signUp(page, "Roy Smith");
    const anaPage = await (await browser.newContext({ baseURL })).newPage();
    const ana = await signUp(anaPage, "Ana Bell");

    const clubId = await createClubWithCat(page, uniqueId("Friday"));
    await page.goto(`/clubs/${clubId}`);

    // Blocked, with the reason.
    await role(page, "Roy Smith").selectOption("player");
    await expect(page.getByRole("alert")).toContainText("A Club needs at least one Organizer.");
    await expect(role(page, "Roy Smith")).toHaveValue("organizer");
    await expect(page.getByRole("button", { name: "Leave club" })).toBeDisabled();

    // Make Ana an Organizer too and step down in the same Save.
    await (await catField(page)).fill(`@${ana.accountId}`);
    await expect(page.getByText(ana.accountId, { exact: true })).toBeVisible();
    await role(page, "Ana Bell").selectOption("organizer");
    await role(page, "Roy Smith").selectOption("player");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/clubs$/);

    await expect
      .poll(async () => {
        const server = await readServerClub(clubId);
        return server?.players.map((p) => [p.name, p.link?.role ?? null]).sort();
      })
      .toEqual([
        ["Ana Bell", "organizer"],
        ["Roy Smith", "player"],
      ]);

    // Ana can now edit; Roy, a Player now, only looks.
    await anaPage.goto(`/clubs/${clubId}`);
    await expect(role(anaPage, "Ana Bell")).toHaveValue("organizer");
    await page.goto(`/clubs/${clubId}`);
    await expect(page.getByText("You're a Player")).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0);

    await anaPage.context().close();
  });

  test("Unlink takes back a link that isn't saved yet: the field is cleared, and Save keeps the row unlinked", async ({
    page,
    browser,
    baseURL,
  }) => {
    await signUp(page, "Roy Smith");
    const anaPage = await (await browser.newContext({ baseURL })).newPage();
    const ana = await signUp(anaPage, "Ana Bell");

    const clubName = uniqueId("Monday");
    const clubId = await createClubWithCat(page, clubName);
    await page.goto(`/clubs/${clubId}`);

    const field = await catField(page);
    await field.fill(`@${ana.accountId}`);
    await expect(field).toHaveValue("Ana Bell");
    await page.getByRole("button", { name: "Unlink Ana Bell" }).click();
    await expect(field).toHaveValue("");
    await expect(field).toBeFocused();
    await expect(page.getByText(ana.accountId, { exact: true })).toHaveCount(0);

    // An empty name can't be saved; with a name again, the row saves unlinked.
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Enter a name")).toBeVisible();
    await field.fill("Cat");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/clubs$/);

    const server = await readServerClub(clubId);
    expect(server?.players.map((p) => [p.name, p.link?.role ?? null]).sort()).toEqual([
      ["Cat", null],
      ["Roy Smith", "organizer"],
    ]);
    await anaPage.goto("/clubs");
    await expect(anaPage.getByRole("heading", { level: 1, name: "Clubs" })).toBeVisible();
    await expect(anaPage.getByRole("link", { name: new RegExp(clubName) })).toHaveCount(0);

    await anaPage.context().close();
  });

  test("Unlink on a saved link, then Save: the other person loses the Club from their list, and gets it back when linked again", async ({
    page,
    browser,
    baseURL,
  }) => {
    await signUp(page, "Roy Smith");
    const anaPage = await (await browser.newContext({ baseURL })).newPage();
    const ana = await signUp(anaPage, "Ana Bell");
    await anaPage.goto("/clubs");

    const clubName = uniqueId("Tuesday");
    const clubId = await createClubWithCat(page, clubName);
    await page.goto(`/clubs/${clubId}`);
    await (await catField(page)).fill(`@${ana.accountId}`);
    await expect(role(page, "Ana Bell")).toHaveValue("player");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/clubs$/);
    const anaRow = anaPage.getByRole("link", { name: new RegExp(clubName) });
    await expect(anaRow).toBeVisible();

    // Ana's page is never reloaded from here on: the marker is gone if it is.
    await anaPage.evaluate(() => ((window as unknown as { __noReload: number }).__noReload = 1));

    // Roy unlinks her and saves. Nothing changes for her until he does.
    await page.goto(`/clubs/${clubId}`);
    await page.getByRole("button", { name: "Unlink Ana Bell" }).click();
    await expect(page.getByText(ana.accountId, { exact: true })).toHaveCount(0);
    await expect(role(page, "Ana Bell")).toHaveCount(0);
    await expect(anaRow).toBeVisible();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/clubs$/);

    // Like leaving: the Club goes from her list (live), and her row stays on the roster, unlinked.
    await expect(anaRow).toHaveCount(0);
    await expect
      .poll(async () => {
        const server = await readServerClub(clubId);
        return server?.players.map((p) => [p.name, p.link?.role ?? null]).sort();
      })
      .toEqual([
        ["Ana Bell", null],
        ["Roy Smith", "organizer"],
      ]);

    // Roy links her again, to the same row: the Club comes back without her reloading.
    await page.goto(`/clubs/${clubId}`);
    const anaField = page.getByRole("textbox", { name: "Player name" }).first();
    await expect(anaField).toHaveValue("Ana Bell");
    await anaField.fill(`@${ana.accountId}`);
    await expect(page.getByText(ana.accountId, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/clubs$/);
    await expect(anaRow).toBeVisible();
    expect(
      await anaPage.evaluate(() => (window as unknown as { __noReload?: number }).__noReload),
    ).toBe(1);

    await anaPage.context().close();
  });
});
