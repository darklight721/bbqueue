import type { Match, Session, SessionSummary, SkillLevel } from "../types.ts";
import { matchPlayerIds } from "./stats.ts";

function winnersOf(match: Match): string[] {
  if (!match.score) return [];
  const [a, b] = match.score;
  if (a === b) return [];
  return [...(a > b ? match.teams[0] : match.teams[1])];
}

/** Summary of the Ended matches in `session`. Call after Active matches have been ended. */
export function buildSummary(session: Session, endedAt: number): SessionSummary {
  const ended = session.matches.filter((match) => match.status === "ended");
  const wins = new Map<string, number>();
  const played = new Map<string, number>();
  for (const match of ended) {
    for (const id of matchPlayerIds(match)) played.set(id, (played.get(id) ?? 0) + 1);
    for (const id of winnersOf(match)) wins.set(id, (wins.get(id) ?? 0) + 1);
  }

  const ranked = session.players
    .filter((player) => (wins.get(player.id) ?? 0) >= 1)
    .map((player) => ({
      name: player.name,
      skill: player.skill satisfies SkillLevel,
      wins: wins.get(player.id)!,
      played: played.get(player.id) ?? 0,
    }))
    .sort((a, b) => b.wins - a.wins || a.played - b.played || a.name.localeCompare(b.name));

  // Competition ranking: equal wins and games played share a place (1, 1, 3).
  let place = 0;
  const topWinners = ranked
    .map((entry, index) => {
      const previous = ranked[index - 1];
      if (!previous || previous.wins !== entry.wins || previous.played !== entry.played) {
        place = index + 1;
      }
      return { place, ...entry };
    })
    .filter((entry) => entry.place <= 3);

  return {
    sessionName: session.name,
    totalMatches: ended.length,
    totalPlayers: played.size,
    startedAt: session.startedAt,
    endedAt,
    topWinners,
  };
}
