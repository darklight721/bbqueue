import { accountIdsEqual } from "../domain/accountId.ts";
import { creatorPlayer } from "../domain/clubChanges.ts";
import { newId } from "../domain/ids.ts";
import type { Account, ClubPlayer } from "../domain/types.ts";
import { BackendError, requireValidName } from "./backend.ts";

/**
 * The roster of a Shared club that is about to be created (ADR-0008):
 * - the creator's own row (the row linked to `creator`) is used as given, and must be an
 * Organizer; without one the default creator row (the Account's name, Intermediate, Organizer)
 * goes first;
 * - every other row may be linked to another Account, as Organizer or Player, each Account once.
 *
 * Returns the whole roster. Links to other Accounts are left for the Backend to look up (their
 * Account ID spelling and uid). Throws a {@link BackendError}: `invalid-name`, `forbidden` (the
 * creator's row isn't an Organizer) or `already-linked` (an Account linked twice).
 */
export function planNewSharedClub(creator: Account, players: readonly ClubPlayer[]): ClubPlayer[] {
  for (const player of players) requireValidName(player.name);

  const seen: string[] = [];
  let sawCreator = false;
  const roster: ClubPlayer[] = [];
  for (const player of players) {
    if (!player.link) {
      roster.push(player);
      continue;
    }
    if (seen.some((accountId) => accountIdsEqual(accountId, player.link!.accountId))) {
      throw new BackendError("already-linked");
    }
    seen.push(player.link.accountId);
    if (accountIdsEqual(player.link.accountId, creator.accountId)) {
      if (player.link.role !== "organizer") throw new BackendError("forbidden");
      sawCreator = true;
      roster.push({ ...player, link: { ...player.link, accountId: creator.accountId } });
    } else {
      roster.push(player);
    }
  }
  return sawCreator ? roster : [creatorPlayer(creator, newId()), ...roster];
}
