import type { SessionPlayer, Team } from "../../domain/types.ts";

/** "Ana & Ben" — used for score labels and summaries. */
export function teamNames(team: Team, playerById: ReadonlyMap<string, SessionPlayer>): string {
  return team.map((id) => playerById.get(id)?.name ?? "Unknown").join(" & ");
}
