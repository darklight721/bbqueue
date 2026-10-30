import type { Court, Lineup, Session } from "../types.ts";
import type { EngineContext } from "./context.ts";
import {
  lineupPlayerIds,
  makeEnv,
  pickDifferentLineup,
  pickLineup,
  pickSwapLineup,
  replaceInLineup,
} from "./select.ts";
import { isIdle, sortedCourts } from "./stats.ts";

export function setLineup(session: Session, courtId: string, lineup: Lineup | null): Session {
  return {
    ...session,
    courts: session.courts.map((court) => (court.id === courtId ? { ...court, lineup } : court)),
  };
}

export function updateCourt(
  session: Session,
  courtId: string,
  change: (court: Court) => Court,
): Session {
  return {
    ...session,
    courts: session.courts.map((court) => (court.id === courtId ? change(court) : court)),
  };
}

/** Give every Idle Court without a Lineup one, lowest number first. Never changes existing Lineups. */
export function fillLineups(session: Session, ctx: EngineContext): Session {
  const env = makeEnv(session, ctx);
  let current = session;
  for (const court of sortedCourts(session)) {
    if (!isIdle(court) || court.lineup !== null) continue;
    const lineup = pickLineup(current, court.id, env);
    if (lineup) current = setLineup(current, court.id, lineup);
  }
  return current;
}

/**
 * Re-pick one Court's Lineup, different from the current one (see `pickDifferentLineup`).
 * Null when nothing different fits the balance limit: the caller keeps the Session as it is.
 * A Court without a Lineup just gets one when it can.
 */
export function rehashLineup(
  session: Session,
  courtId: string,
  ctx: EngineContext,
): Session | null {
  const court = session.courts.find((candidate) => candidate.id === courtId);
  if (!court) return session;
  const lineup = pickDifferentLineup(session, court, makeEnv(session, ctx));
  if (lineup) return setLineup(session, courtId, lineup);
  return court.lineup ? null : session;
}

/** "Swap anyway": bring one player into the Court's Lineup, ignoring Rest and Fairness. Null when nobody can come in. */
export function swapLineup(session: Session, courtId: string, ctx: EngineContext): Session | null {
  const court = session.courts.find((candidate) => candidate.id === courtId);
  if (!court) return null;
  const lineup = pickSwapLineup(session, court, makeEnv(session, ctx));
  return lineup ? setLineup(session, courtId, lineup) : null;
}

/**
 * Replace each of `playerIds` in whichever Lineups hold them (only that player is swapped;
 * a Lineup with no Candidate left becomes null). Callers must already have made the players
 * unavailable (removed, sitting out, or in an Active match).
 */
export function releasePlayers(
  session: Session,
  playerIds: readonly string[],
  ctx: EngineContext,
): Session {
  const env = makeEnv(session, ctx);
  let current = session;
  for (const { id: courtId } of sortedCourts(session)) {
    for (const playerId of playerIds) {
      const court = current.courts.find((candidate) => candidate.id === courtId)!;
      if (!lineupPlayerIds(court.lineup).includes(playerId)) continue;
      current = setLineup(current, courtId, replaceInLineup(current, court, playerId, env));
    }
  }
  return current;
}
