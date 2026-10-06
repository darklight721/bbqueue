import { roleInClub } from "../../domain/clubChanges.ts";
import type { Club } from "../../domain/types.ts";

/**
 * "This device only" on a Local club when there is a Backend (without one every Club is on this
 * device, so there is nothing to tell apart). "Player" on a Shared club where the viewing Account
 * is a Player (New session won't list it, and says why there). Organizer rows get nothing.
 */
export function rowBadge(
  club: Club,
  accountId: string | null | undefined,
  hasBackend: boolean,
): string | null {
  if (club.kind === "local") return hasBackend ? "This device only" : null;
  if (accountId && roleInClub(club, accountId) === "player") return "Player";
  return null;
}

/** "No players", "1 player", "12 players". */
export function playerCountLabel(count: number): string {
  if (count === 0) return "No players";
  return `${count} ${count === 1 ? "player" : "players"}`;
}

/** Alphabetical, ignoring case and accents. */
export function sortClubs(clubs: readonly Club[]): Club[] {
  return [...clubs].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}
