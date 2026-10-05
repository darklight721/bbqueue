import type { EndedSession } from "./types.ts";

/**
 * How many of a Shared club's Ended sessions are shown: the server lists the newest this many per
 * Club (rules can't count, so older ones stay on the server, unlisted), and each device keeps
 * this many per Club to look at offline (ADR-0005).
 */
export const ENDED_SESSIONS_PER_CLUB = 50;

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
