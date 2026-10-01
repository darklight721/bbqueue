import type {
  Court,
  Match,
  PointSystem,
  Session,
  SessionPlayer,
  SessionSummary,
  SkillLevel,
  Team,
} from "../types.ts";
import { normalizeName, findDuplicateName } from "../validation.ts";
import { makeId, type EngineContext } from "./context.ts";
import { fillLineups, releasePlayers, rehashLineup, setLineup, updateCourt } from "./lineups.ts";
import { canMoveQueue, clearPlayerFromQueues, queueTeams } from "./queues.ts";
import { rehashAllLineups } from "./rehashAll.ts";
import { validateScore } from "./scoring.ts";
import { busyPlayerIds, freePlayerIds } from "./select.ts";
import { buildSummary } from "./summary.ts";
import { isIdle, sortedCourts } from "./stats.ts";

export const MAX_COURTS = 10;

type Ok = { ok: true; session: Session };
type Fail<Reason extends string> = { ok: false; reason: Reason };
export type Result<Reason extends string> = Ok | Fail<Reason>;

const ok = (session: Session): Ok => ({ ok: true, session });
const fail = <Reason extends string>(reason: Reason): Fail<Reason> => ({ ok: false, reason });

// -------------------------------------------------------------------- creation

export interface NewPlayerInput {
  name: string;
  skill: SkillLevel;
  clubPlayerId?: string | null;
}

export interface CreateSessionInput {
  name: string;
  clubId: string | null;
  pointSystem: PointSystem;
  plannedHours: number;
  courts: number;
  players: NewPlayerInput[];
}

function snapshotPlayer(input: NewPlayerInput, ctx: EngineContext): SessionPlayer {
  return {
    id: makeId(ctx),
    name: normalizeName(input.name),
    skill: input.skill,
    clubPlayerId: input.clubPlayerId ?? null,
    sittingOut: false,
    removed: false,
    joinedAt: ctx.now,
  };
}

/** New Session: snapshot players (ADR-0002), Courts 1..n, initial Lineups. */
export function createSession(input: CreateSessionInput, ctx: EngineContext): Session {
  const courts: Court[] = Array.from({ length: input.courts }, (_, i) => ({
    id: makeId(ctx),
    number: i + 1,
    lineup: null,
    activeMatchId: null,
  }));
  const session: Session = {
    id: makeId(ctx),
    name: input.name,
    clubId: input.clubId,
    pointSystem: input.pointSystem,
    plannedHours: input.plannedHours,
    startedAt: ctx.now,
    players: input.players.map((player) => snapshotPlayer(player, ctx)),
    courts,
    matches: [],
    queues: [],
    streakResetAt: {},
  };
  return fillLineups(session, ctx);
}

export function fill(session: Session, ctx: EngineContext): Session {
  return fillLineups(session, ctx);
}

// -------------------------------------------------------------------- lineups

export function rehashCourt(
  session: Session,
  courtId: string,
  ctx: EngineContext,
): Result<"court-not-found" | "court-busy"> {
  const court = session.courts.find((candidate) => candidate.id === courtId);
  if (!court) return fail("court-not-found");
  if (!isIdle(court)) return fail("court-busy");
  return ok(rehashLineup(session, courtId, ctx));
}

export function canRehashAll(session: Session): boolean {
  return session.courts.filter(isIdle).length >= 2;
}

export function rehashAll(session: Session, ctx: EngineContext): Result<"not-enough-idle-courts"> {
  if (!canRehashAll(session)) return fail("not-enough-idle-courts");
  return ok(rehashAllLineups(session, ctx));
}

// --------------------------------------------------------------------- matches

function beginMatch(
  session: Session,
  court: Court,
  teams: [Team, Team],
  ctx: EngineContext,
): Session {
  const inMatch = new Set<string>([...teams[0], ...teams[1]]);
  const match: Match = {
    id: makeId(ctx),
    number: null,
    courtNumber: court.number,
    teams,
    freeAtStart: freePlayerIds(session).filter((id) => !inMatch.has(id)),
    startedAt: ctx.now,
    endedAt: null,
    score: null,
    status: "active",
  };
  const started: Session = { ...session, matches: [...session.matches, match] };
  return updateCourt(started, court.id, (c) => ({ ...c, lineup: null, activeMatchId: match.id }));
}

export function startMatch(
  session: Session,
  courtId: string,
  ctx: EngineContext,
): Result<"court-not-found" | "court-busy" | "no-lineup"> {
  const court = session.courts.find((candidate) => candidate.id === courtId);
  if (!court) return fail("court-not-found");
  if (!isIdle(court)) return fail("court-busy");
  if (!court.lineup) return fail("no-lineup");
  return ok(beginMatch(session, court, court.lineup.teams, ctx));
}

export type MoveQueueReason =
  | "queue-not-found"
  | "court-not-found"
  | "court-busy"
  | "queue-incomplete"
  | "player-on-court";

/** Start a Queue's hand-built Teams on an Idle Court, overriding that Court's Lineup. */
export function moveQueueToCourt(
  session: Session,
  queueId: string,
  courtId: string,
  ctx: EngineContext,
): Result<MoveQueueReason> {
  const queue = session.queues.find((candidate) => candidate.id === queueId);
  if (!queue) return fail("queue-not-found");
  const court = session.courts.find((candidate) => candidate.id === courtId);
  if (!court) return fail("court-not-found");
  const check = canMoveQueue(session, queue, court);
  if (!check.ok) return fail(check.reason);
  const teams = queueTeams(queue)!;
  const queued = new Set<string>([...teams[0], ...teams[1]]);

  const back: Session = {
    ...session,
    players: session.players.map((player) =>
      queued.has(player.id) ? { ...player, sittingOut: false } : player,
    ),
    queues: session.queues.filter((candidate) => candidate.id !== queueId),
  };
  const started = beginMatch(setLineup(back, court.id, null), court, teams, ctx);
  return ok(fillLineups(releasePlayers(started, [...queued], ctx), ctx));
}

function renumberEnded(matches: readonly Match[]): Match[] {
  const order = matches
    .filter((match) => match.status === "ended")
    .sort(
      (a, b) =>
        (a.endedAt ?? 0) - (b.endedAt ?? 0) ||
        (a.number ?? Infinity) - (b.number ?? Infinity) ||
        a.startedAt - b.startedAt,
    );
  const numbers = new Map(order.map((match, index) => [match.id, index + 1]));
  return matches.map((match) =>
    numbers.has(match.id) ? { ...match, number: numbers.get(match.id)! } : match,
  );
}

export function endMatch(
  session: Session,
  matchId: string,
  score: [number, number] | null,
  ctx: EngineContext,
): Result<"match-not-found" | "match-not-active" | "invalid-score"> {
  const match = session.matches.find((candidate) => candidate.id === matchId);
  if (!match) return fail("match-not-found");
  if (match.status !== "active") return fail("match-not-active");
  if (score !== null && validateScore(score, session.pointSystem) !== null) {
    return fail("invalid-score");
  }
  const ended = session.matches.map((candidate) =>
    candidate.id === matchId
      ? { ...candidate, status: "ended" as const, endedAt: ctx.now, score }
      : candidate,
  );
  const next: Session = {
    ...session,
    matches: renumberEnded(ended),
    courts: session.courts.map((court) =>
      court.activeMatchId === matchId ? { ...court, activeMatchId: null } : court,
    ),
  };
  return ok(fillLineups(next, ctx));
}

/** Delete a Match as if it never happened. */
export function removeMatch(
  session: Session,
  matchId: string,
  ctx: EngineContext,
): Result<"match-not-found"> {
  if (!session.matches.some((match) => match.id === matchId)) return fail("match-not-found");
  const next: Session = {
    ...session,
    matches: renumberEnded(session.matches.filter((match) => match.id !== matchId)),
    courts: session.courts.map((court) =>
      court.activeMatchId === matchId ? { ...court, activeMatchId: null } : court,
    ),
  };
  return ok(fillLineups(next, ctx));
}

// ---------------------------------------------------------------------- courts

export function addCourt(session: Session, ctx: EngineContext): Result<"max-courts"> {
  if (session.courts.length >= MAX_COURTS) return fail("max-courts");
  const used = new Set(session.courts.map((court) => court.number));
  let number = 1;
  while (used.has(number)) number += 1;
  const court: Court = { id: makeId(ctx), number, lineup: null, activeMatchId: null };
  const courts = [...session.courts, court].sort((a, b) => a.number - b.number);
  return ok(fillLineups({ ...session, courts }, ctx));
}

export function removeCourt(
  session: Session,
  courtId: string,
  ctx: EngineContext,
): Result<"court-not-found" | "court-busy"> {
  const court = session.courts.find((candidate) => candidate.id === courtId);
  if (!court) return fail("court-not-found");
  if (!isIdle(court)) return fail("court-busy");
  const next: Session = { ...session, courts: session.courts.filter((c) => c.id !== courtId) };
  return ok(fillLineups(next, ctx));
}

// --------------------------------------------------------------------- players

export function addPlayer(
  session: Session,
  input: NewPlayerInput,
  ctx: EngineContext,
): Result<"name-required" | "duplicate-name"> {
  const name = normalizeName(input.name);
  if (name === "") return fail("name-required");
  const others = session.players.filter((player) => !player.removed).map((player) => player.name);
  if (findDuplicateName(name, others) !== -1) return fail("duplicate-name");
  const player = snapshotPlayer({ ...input, name }, ctx);
  return ok(fillLineups({ ...session, players: [...session.players, player] }, ctx));
}

function findPlayer(session: Session, playerId: string): SessionPlayer | undefined {
  return session.players.find((player) => player.id === playerId && !player.removed);
}

export function removePlayer(
  session: Session,
  playerId: string,
  ctx: EngineContext,
): Result<"player-not-found" | "player-in-active-match"> {
  if (!findPlayer(session, playerId)) return fail("player-not-found");
  if (busyPlayerIds(session).has(playerId)) return fail("player-in-active-match");
  const marked: Session = {
    ...session,
    players: session.players.map((player) =>
      player.id === playerId ? { ...player, removed: true } : player,
    ),
  };
  const released = releasePlayers(clearPlayerFromQueues(marked, playerId), [playerId], ctx);
  return ok(fillLineups(released, ctx));
}

/** Sit a player out (resets their Streak, replaces them in a Lineup) or bring them back. */
export function setSittingOut(
  session: Session,
  playerId: string,
  sittingOut: boolean,
  ctx: EngineContext,
): Result<"player-not-found"> {
  const player = findPlayer(session, playerId);
  if (!player) return fail("player-not-found");
  if (player.sittingOut === sittingOut) return ok(session);
  const changed: Session = {
    ...session,
    players: session.players.map((p) => (p.id === playerId ? { ...p, sittingOut } : p)),
    streakResetAt: sittingOut
      ? { ...session.streakResetAt, [playerId]: ctx.now }
      : session.streakResetAt,
  };
  const released = sittingOut ? releasePlayers(changed, [playerId], ctx) : changed;
  return ok(fillLineups(released, ctx));
}

// ------------------------------------------------------------------ end session

/** End every Active match without a score and summarise the Session. */
export function endSession(
  session: Session,
  ctx: EngineContext,
): { session: Session; summary: SessionSummary } {
  const ended: Session = {
    ...session,
    matches: renumberEnded(
      session.matches.map((match) =>
        match.status === "active"
          ? { ...match, status: "ended" as const, endedAt: ctx.now, score: null }
          : match,
      ),
    ),
    courts: sortedCourts(session).map((court) => ({ ...court, lineup: null, activeMatchId: null })),
  };
  return { session: ended, summary: buildSummary(ended, ctx.now) };
}
