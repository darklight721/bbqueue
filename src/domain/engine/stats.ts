import type { Court, Match, PointSystem, Session } from "../types.ts";

export const MINUTE_MS = 60_000;

/** Fairness window: 15 min for 21-point Sessions, 30 min for 31-point Sessions. */
export function fairnessWindowMs(pointSystem: PointSystem): number {
  return (pointSystem === 21 ? 15 : 30) * MINUTE_MS;
}

export function matchPlayerIds(match: Pick<Match, "teams">): string[] {
  return [...match.teams[0], ...match.teams[1]];
}

export interface PlayerHistory {
  /** Consecutive started Matches without a Rest (see spec: Streak). */
  streak: number;
  /** Matches (Active or Ended) started within the Fairness window. */
  recent: number;
  /** Matches (Active or Ended). */
  total: number;
  /** Ended matches only. */
  played: number;
  /** `now − (endedAt of last Ended match ?? joinedAt)`. */
  wait: number;
}

export interface History {
  byPlayer: ReadonlyMap<string, PlayerHistory>;
  /** How many previous started Matches these two played as Partners. */
  partnered(a: string, b: string): number;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Replay all Matches once and derive every per-player number the engine needs. */
export function buildHistory(session: Session, now: number): History {
  const window = fairnessWindowMs(session.pointSystem);
  const byPlayer = new Map<string, PlayerHistory>();
  const lastEnded = new Map<string, number>();
  const partners = new Map<string, number>();
  for (const player of session.players) {
    byPlayer.set(player.id, { streak: 0, recent: 0, total: 0, played: 0, wait: 0 });
  }

  const ordered = [...session.matches].sort((a, b) => a.startedAt - b.startedAt);
  for (const match of ordered) {
    const inMatch = new Set(matchPlayerIds(match));
    const free = new Set(match.freeAtStart);
    for (const team of match.teams) {
      const key = pairKey(team[0], team[1]);
      partners.set(key, (partners.get(key) ?? 0) + 1);
    }
    for (const player of session.players) {
      const entry = byPlayer.get(player.id)!;
      const played = inMatch.has(player.id);
      if (played) {
        entry.total += 1;
        if (match.startedAt >= now - window) entry.recent += 1;
        if (match.status === "ended") {
          entry.played += 1;
          lastEnded.set(
            player.id,
            Math.max(lastEnded.get(player.id) ?? -Infinity, match.endedAt ?? 0),
          );
        }
      }
      // Sitting out resets the Streak: only Matches started after the reset count.
      const resetAt = session.streakResetAt[player.id] ?? -Infinity;
      if (match.startedAt <= resetAt) continue;
      if (played) entry.streak += 1;
      else if (free.has(player.id)) entry.streak = 0;
    }
  }
  for (const player of session.players) {
    byPlayer.get(player.id)!.wait = now - (lastEnded.get(player.id) ?? player.joinedAt);
  }
  return {
    byPlayer,
    partnered: (a, b) => partners.get(pairKey(a, b)) ?? 0,
  };
}

export function sortedCourts(session: Session): Court[] {
  return [...session.courts].sort((a, b) => a.number - b.number);
}

export function isIdle(court: Court): boolean {
  return court.activeMatchId === null;
}
