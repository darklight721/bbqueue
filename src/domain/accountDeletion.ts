import { accountIdsEqual } from "./accountId.ts";
import type { Club, EndedSession } from "./types.ts";

/** What deleting an Account does to the Shared clubs it is on (ticket 11). */
export interface DeletionPlan {
  /**
   * Shared clubs where this Account is the only Organizer and other Accounts are linked: deleting
   * would leave them without an Organizer. Any here and the Account can't be deleted yet.
   */
  blocked: Club[];
  /** Shared clubs where this is the only linked Account: they go, with their Ended sessions. */
  deleteClubs: { club: Club; endedCount: number }[];
  /** Other Shared clubs where this Account has a row: the row stays, as a plain Club player. */
  unlinkClubs: Club[];
  /**
   * Of the Clubs that stay, those whose Active session this Account hosts. It stays for another
   * Organizer to take over; this device keeps a copy when it has no Session of its own.
   */
  hostedClubs: Club[];
}

/**
 * Works out what deleting `accountId` does. Local clubs are the device's and never part of it. Pure.
 *
 * - Only linked Account of a Shared club: the Club is deleted (rows, Active session, Ended sessions).
 * - Only Organizer of a Shared club with other linked Accounts: blocks the deletion.
 * - Otherwise: the Account's row is unlinked and stays on the roster.
 */
export function planAccountDeletion(input: {
  accountId: string;
  clubs: readonly Club[];
  endedSessions: readonly EndedSession[];
  /** Ids of Shared clubs whose Active session this Account hosts. */
  hostedClubIds: readonly string[];
}): DeletionPlan {
  const plan: DeletionPlan = { blocked: [], deleteClubs: [], unlinkClubs: [], hostedClubs: [] };
  for (const club of input.clubs) {
    if (club.kind !== "shared") continue;
    const mine = club.players.find(
      (row) => row.link && accountIdsEqual(row.link.accountId, input.accountId),
    );
    if (!mine?.link) continue;
    const others = club.players.filter(
      (row) => row.link && !accountIdsEqual(row.link.accountId, input.accountId),
    );
    if (others.length === 0) {
      plan.deleteClubs.push({
        club,
        endedCount: input.endedSessions.filter((ended) => ended.clubId === club.id).length,
      });
    } else if (
      mine.link.role === "organizer" &&
      !others.some((row) => row.link?.role === "organizer")
    ) {
      plan.blocked.push(club);
    } else {
      plan.unlinkClubs.push(club);
      if (input.hostedClubIds.includes(club.id)) plan.hostedClubs.push(club);
    }
  }
  return plan;
}
