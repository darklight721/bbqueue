import { expect, test, type Page } from "@playwright/test";
import { court } from "../session-helpers.ts";
import { readServerClub, signUp, uniqueId } from "./emulator.ts";

// Roy has a Local club (made before he had an Account), then makes it shared; Ana joins it.

/** First launch, skip the Welcome screen, make a Local club "Garage" with five players. */
async function localClub(page: Page, name: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.goto("/clubs/new");
  await page.getByRole("textbox", { name: "Club name" }).fill(name);
  for (const player of ["Ana", "Roy S.", "Cat", "Dan", "Eve"]) {
    await page.getByRole("button", { name: "Add player" }).click();
    await page.getByRole("textbox", { name: "Player name" }).last().fill(player);
  }
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/clubs$/);
}

/** Create the Account from Account settings (the device is signed out until now). */
async function signUpLater(page: Page, name: string) {
  await page.goto("/account");
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: "Add your name" }).click();
  await expect(page.getByRole("region", { name: "Your Account", exact: true })).toContainText(name);
}

test.describe("Making a Local club shared, between two people", () => {
  test("the Club becomes Shared, and a second Account linked to a row sees it", async ({
    page,
    browser,
    baseURL,
  }) => {
    const clubName = uniqueId("Garage");
    await localClub(page, clubName);
    await signUpLater(page, "Roy Smith");
    const anaPage = await (await browser.newContext({ baseURL })).newPage();
    const ana = await signUp(anaPage, "Ana Bell");

    await page.goto("/clubs");
    await page.getByRole("link", { name: new RegExp(clubName) }).click();
    await expect(page.getByText("This device only")).toBeVisible();
    await page.getByRole("button", { name: "Make shared club" }).click();
    const sheet = page.getByRole("dialog", { name: "Which player are you?" });
    await sheet.getByRole("radio", { name: "Roy S." }).check();
    await sheet.getByRole("button", { name: "Continue" }).click();
    await page
      .getByRole("dialog", { name: new RegExp(`Make ${clubName}`) })
      .getByRole("button", { name: "Make shared club" })
      .click();

    await expect(page.getByText("This device only")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Make shared club" })).toHaveCount(0);
    const clubId = page.url().split("/").at(-1)!;
    await expect.poll(async () => (await readServerClub(clubId))?.players.length).toBe(5);
    expect(
      (await readServerClub(clubId))!.players
        .map((p) => [p.name, p.link?.role ?? null])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    ).toEqual([
      ["Ana", null],
      ["Cat", null],
      ["Dan", null],
      ["Eve", null],
      ["Roy S.", "organizer"],
    ]);

    // He links Ana's Account to her row; she sees the Club.
    await page.getByRole("button", { name: "Link Account for Ana" }).click();
    await page.getByRole("textbox", { name: /Account ID.* for Ana/ }).fill(ana.accountId);
    await expect(page.getByText("✓ Ana Bell")).toBeVisible();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/clubs$/);
    await anaPage.goto("/clubs");
    await expect(anaPage.getByRole("link", { name: new RegExp(clubName) })).toBeVisible({
      timeout: 30_000,
    });

    await anaPage.context().close();
  });

  test("a running Session of the Local club moves over, and the second Account sees it live", async ({
    page,
    browser,
    baseURL,
  }) => {
    const clubName = uniqueId("Garage");
    await localClub(page, clubName);
    await signUpLater(page, "Roy Smith");
    const anaPage = await (await browser.newContext({ baseURL })).newPage();
    const ana = await signUp(anaPage, "Ana Bell");

    // A Session for the Local club, started while it was Local.
    await page.goto("/clubs");
    await page.getByRole("link", { name: new RegExp(clubName) }).click();
    await page.getByRole("link", { name: "New session" }).click();
    await page.getByRole("textbox", { name: "Session name" }).fill("Thursday night");
    await page.getByRole("button", { name: "Select all" }).click();
    await page.getByRole("button", { name: "Start session" }).click();
    await expect(page).toHaveURL(/\/sessions\/(?!new)[^/]+$/);
    await court(page, 1).getByRole("button", { name: "Start match" }).click();
    await expect(court(page, 1).getByText("Playing", { exact: true })).toBeVisible();

    // Make the Club shared, with Ana linked straight after.
    await page.goto("/clubs");
    await page.getByRole("link", { name: new RegExp(clubName) }).click();
    await page.getByRole("button", { name: "Make shared club" }).click();
    await page
      .getByRole("dialog", { name: "Which player are you?" })
      .getByRole("radio", { name: "Roy S." })
      .check();
    await page.getByRole("dialog").getByRole("button", { name: "Continue" }).click();
    await page
      .getByRole("dialog", { name: new RegExp(`Make ${clubName}`) })
      .getByRole("button", { name: "Make shared club" })
      .click();
    await expect(page.getByText("This device only")).toHaveCount(0, { timeout: 30_000 });
    await page.getByRole("button", { name: "Link Account for Ana" }).click();
    await page.getByRole("textbox", { name: /Account ID.* for Ana/ }).fill(ana.accountId);
    await expect(page.getByText("✓ Ana Bell")).toBeVisible();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/clubs$/);

    // Ana sees the Session on Home, live, read-only, with Roy as the host.
    await anaPage.goto("/");
    const view = anaPage.getByRole("link", { name: "View session" });
    await expect(view).toBeVisible({ timeout: 30_000 });
    await view.click();
    await expect(anaPage.getByText("Watching. Roy Smith runs this session.")).toBeVisible();
    await expect(court(anaPage, 1).getByText("Playing", { exact: true })).toBeVisible();
    await expect(anaPage.getByRole("button", { name: /Start match|End match/ })).toHaveCount(0);

    // And he still runs it, from the Club's Session now.
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Resume session" })).toHaveCount(1);

    await anaPage.context().close();
  });
});
