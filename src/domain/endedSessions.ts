import type { EndedSession } from "./types.ts";

/**
 * How many of a Shared club's Ended sessions are shown: the server lists the newest this many per
 * Club (rules can't count, so older ones stay on the server, unlisted), and each device keeps
 * this many per Club to look at offline (ADR-0005).
 */
export const ENDED_SESSIONS_PER_CLUB = 50;

/**
 * Whether the server, as `report` tells it, has no longer got `ended` although it would have
 * listed it: the Club is one whose list the server confirmed (not `unknown`), and `ended` falls
 * within what the report covers, yet isn't in it.
 *
 * A report lists the newest `count` per Club. Fewer than that: it is the Club's whole list. Exactly
 * that many: it covers only what is newer than its oldest entry (older ones are just outside the
 * list, not gone; one with the oldest entry's own time is left too, as the order among equals is
 * the server's).
 */
export function isGoneFromServer(
  report: {
    sessions: readonly EndedSession[];
    clubIds: readonly string[];
    unknown?: readonly string[];
  },
  ended: EndedSession,
  count = ENDED_SESSIONS_PER_CLUB,
): boolean {
  const clubId = ended.clubId;
  if (!clubId || !report.clubIds.includes(clubId) || report.unknown?.includes(clubId)) return false;
  const listed = report.sessions.filter((other) => other.clubId === clubId);
  if (listed.some((other) => other.id === ended.id)) return false;
  if (listed.length < count) return true;
  const oldest = Math.min(...listed.map((other) => other.endedAt));
  return ended.endedAt > oldest;
}

/** The `count` newest Ended sessions of each Club, newest first. */
export function newestPerClub(
  sessions: readonly EndedSession[],
  count = ENDED_SESSIONS_PER_CLUB,
): EndedSession[] {
  const perClub = new Map<string, number>();
  return [...sessions]
    .sort((a, b) => b.endedAt - a.endedAt)
    .filter((ended) => {
      const key = ended.clubId ?? "";
      const n = (perClub.get(key) ?? 0) + 1;
      perClub.set(key, n);
      return n <= count;
    });
}
