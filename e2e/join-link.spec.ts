import { expect, test, type Page } from "@playwright/test";
import type { Account, Club, ClubPlayer } from "../src/domain/types.ts";
import {
  FIRST_LAUNCH_STORAGE_STATE,
  makeClub,
  readFakeAccount,
  readFakeClubs,
  seedStorage,
} from "./fixtures.ts";

// One device on the local fake Backend, which keeps a Club's Join link token on the Club itself
// (`joinToken`). Two people sharing a link on a real server: e2e/emulator/join-link.spec.ts.

const roy: Account = { accountId: "roy-7k3f", name: "Roy Smith" };
const ana: Account = { accountId: "ana-2222", name: "Ana Bell" };

const TOKEN = "AbCdEfGhIjKlMnOpQrSt-_";
/** Well formed, but no Club has it. */
const UNKNOWN_TOKEN = "zZzZzZzZzZzZzZzZzZzZ00";

const royRow: ClubPlayer = {
  id: "p-roy",
  name: roy.name,
  skill: "intermediate",
  link: { accountId: roy.accountId, role: "organizer" },
};
const alexRow: ClubPlayer = { id: "p-alex", name: "Alex", skill: "beginner" };

/**
 * Roy's Shared club "Tuesday", with Alex not linked yet, and a Join link unless `joinToken` says
 * otherwise.
 */
const tuesday = (overrides: Partial<Club> = {}): Club =>
  makeClub({
    id: "shared-1",
    name: "Tuesday",
    kind: "shared",
    players: [royRow, alexRow],
    joinToken: TOKEN,
    ...overrides,
  });

const joinLinkCard = (page: Page) => page.getByRole("region", { name: "Join link" });
const yourName = (page: Page) => page.getByRole("textbox", { name: "Your name", exact: true });
const nameInClub = (page: Page) => page.getByRole("textbox", { name: "Your name in Tuesday" });
const confirmDialog = (page: Page, name: string) =>
  page.getByRole("dialog", { name: `You're ${name} in Tuesday?` });
const welcome = (page: Page) => page.getByRole("heading", { level: 1, name: "Welcome to BBQueue" });

/** No share sheet, and a clipboard that keeps what was copied in `window.__copied`. */
async function stubClipboard(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as unknown as { __copied?: string }).__copied = text;
        },
      },
    });
  });
}

const copiedText = (page: Page) =>
  page.evaluate(() => (window as unknown as { __copied?: string }).__copied ?? null);

/** The Join page of `token`, opened for Tuesday: its card says Join club and the Club's name. */
async function expectJoinPage(page: Page) {
  await expect(page.getByRole("heading", { level: 1, name: "Join link" })).toBeVisible();
  await expect(page.getByText("Join club", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Tuesday" })).toBeVisible();
}

/**
 * On Tuesday's Club page, with this device's row saying You, and the Join page gone from history.
 */
async function expectOnClubAsPlayer(page: Page, rowName: string) {
  await expect(page).toHaveURL(/\/clubs\/shared-1$/);
  await expect(page.getByRole("heading", { level: 2, name: "Tuesday" })).toBeVisible();
  await expect(page.getByText("Shared club · You're a Player")).toBeVisible();
  await expect(page.getByRole("link", { name: rowName })).toHaveAccessibleDescription(
    /^You, Linked to an account/,
  );
}

async function expectBackSkipsJoinPage(page: Page) {
  await page.goBack();
  await expect(page).not.toHaveURL(/\/join\//);
}

test.describe("Join link card on the Club page", () => {
  test("an Organizer shares the link (copied where there's no share sheet), then resets it: the old link doesn't work", async ({
    page,
  }) => {
    await stubClipboard(page);
    await seedStorage(page, {
      account: roy,
      sharedClubs: [tuesday({ joinToken: undefined })],
    });
    await page.goto("/clubs/shared-1");

    const card = joinLinkCard(page);
    await expect(card).toBeVisible();
    await expect(
      card.getByText(
        "Anyone with this link can link their Account to an unlinked player and see the club.",
      ),
    ).toBeVisible();
    // No link yet, so nothing to reset.
    await expect(card.getByRole("button", { name: "Reset link" })).toHaveCount(0);

    await card.getByRole("button", { name: "Share link" }).click();
    await expect(card.getByRole("status")).toHaveText("Link copied");
    const [made] = await readFakeClubs(page);
    const first = made?.joinToken;
    expect(first).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const copied = await copiedText(page);
    expect(copied).toMatch(new RegExp(`/join/${first}$`));

    // Reset asks first; Cancel keeps the link.
    await card.getByRole("button", { name: "Reset link" }).click();
    const dialog = page.getByRole("dialog", { name: "Reset the Join link?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    expect((await readFakeClubs(page))[0]?.joinToken).toBe(first);

    await card.getByRole("button", { name: "Reset link" }).click();
    await dialog.getByRole("button", { name: "Reset link" }).click();
    await expect(dialog).toBeHidden();
    await expect(card.getByRole("status")).toHaveText("The old link no longer works.");
    const second = (await readFakeClubs(page))[0]?.joinToken;
    expect(second).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(second).not.toBe(first);

    // Sharing again shares the new link.
    await card.getByRole("button", { name: "Share link" }).click();
    await expect(card.getByRole("status")).toHaveText("Link copied");
    expect(await copiedText(page)).toMatch(new RegExp(`/join/${second}$`));

    await page.goto(new URL(copied!).pathname);
    await expect(
      page.getByText("This Join link doesn't work any more. Ask an Organizer for a new one."),
    ).toBeVisible();
  });

  test("a Player doesn't see the card", async ({ page }) => {
    await seedStorage(page, {
      account: ana,
      otherAccounts: [roy],
      sharedClubs: [
        tuesday({
          players: [royRow, { ...alexRow, link: { accountId: ana.accountId, role: "player" } }],
        }),
      ],
    });
    await page.goto("/clubs/shared-1");
    await expect(page.getByText("Shared club · You're a Player")).toBeVisible();
    await expect(joinLinkCard(page)).toHaveCount(0);
  });

  test("it isn't on Players Edit mode", async ({ page }) => {
    await seedStorage(page, { account: roy, sharedClubs: [tuesday()] });
    await page.goto("/clubs/shared-1");
    await expect(joinLinkCard(page)).toBeVisible();
    await page.getByRole("link", { name: "Edit players" }).click();
    await expect(page).toHaveURL(/\/clubs\/shared-1\/players$/);
    await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
    await expect(joinLinkCard(page)).toHaveCount(0);
  });
});

test.describe("Join page, on a device that never opened the app", () => {
  test.use({ storageState: FIRST_LAUNCH_STORAGE_STATE });

  test.beforeEach(async ({ page }) => {
    await seedStorage(page, { otherAccounts: [roy], sharedClubs: [tuesday()] });
  });

  test("skips Welcome; a matching name, confirmed, opens the Club page, makes the Account, and Back doesn't return", async ({
    page,
  }) => {
    await page.goto(`/join/${TOKEN}`);
    await expectJoinPage(page);
    await expect(welcome(page)).toHaveCount(0);
    // The only way out is Home.
    await expect(page.getByRole("button", { name: "Home" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Back" })).toHaveCount(0);

    await yourName(page).fill("alex");
    await page.getByRole("button", { name: "Continue" }).click();
    const confirm = confirmDialog(page, "alex");
    await expect(confirm).toBeVisible();
    expect(await readFakeAccount(page)).toBeNull();
    await confirm.getByRole("button", { name: "Yes, that's me" }).click();

    await expectOnClubAsPlayer(page, "Alex");
    const account = await readFakeAccount(page);
    expect(account).toMatchObject({ name: "alex" });
    const [claimed] = await readFakeClubs(page);
    expect(claimed?.players.find((p) => p.id === "p-alex")?.link).toEqual({
      accountId: account!.accountId,
      role: "player",
    });

    await expectBackSkipsJoinPage(page);
  });

  test("no match on your own name: a different name in the Club is claimed, and the Account keeps the first", async ({
    page,
  }) => {
    await page.goto(`/join/${TOKEN}`);
    await yourName(page).fill("Sam Lee");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(nameInClub(page)).toBeVisible();
    await expect(nameInClub(page)).toHaveValue("");
    await nameInClub(page).fill("Alex");
    await page.getByRole("button", { name: "Find me" }).click();
    await confirmDialog(page, "Alex").getByRole("button", { name: "Yes, that's me" }).click();

    await expectOnClubAsPlayer(page, "Alex");
    const account = await readFakeAccount(page);
    expect(account).toMatchObject({ name: "Sam Lee" });
    const [claimed] = await readFakeClubs(page);
    expect(claimed?.players.find((p) => p.id === "p-alex")).toEqual({
      ...alexRow,
      link: { accountId: account!.accountId, role: "player" },
    });
  });

  test("no match on the name in the Club either: Ask an Organizer, Try another name, and no Account is made", async ({
    page,
  }) => {
    await page.goto(`/join/${TOKEN}`);
    await yourName(page).fill("Sam Lee");
    await page.getByRole("button", { name: "Continue" }).click();
    await nameInClub(page).fill("Nobody");
    await nameInClub(page).press("Enter");

    await expect(
      page.getByText(
        "No one called Nobody in Tuesday. Ask an Organizer to add you, then open this link again.",
      ),
    ).toBeVisible();
    await page.getByRole("button", { name: "Try another name" }).click();
    await expect(nameInClub(page)).toBeVisible();
    await expect(nameInClub(page)).toHaveValue("");
    await expect(nameInClub(page)).toBeFocused();

    expect(await readFakeAccount(page)).toBeNull();
    await page.goto("/");
    await expect(welcome(page)).toBeVisible();
    expect(await readFakeAccount(page)).toBeNull();
  });
});

test.describe("Join page, with an Account on the device", () => {
  test("its Name matches: Confirm shows straight away, and I go by another name asks for the name in the Club", async ({
    page,
  }) => {
    const alex: Account = { accountId: "alex-1234", name: "Alex" };
    const lexi: ClubPlayer = { id: "p-lexi", name: "Lexi", skill: "advanced" };
    await seedStorage(page, {
      account: alex,
      otherAccounts: [roy],
      sharedClubs: [tuesday({ players: [royRow, alexRow, lexi] })],
    });
    await page.goto(`/join/${TOKEN}`);

    const confirm = confirmDialog(page, "Alex");
    await expect(confirm).toBeVisible();
    await expect(yourName(page)).toHaveCount(0);
    await confirm.getByRole("button", { name: "I go by another name" }).click();

    await expect(confirm).toBeHidden();
    await expect(nameInClub(page)).toBeVisible();
    await expect(nameInClub(page)).toBeFocused();
    await nameInClub(page).fill("Lexi");
    await page.getByRole("button", { name: "Find me" }).click();
    await confirmDialog(page, "Lexi").getByRole("button", { name: "Yes, that's me" }).click();

    await expectOnClubAsPlayer(page, "Lexi");
    // The name in the Club doesn't rename the Account.
    expect(await readFakeAccount(page)).toEqual(alex);
    const [claimed] = await readFakeClubs(page);
    expect(claimed?.players.find((p) => p.id === "p-lexi")?.link).toEqual({
      accountId: alex.accountId,
      role: "player",
    });
    expect(claimed?.players.find((p) => p.id === "p-alex")?.link).toBeUndefined();
  });

  test("its Name matches a row that's already linked: the already linked message", async ({
    page,
  }) => {
    const otherAlex: Account = { accountId: "alex-1234", name: "Alex" };
    await seedStorage(page, {
      account: { accountId: "alex-5678", name: "Alex" },
      otherAccounts: [roy, otherAlex],
      sharedClubs: [
        tuesday({
          players: [
            royRow,
            { ...alexRow, link: { accountId: otherAlex.accountId, role: "player" } },
          ],
        }),
      ],
    });
    await page.goto(`/join/${TOKEN}`);

    await expect(
      page.getByText(
        "Alex is already linked to an Account. If that's not you, ask an Organizer to unlink it.",
      ),
    ).toBeVisible();
    await expect(confirmDialog(page, "Alex")).toHaveCount(0);
    await page.getByRole("button", { name: "Try another name" }).click();
    await expect(nameInClub(page)).toBeFocused();
  });

  test("already on the Club: the link opens the Club page", async ({ page }) => {
    await seedStorage(page, {
      account: ana,
      otherAccounts: [roy],
      sharedClubs: [
        tuesday({
          players: [royRow, { ...alexRow, link: { accountId: ana.accountId, role: "player" } }],
        }),
      ],
    });
    await page.goto(`/join/${TOKEN}`);

    await expectOnClubAsPlayer(page, "Alex");
    await expectBackSkipsJoinPage(page);
  });
});

test.describe("A Join link that doesn't work", () => {
  for (const [what, token] of [
    ["an unknown token", UNKNOWN_TOKEN],
    ["a token of the wrong shape", "not-a-token"],
  ] as const) {
    test(`${what}: doesn't work, and Go to Home goes Home`, async ({ page }) => {
      await seedStorage(page, { otherAccounts: [roy], sharedClubs: [tuesday()] });
      await page.goto(`/join/${token}`);

      await expect(page.getByRole("heading", { level: 1, name: "Join link" })).toBeVisible();
      await expect(
        page.getByText("This Join link doesn't work any more. Ask an Organizer for a new one."),
      ).toBeVisible();
      await expect(page.getByText("Join club", { exact: true })).toHaveCount(0);
      await page.getByRole("button", { name: "Go to Home" }).click();
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole("heading", { level: 1, name: "BBQueue" })).toBeVisible();
    });
  }
});

test.describe("Have a Join link? on the Clubs page", () => {
  test("a pasted Join link opens its Join page; anything else is refused", async ({ page }) => {
    await seedStorage(page, {
      account: { accountId: "sam-1234", name: "Sam Lee" },
      otherAccounts: [roy],
      sharedClubs: [tuesday()],
    });
    await page.goto("/clubs");
    await page.getByRole("button", { name: "Have a Join link?" }).click();

    const sheet = page.getByRole("dialog", { name: "Have a Join link?" });
    await expect(sheet).toBeVisible();
    const field = sheet.getByRole("textbox", { name: "Paste the Join link" });
    await field.fill("https://example.com/clubs/shared-1");
    await sheet.getByRole("button", { name: "Open" }).click();
    await expect(sheet.getByText("That isn't a Join link.")).toBeVisible();
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expect(page).toHaveURL(/\/clubs$/);

    await field.fill(`  https://bbqueue.example/join/${TOKEN}  `);
    await expect(sheet.getByText("That isn't a Join link.")).toHaveCount(0);
    await sheet.getByRole("button", { name: "Open" }).click();

    await expect(page).toHaveURL(new RegExp(`/join/${TOKEN}$`));
    await expectJoinPage(page);
    // Sam isn't on the roster: the page asks for the name in the Club.
    await expect(nameInClub(page)).toBeVisible();
  });

  test("isn't offered without an Account", async ({ page }) => {
    await page.goto("/clubs");
    await expect(page.getByRole("button", { name: "Add club" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Have a Join link?" })).toHaveCount(0);
  });
});

test.describe("Join page in an iOS browser", () => {
  test("offers to copy the link for the Home Screen app on iPhone only", async ({
    page,
  }, testInfo) => {
    await stubClipboard(page);
    await seedStorage(page, { otherAccounts: [roy], sharedClubs: [tuesday()] });
    await page.goto(`/join/${TOKEN}`);
    await expectJoinPage(page);

    const line = page.getByText(
      "Using BBQueue from your Home Screen? Copy this link and paste it there.",
    );
    const copy = page.getByRole("button", { name: "Copy link" });
    if (testInfo.project.name !== "webkit-mobile") {
      // A Pixel: the installed app shares the browser's storage, so there's nothing to copy.
      await expect(yourName(page)).toBeVisible();
      await expect(line).toHaveCount(0);
      await expect(copy).toHaveCount(0);
      return;
    }
    await expect(line).toBeVisible();
    await copy.click();
    await expect(page.getByRole("status").filter({ hasText: "Link copied" })).toBeVisible();
    const copied = await copiedText(page);
    expect(copied).toMatch(new RegExp(`^https?://[^/]+/join/${TOKEN}$`));
  });
});
