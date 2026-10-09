import type { EndedSession, Session } from "../types.ts";
import { matchPlayerIds } from "./stats.ts";

/**
 * Slim copy of `session` for keeping (ADR-0005): Ended matches (oldest first) and only the
 * Session players who played one. Returns null when there are no Ended matches.
 * Call after Active matches have been ended and Ended matches numbered.
 */
export function toEndedSession(session: Session, endedAt: number): EndedSession | null {
  const ended = session.matches
    .filter((match) => match.status === "ended")
    .sort(
      (a, b) =>
        (a.number ?? Infinity) - (b.number ?? Infinity) ||
        (a.endedAt ?? 0) - (b.endedAt ?? 0) ||
        a.startedAt - b.startedAt,
    );
  if (ended.length === 0) return null;

  const played = new Set(ended.flatMap((match) => matchPlayerIds(match)));
  return {
    id: session.id,
    name: session.name,
    clubId: session.clubId,
    clubName: session.clubName,
    pointSystem: session.pointSystem,
    startedAt: session.startedAt,
    endedAt,
    players: session.players
      .filter((player) => played.has(player.id))
      .map((player) => ({
        id: player.id,
        name: player.name,
        skill: player.skill,
        clubPlayerId: player.clubPlayerId,
      })),
    matches: ended.map((match, index) => ({
      number: match.number ?? index + 1,
      courtNumber: match.courtNumber,
      teams: match.teams,
      target: match.target,
      startedAt: match.startedAt,
      endedAt: match.endedAt ?? endedAt,
      score: match.score,
    })),
  };
}
