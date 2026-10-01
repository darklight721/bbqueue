import type { Session } from "../types.ts";
import { lineupPlayerIds } from "./select.ts";
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

/**
 * Stats for every player (including removed ones) in one pass over Matches and Courts.
 * Compute this once per render/tick and look players up in the map.
 *
 * `status` stays `on-court` while a player is in an Active match, even if they are Sitting
 * out; the UI combines it with the player's `sittingOut` flag ("Sitting out after this match").
 */
export function allPlayerStats(session: Session, now: number): Map<string, PlayerStats> {
  const history = buildHistory(session, now);
  const onCourtNumber = new Map<string, number>();
  for (const match of session.matches) {
    if (match.status !== "active") continue;
    for (const id of matchPlayerIds(match)) onCourtNumber.set(id, match.courtNumber);
  }
  const lineupNumber = new Map<string, number>();
  for (const court of session.courts) {
    for (const id of lineupPlayerIds(court.lineup)) lineupNumber.set(id, court.number);
  }

  const result = new Map<string, PlayerStats>();
  for (const player of session.players) {
    const h = history.byPlayer.get(player.id)!;
    let status: PlayerStatus = "free";
    let courtNumber: number | null = null;
    if (player.removed) status = "removed";
    else if (onCourtNumber.has(player.id)) {
      status = "on-court";
      courtNumber = onCourtNumber.get(player.id)!;
    } else if (lineupNumber.has(player.id)) {
      status = "in-lineup";
      courtNumber = lineupNumber.get(player.id)!;
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

/**
 * Convenience for a single player. It recomputes everything, so rendering a list should call
 * `allPlayerStats` once instead of this per player.
 */
export function playerStats(session: Session, playerId: string, now: number): PlayerStats | null {
  return allPlayerStats(session, now).get(playerId) ?? null;
}
