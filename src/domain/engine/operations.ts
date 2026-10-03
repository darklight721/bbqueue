import type {
  Court,
  Match,
  PointSystem,
  Session,
  SessionPlayer,
  EndedSession,
  SkillLevel,
  Team,
} from "../types.ts";
import { findDuplicateName, namesEqual, normalizeName } from "../validation.ts";
import { makeId, type EngineContext } from "./context.ts";
import { fillLineups, releasePlayers, rehashLineup, setLineup, updateCourt } from "./lineups.ts";
import { canMoveQueue, clearPlayerFromQueues, queueTeams } from "./queues.ts";
import { rehashAllLineups } from "./rehashAll.ts";
import { validateScore } from "./scoring.ts";
import { busyPlayerIds, freePlayerIds } from "./select.ts";
import { toEndedSession } from "./endedSession.ts";
import { isIdle } from "./stats.ts";

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
  /** The Club's name at Start; null when there is no Club. */
  clubName: string | null;
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
    clubName: input.clubName,
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

export type CreateSessionError =
  | "name-required"
  | "courts-out-of-range"
  | "hours-out-of-range"
  | "too-few-players"
  | "player-name-required"
  | "duplicate-name";

export const MIN_PLAYERS = 4;
export const MIN_HOURS = 1;
export const MAX_HOURS = 12;

/** Everything wrong with a `createSession` input; empty means it is safe to create. */
export function validateCreateSessionInput(input: CreateSessionInput): CreateSessionError[] {
  const errors: CreateSessionError[] = [];
  if (normalizeName(input.name) === "") errors.push("name-required");
  if (!Number.isInteger(input.courts) || input.courts < 1 || input.courts > MAX_COURTS) {
    errors.push("courts-out-of-range");
  }
  if (!(input.plannedHours >= MIN_HOURS && input.plannedHours <= MAX_HOURS)) {
    errors.push("hours-out-of-range");
  }
  if (input.players.length < MIN_PLAYERS) errors.push("too-few-players");
  const names = input.players.map((player) => player.name);
  if (names.some((name) => normalizeName(name) === "")) errors.push("player-name-required");
  if (
    names.some((name, i) => name.trim() !== "" && findDuplicateName(name, names.slice(0, i)) !== -1)
  ) {
    errors.push("duplicate-name");
  }
  return errors;
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
    target: session.pointSystem,
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
  | "player-not-found"
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
  if (score !== null && validateScore(score, match.target) !== null) {
    return fail("invalid-score");
  }
  const ended = session.matches.map((candidate) =>
    candidate.id === matchId
      ? { ...candidate, status: "ended" as const, endedAt: ctx.now, score }
      : candidate,
  );
  const next: Session = {
    ...session,
    streakResetAt: applyDeferredRests(session, match, ctx.now),
    matches: renumberEnded(ended),
    courts: session.courts.map((court) =>
      court.activeMatchId === matchId ? { ...court, activeMatchId: null } : court,
    ),
  };
  return ok(fillLineups(next, ctx));
}

/**
 * "Sitting out after this match": players who sat out while on court get their Streak reset
 * when that match ends or is removed. The match itself still counts normally.
 */
function applyDeferredRests(session: Session, match: Match, now: number): Record<string, number> {
  const resets = { ...session.streakResetAt };
  for (const id of [...match.teams[0], ...match.teams[1]]) {
    if (session.players.find((player) => player.id === id)?.sittingOut) resets[id] = now;
  }
  return resets;
}

/**
 * Delete a Match as if it never happened.
 *
 * Known trade-off: Matches that started while this one was Active recorded its players as
 * not Free, so those players lose the Rest credit they would otherwise have earned from them.
 */
export function removeMatch(
  session: Session,
  matchId: string,
  ctx: EngineContext,
): Result<"match-not-found"> {
  if (!session.matches.some((match) => match.id === matchId)) return fail("match-not-found");
  const removed = session.matches.find((match) => match.id === matchId)!;
  const next: Session = {
    ...session,
    streakResetAt:
      removed.status === "active"
        ? applyDeferredRests(session, removed, ctx.now)
        : session.streakResetAt,
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
  // A removed player with the same name comes back as themselves (same id and history).
  const returning = session.players.find(
    (candidate) => candidate.removed && namesEqual(candidate.name, name),
  );
  if (returning) {
    const restored: SessionPlayer = {
      ...returning,
      name,
      skill: input.skill,
      clubPlayerId: input.clubPlayerId ?? returning.clubPlayerId,
      removed: false,
      sittingOut: false,
    };
    const players = session.players.map((p) => (p.id === returning.id ? restored : p));
    return ok(fillLineups({ ...session, players }, ctx));
  }
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

/**
 * Sit a player out or bring them back.
 *
 * Free / in a Lineup: the Streak resets now and a Lineup spot is replaced. On court: allowed,
 * but nothing changes until the Active match ends or is removed ("Sitting out after this
 * match"); the match counts normally and the Streak resets then.
 */
export function setSittingOut(
  session: Session,
  playerId: string,
  sittingOut: boolean,
  ctx: EngineContext,
): Result<"player-not-found"> {
  const player = findPlayer(session, playerId);
  if (!player) return fail("player-not-found");
  if (player.sittingOut === sittingOut) return ok(session);
  const onCourt = busyPlayerIds(session).has(playerId);
  const resetNow = sittingOut && !onCourt;
  const changed: Session = {
    ...session,
    players: session.players.map((p) => (p.id === playerId ? { ...p, sittingOut } : p)),
    streakResetAt: resetNow
      ? { ...session.streakResetAt, [playerId]: ctx.now }
      : session.streakResetAt,
  };
  const released = resetNow ? releasePlayers(changed, [playerId], ctx) : changed;
  return ok(fillLineups(released, ctx));
}

// ---------------------------------------------------------------- point system

/** Change the Point system for Matches started from now on; Active matches keep their Target. */
export function setPointSystem(
  session: Session,
  pointSystem: PointSystem,
  _ctx: EngineContext,
): Result<"invalid-point-system"> {
  if (pointSystem !== 21 && pointSystem !== 31) return fail("invalid-point-system");
  if (session.pointSystem === pointSystem) return ok(session);
  return ok({ ...session, pointSystem });
}

// ------------------------------------------------------------------ end session

/**
 * End every Active match without a score and slim the Session down to an Ended session.
 * Returns null when the Session has no Ended matches (nothing to keep).
 */
export function endSession(session: Session, ctx: EngineContext): EndedSession | null {
  const ended: Session = {
    ...session,
    matches: renumberEnded(
      session.matches.map((match) =>
        match.status === "active"
          ? { ...match, status: "ended" as const, endedAt: ctx.now, score: null }
          : match,
      ),
    ),
  };
  return toEndedSession(ended, ctx.now);
}
