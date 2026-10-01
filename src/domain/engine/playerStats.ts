import type { Session } from "../types.ts";
import { busyPlayerIds, lineupPlayerIds } from "./select.ts";
import { buildHistory, matchPlayerIds } from "./stats.ts";

export type PlayerStatus = "on-court" | "in-lineup" | "sitting-out" | "free" | "removed";

export interface PlayerStats {
  streak: number;
  /** Matches (Active or Ended) within the Fairness window. */
  recent: number;
  /** Matches (Active or Ended). */
  total: number;
  /** Ended matches only; what the UI shows next to every player. */
  matchesPlayed: number;
  /** Milliseconds since their last Ended match (or since joining). */
  wait: number;
  status: PlayerStatus;
  /** Court number for `on-court` / `in-lineup`, otherwise null. */
  courtNumber: number | null;
}

/** Stats for every player (including removed ones) in one pass. */
export function allPlayerStats(session: Session, now: number): Map<string, PlayerStats> {
  const history = buildHistory(session, now);
  const busy = busyPlayerIds(session);
  const result = new Map<string, PlayerStats>();
  for (const player of session.players) {
    const h = history.byPlayer.get(player.id)!;
    let status: PlayerStatus = "free";
    let courtNumber: number | null = null;
    const match = session.matches.find(
      (m) => m.status === "active" && matchPlayerIds(m).includes(player.id),
    );
    const court = session.courts.find((c) => lineupPlayerIds(c.lineup).includes(player.id));
    if (player.removed) status = "removed";
    else if (busy.has(player.id)) {
      status = "on-court";
      courtNumber = match?.courtNumber ?? null;
    } else if (court) {
      status = "in-lineup";
      courtNumber = court.number;
    } else if (player.sittingOut) status = "sitting-out";
    result.set(player.id, {
      streak: h.streak,
      recent: h.recent,
      total: h.total,
      matchesPlayed: h.played,
      wait: h.wait,
      status,
      courtNumber,
    });
  }
  return result;
}

export function playerStats(session: Session, playerId: string, now: number): PlayerStats | null {
  return allPlayerStats(session, now).get(playerId) ?? null;
}
