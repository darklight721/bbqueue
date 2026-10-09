import type { EndedSession, EndedSessionMatch, SessionSummary, StandingsEntry } from "../types.ts";
import { matchPlayerIds } from "./stats.ts";

/** Winning and losing Team of a scored match; empty for unscored or level matches. */
function sides(match: EndedSessionMatch): { winners: string[]; losers: string[] } {
  if (!match.score) return { winners: [], losers: [] };
  const [a, b] = match.score;
  if (a === b) return { winners: [], losers: [] };
  const [winners, losers] = a > b ? match.teams : [match.teams[1], match.teams[0]];
  return { winners: [...winners], losers: [...losers] };
}

function bump(counts: Map<string, number>, id: string): void {
  counts.set(id, (counts.get(id) ?? 0) + 1);
}

/**
 * Standings: every player who played at least one match (scored or not), ranked: wins desc,
 * losses asc, played desc (name only orders the display). Level on all three share a place
 * (competition ranking: 1, 1, 3). Players who never played are left out.
 */
export function rankStandings(ended: EndedSession): StandingsEntry[] {
  const wins = new Map<string, number>();
  const losses = new Map<string, number>();
  const played = new Map<string, number>();
  for (const match of ended.matches) {
    for (const id of matchPlayerIds(match)) bump(played, id);
    const { winners, losers } = sides(match);
    for (const id of winners) bump(wins, id);
    for (const id of losers) bump(losses, id);
  }

  const ranked = ended.players
    .filter((player) => (played.get(player.id) ?? 0) >= 1)
    .map((player) => ({
      playerId: player.id,
      clubPlayerId: player.clubPlayerId ?? null,
      name: player.name,
      skill: player.skill,
      wins: wins.get(player.id) ?? 0,
      losses: losses.get(player.id) ?? 0,
      played: played.get(player.id) ?? 0,
    }))
    // Most wins, then fewest losses, then most played; name only fixes the display order.
    .sort(
      (a, b) =>
        b.wins - a.wins ||
        a.losses - b.losses ||
        b.played - a.played ||
        a.name.localeCompare(b.name),
    );

  // Competition ranking: level on wins, losses and played share a place (1, 1, 3).
  let place = 0;
  return ranked.map((entry, index) => {
    const previous = ranked[index - 1];
    if (
      !previous ||
      previous.wins !== entry.wins ||
      previous.losses !== entry.losses ||
      previous.played !== entry.played
    ) {
      place = index + 1;
    }
    return { place, ...entry };
  });
}

/**
 * Summary derived from a stored Ended session. Courts: distinct Courts with at least one Ended
 * match. Top winners: Standings entries placed 3rd or better with at least one win.
 */
export function buildSummary(ended: EndedSession): SessionSummary {
  const topWinners = rankStandings(ended).filter((entry) => entry.place <= 3 && entry.wins >= 1);
  return {
    sessionName: ended.name,
    totalMatches: ended.matches.length,
    totalPlayers: ended.players.length,
    totalCourts: new Set(ended.matches.map((match) => match.courtNumber)).size,
    startedAt: ended.startedAt,
    endedAt: ended.endedAt,
    topWinners,
  };
}
