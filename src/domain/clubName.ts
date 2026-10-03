import type { Club } from "./types.ts";

/**
 * The Club name to show for a Session or Ended session: the Club's current name while that Club
 * exists (renames show), else the name saved at Start (deleted Club), else null.
 */
export function displayClubName(
  clubId: string | null,
  savedName: string | null,
  clubs: readonly Club[],
): string | null {
  if (clubId === null) return null;
  return clubs.find((club) => club.id === clubId)?.name ?? savedName;
}
