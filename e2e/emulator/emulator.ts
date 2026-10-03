import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import {
  adminGetDoc,
  adminListDocs,
  adminSetDoc,
  clearEmulator,
} from "../../src/test/emulatorAdmin.ts";
import type { Account, Club, ClubPlayer } from "../../src/domain/types.ts";
import { readStoredData } from "../fixtures.ts";

/**
 * Helpers for the specs in this folder, which run on the Firebase emulators so that two browser
 * contexts really share a server.
 *
 * The specs run in parallel and share the emulators, so they don't clear them between tests;
 * `global-setup.ts` clears them once per run. Instead every test uses its own data: people from
 * `signUp` get a random Account ID, and Clubs get ids from `uniqueId`.
 */
export { adminGetDoc, adminListDocs, adminSetDoc, clearEmulator };

let counter = 0;
/** An id no other test uses. */
export function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${process.pid}-${++counter}`;
}

/** A new person on a new device: its own browser context, so its own anonymous sign-in. */
export async function newPerson(browser: Browser, baseURL: string | undefined): Promise<Page> {
  const context: BrowserContext = await browser.newContext({ baseURL });
  return context.newPage();
}

/** First launch → Welcome → name → Home. Returns the Account that was created on the server. */
export async function signUp(page: Page, name: string): Promise<Account> {
  await page.goto("/");
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "BBQueue", exact: true })).toBeVisible();
  let account: Account | null = null;
  await expect
    .poll(async () => (account = await readStoredData<Account>(page, "account")))
    .not.toBeNull();
  return account!;
}

/** What the server holds for an Account ID, or null. */
export async function serverAccountFor(accountId: string) {
  const reservation = await adminGetDoc(`accountIds/${accountId.toLowerCase()}`);
  if (!reservation) return null;
  const account = await adminGetDoc(`accounts/${reservation.uid as string}`);
  return account ? { uid: reservation.uid as string, ...account } : null;
}

/**
 * Put a Shared club on the server, with Security Rules out of the way. The member and Organizer
 * lists are worked out from the rows' links, like the app does.
 */
export async function seedSharedClub(club: Club): Promise<void> {
  const linked = club.players.flatMap((player) => (player.link ? [player.link] : []));
  const lower = (ids: string[]) => ids.map((id) => id.toLowerCase());
  await adminSetDoc(`clubs/${club.id}`, {
    name: club.name,
    memberAccountIds: lower(linked.map((link) => link.accountId)),
    organizerAccountIds: lower(
      linked.filter((link) => link.role === "organizer").map((link) => link.accountId),
    ),
  });
  for (const player of club.players) {
    await adminSetDoc(`clubs/${club.id}/players/${player.id}`, {
      name: player.name,
      skill: player.skill,
      ...(player.link
        ? { link: { accountId: player.link.accountId, role: player.link.role } }
        : {}),
    });
  }
}

/** A Shared club as the server has it (rows in no particular order), or null. */
export async function readServerClub(clubId: string): Promise<Club | null> {
  const club = await adminGetDoc(`clubs/${clubId}`);
  if (!club) return null;
  const rows = await adminListDocs(`clubs/${clubId}/players`);
  return {
    id: clubId,
    name: club.name as string,
    kind: "shared",
    players: rows.map(({ id, data }): ClubPlayer => {
      const link = data.link as { accountId: string; role: "organizer" | "player" } | undefined;
      return {
        id,
        name: data.name as string,
        skill: data.skill as ClubPlayer["skill"],
        ...(link ? { link } : {}),
      };
    }),
  };
}
