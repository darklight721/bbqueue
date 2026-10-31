import type { Lineup, Session } from "../types.ts";
import {
  bestSplitOf,
  compareNumbers,
  fairSets,
  freePlayerIds,
  heldPlayerIds,
  makeEnv,
  restKey,
  restsTier,
  type Env,
} from "./select.ts";

/** The strongest reason a player is where they are in Up next. */
export type UpNextReason =
  | { kind: "resting" }
  | { kind: "sat-out"; count: number }
  | { kind: "played-fewer"; count: number }
  | { kind: "waiting"; ms: number };

export interface UpNextRow {
  playerId: string;
  reason: UpNextReason;
}

export interface UpNext {
  /** The next four, or every free player when fewer than four are free; best placed first. */
  rows: UpNextRow[];
  /** The four split into Teams as a Lineup; null with fewer than four free. */
  lineup: Lineup | null;
}

/**
 * Up next (see GLOSSARY): the four players the app would put in a Lineup if a Court freed up
 * now, picked from the free players not in a Lineup. Null until the Session's first Match has
 * started.
 *
 * Ties are settled without randomness, so every device shows the same four for the same Session
 * and `now`.
 */
export function upNext(session: Session, now: number): UpNext | null {
  if (session.matches.length === 0) return null;
  const env = makeEnv(session, { now, rng: () => 0 });
  const held = heldPlayerIds(session);
  // Roster order, as a Lineup sees its Candidates, so ties settle the way a Lineup's would.
  const candidates = freePlayerIds(session).filter((id) => !held.has(id));
  const lineup = candidates.length >= 4 ? bestSplitOf(fairSets(candidates, env), env) : null;
  const shown = lineup ? [...lineup.teams[0], ...lineup.teams[1]] : candidates;

  const joinedAt = new Map(session.players.map((player) => [player.id, player.joinedAt]));
  const rankOf = (id: string) => {
    const h = env.history.byPlayer.get(id)!;
    return [restKey(env, id), -restsTier(env, id), h.recent, h.total, -h.wait, joinedAt.get(id)!];
  };
  const mostPlayed = Math.max(
    0,
    ...session.players
      .filter((player) => !player.removed && !player.sittingOut)
      .map((player) => env.history.byPlayer.get(player.id)!.total),
  );
  return {
    rows: [...shown]
      .sort((a, b) => compareNumbers(rankOf(a), rankOf(b)))
      .map((playerId) => ({ playerId, reason: reasonFor(env, playerId, mostPlayed) })),
    lineup,
  };
}

/** `waiting` is the fallback: the UI shows it only from a minute on, counting from `now`. */
function reasonFor(env: Env, id: string, mostPlayed: number): UpNextReason {
  const h = env.history.byPlayer.get(id)!;
  if (restKey(env, id) > 0) return { kind: "resting" };
  if (restsTier(env, id) > 0) return { kind: "sat-out", count: h.rests };
  if (mostPlayed - h.total >= 1) return { kind: "played-fewer", count: mostPlayed - h.total };
  return { kind: "waiting", ms: h.wait };
}
