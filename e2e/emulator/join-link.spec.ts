import { expect, test, type Browser, type Page } from "@playwright/test";
import type { Account, Club } from "../../src/domain/types.ts";
import { readStoredData } from "../fixtures.ts";
import { adminGetDoc, readServerClub, seedSharedClub, signUp, uniqueId } from "./emulator.ts";
import { startSession, watchFromHome } from "./sessions.ts";

// People on the Firebase emulators, each in their own browser context: Roy (an Organizer) shares
// his Club's Join link, and people with no Account open it. One device on the local fake Backend:
// e2e/join-link.spec.ts.

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

const joinLinkCard = (page: Page) => page.getByRole("region", { name: "Join link" });
const confirmDialog = (page: Page, name: string, clubName: string) =>
  page.getByRole("dialog", { name: `You're ${name} in ${clubName}?` });
const DOESNT_WORK = "This Join link doesn't work any more. Ask an Organizer for a new one.";

/**
 * Roy signs up and has a Shared club with Alex, Cat, Dan and Eve not linked yet. The Club has
 * no Join link: Share link makes it through the Firebase Backend.
 */
async function royWithClub(page: Page): Promise<Club> {
  await stubClipboard(page);
  const roy = await signUp(page, "Roy Smith");
  const club: Club = {
    id: uniqueId("shared"),
    name: uniqueId("Riverside"),
    kind: "shared",
    players: [
      {
        id: "p-roy",
        name: "Roy Smith",
        skill: "intermediate",
        link: { accountId: roy.accountId, role: "organizer" },
      },
      { id: "p-alex", name: "Alex", skill: "beginner" },
      { id: "p-cat", name: "Cat", skill: "advanced" },
      { id: "p-dan", name: "Dan", skill: "intermediate" },
      { id: "p-eve", name: "Eve", skill: "beginner" },
    ],
  };
  await seedSharedClub(club);
  expect((await adminGetDoc(`clubs/${club.id}`))?.joinToken).toBeUndefined();
  return club;
}

/** Roy shares the Join link from the Club page; returns its path (`/join/<token>`). */
async function shareLink(page: Page, club: Club): Promise<string> {
  // Through the Clubs list: the seeded Club may not have reached Roy's device yet.
  await page.goto("/clubs");
  await page.getByRole("link", { name: new RegExp(club.name) }).click();
  await expect(page.getByRole("heading", { level: 2, name: club.name })).toBeVisible();
  const card = joinLinkCard(page);
  await card.getByRole("button", { name: "Share link" }).click();
  await expect(card.getByRole("status")).toHaveText("Link copied");
  const copied = await copiedText(page);
  const token = (await adminGetDoc(`clubs/${club.id}`))?.joinToken as string | undefined;
  expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
  expect(copied).toMatch(new RegExp(`/join/${token}$`));
  return new URL(copied!).pathname;
}

/** A person on a fresh device (no Account) opens the Join link. */
async function openOnFreshDevice(browser: Browser, baseURL: string | undefined, path: string) {
  const other = await (await browser.newContext({ baseURL })).newPage();
  await other.goto(path);
  await expect(other.getByRole("heading", { level: 1, name: "Join link" })).toBeVisible();
  return other;
}

/** On the Join page, types `name` as their name and gets to the Confirm sheet. */
async function reachConfirm(other: Page, name: string, clubName: string) {
  await expect(other.getByText("Welcome to", { exact: true })).toBeVisible();
  await expect(other.getByRole("heading", { level: 2, name: clubName })).toBeVisible();
  await other.getByRole("textbox", { name: "Your name", exact: true }).fill(name);
  await other.getByRole("button", { name: "Continue" }).click();
  const confirm = confirmDialog(other, name, clubName);
  await expect(confirm).toBeVisible();
  return confirm;
}

async function expectOnClubAsPlayer(other: Page, club: Club, rowName: string) {
  await expect(other).toHaveURL(new RegExp(`/clubs/${club.id}$`));
  await expect(other.getByRole("heading", { level: 2, name: club.name })).toBeVisible();
  await expect(other.getByText("Shared club · You're a Player")).toBeVisible();
  await expect(other.getByRole("link", { name: rowName })).toHaveAccessibleDescription(
    /^You, Linked to an account/,
  );
}

test.describe("Join link between people on a real server", () => {
  test("Roy shares the link; a person with no Account claims Alex, sees the Club and its Active session, and Roy sees them linked as a Player", async ({
    page,
    browser,
    baseURL,
  }) => {
    // Two sign-ups, a Session start and a Claim on a real server: more than the default 30 s
    // on a busy machine.
    test.slow();
    const club = await royWithClub(page);
    await startSession(page, club);
    const path = await shareLink(page, club);

    const alexPage = await openOnFreshDevice(browser, baseURL, path);
    const confirm = await reachConfirm(alexPage, "Alex", club.name);
    await confirm.getByRole("button", { name: "Yes, that's me" }).click();
    await expectOnClubAsPlayer(alexPage, club, "Alex");
    let alex: Account | null = null;
    await expect
      .poll(async () => (alex = await readStoredData<Account>(alexPage, "account")))
      .not.toBeNull();
    expect(alex!.name).toBe("Alex");

    // Alex, a Member now, sees Roy's Active session.
    await watchFromHome(alexPage);

    // Roy, on Edit players: Alex's row has Alex's Account ID, and the Role Player.
    await page.goto(`/clubs/${club.id}`);
    await page.getByRole("link", { name: "Edit players" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Edit players" })).toBeVisible();
    await expect(page.getByText(alex!.accountId, { exact: true })).toBeVisible();
    await expect(
      page
        .getByRole("radiogroup", { name: "Role for Alex" })
        .getByRole("radio", { name: "Player" }),
    ).toBeChecked();
    const server = await readServerClub(club.id);
    expect(server?.players.find((p) => p.id === "p-alex")?.link).toEqual({
      accountId: alex!.accountId,
      role: "player",
    });

    await alexPage.context().close();
  });

  test("two people claim the same name: the second to confirm gets just linked to another Account", async ({
    page,
    browser,
    baseURL,
  }) => {
    const club = await royWithClub(page);
    const path = await shareLink(page, club);

    const first = await openOnFreshDevice(browser, baseURL, path);
    const second = await openOnFreshDevice(browser, baseURL, path);
    const firstConfirm = await reachConfirm(first, "Alex", club.name);
    const secondConfirm = await reachConfirm(second, "Alex", club.name);

    await firstConfirm.getByRole("button", { name: "Yes, that's me" }).click();
    await expectOnClubAsPlayer(first, club, "Alex");

    await secondConfirm.getByRole("button", { name: "Yes, that's me" }).click();
    await expect(second.getByText("Alex was just linked to another Account.")).toBeVisible();
    await expect(second.getByRole("button", { name: "Try another name" })).toBeVisible();
    await expect(second).toHaveURL(new RegExp(`${path}$`));

    // Alex stays linked to the first person.
    const firstAccount = await readStoredData<Account>(first, "account");
    const server = await readServerClub(club.id);
    expect(server?.players.find((p) => p.id === "p-alex")?.link).toEqual({
      accountId: firstAccount!.accountId,
      role: "player",
    });

    await first.context().close();
    await second.context().close();
  });

  test("after Roy resets the link, the old link doesn't work for a third person", async ({
    page,
    browser,
    baseURL,
  }) => {
    const club = await royWithClub(page);
    const oldPath = await shareLink(page, club);

    const card = joinLinkCard(page);
    await card.getByRole("button", { name: "Reset link" }).click();
    const dialog = page.getByRole("dialog", { name: "Reset the Join link?" });
    await dialog.getByRole("button", { name: "Reset link" }).click();
    await expect(dialog).toBeHidden();
    await expect(card.getByRole("status")).toHaveText("The old link no longer works.");
    await expect
      .poll(async () => (await adminGetDoc(`clubs/${club.id}`))?.joinToken)
      .not.toBe(oldPath.split("/").at(-1));

    const third = await (await browser.newContext({ baseURL })).newPage();
    await third.goto(oldPath);
    await expect(third.getByRole("heading", { level: 1, name: "Join link" })).toBeVisible();
    await expect(third.getByText(DOESNT_WORK)).toBeVisible();
    await expect(third.getByText("Welcome to", { exact: true })).toHaveCount(0);

    // The new link works.
    const newPath = await shareLink(page, club);
    expect(newPath).not.toBe(oldPath);
    await third.goto(newPath);
    await expect(third.getByRole("heading", { level: 2, name: club.name })).toBeVisible();
    await expect(third.getByText(DOESNT_WORK)).toHaveCount(0);

    await third.context().close();
  });
});
