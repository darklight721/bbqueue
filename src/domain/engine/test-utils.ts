import type { Match, PointSystem, Session, SessionPlayer, SkillLevel, Team } from "../types.ts";
import { createRng } from "./rng.ts";
import type { EngineContext } from "./context.ts";
import { lineupPlayerIds } from "./select.ts";
import { matchPlayerIds } from "./stats.ts";

export const MIN = 60_000;
export const T0 = 1_000_000_000_000;

/** Deterministic context: seeded rng and a counter-based id generator. */
export function makeCtx(seed = 1, now = T0): EngineContext & { now: number } {
  let counter = 0;
  return { now, rng: createRng(seed), newId: () => `id-${++counter}` };
}

export function at(ctx: EngineContext, now: number): EngineContext {
  return { ...ctx, now };
}

export function player(
  id: string,
  skill: SkillLevel = "intermediate",
  joinedAt = T0,
): SessionPlayer {
  return { id, name: id, skill, clubPlayerId: null, sittingOut: false, removed: false, joinedAt };
}

export function playersNamed(count: number, skill: SkillLevel = "intermediate"): SessionPlayer[] {
  return Array.from({ length: count }, (_, i) => player(`p${i + 1}`, skill));
}

export function match(options: {
  id: string;
  court?: number;
  teams: [Team, Team];
  startedAt: number;
  endedAt?: number | null;
  score?: [number, number] | null;
  freeAtStart?: string[];
  number?: number | null;
  target?: PointSystem;
}): Match {
  const endedAt = options.endedAt ?? null;
  return {
    id: options.id,
    number: options.number ?? null,
    courtNumber: options.court ?? 1,
    teams: options.teams,
    freeAtStart: options.freeAtStart ?? [],
    startedAt: options.startedAt,
    target: options.target ?? 21,
    endedAt,
    score: options.score ?? null,
    status: endedAt === null ? "active" : "ended",
  };
}

/** Hand-built Session with empty Lineups; Courts get ids `c1…cN`. */
export function session(options: {
  players: SessionPlayer[];
  courts?: number;
  pointSystem?: PointSystem;
  matches?: Match[];
  streakResetAt?: Record<string, number>;
}): Session {
  const matches = options.matches ?? [];
  return {
    id: "s",
    name: "Test",
    clubId: null,
    clubName: null,
    pointSystem: options.pointSystem ?? 21,
    plannedHours: 2,
    startedAt: T0,
    players: options.players,
    courts: Array.from({ length: options.courts ?? 1 }, (_, i) => ({
      id: `c${i + 1}`,
      number: i + 1,
      lineup: null,
      activeMatchId:
        matches.find((m) => m.status === "active" && m.courtNumber === i + 1)?.id ?? null,
    })),
    matches,
    queues: [],
    streakResetAt: options.streakResetAt ?? {},
  };
}

export function unwrap(
  result: { ok: true; session: Session } | { ok: false; reason: string },
): Session {
  if (!result.ok) throw new Error(`Unexpected rejection: ${result.reason}`);
  return result.session;
}

export function lineupSet(session: Session, courtNumber: number): string[] {
  const court = session.courts.find((c) => c.number === courtNumber)!;
  return lineupPlayerIds(court.lineup).sort();
}

export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** Hard-rule and consistency violations; an empty list means the Session is sound. */
export function violations(session: Session): string[] {
  const problems: string[] = [];
  const byId = new Map(session.players.map((p) => [p.id, p]));
  const activeIds = new Map<string, string>();
  const numbers = new Set<number>();

  for (const m of session.matches) {
    const ids = matchPlayerIds(m);
    if (new Set(ids).size !== 4) problems.push(`match ${m.id} lacks 4 distinct players`);
    if (m.status === "active") {
      for (const id of ids) {
        if (activeIds.has(id)) problems.push(`${id} in two active matches`);
        activeIds.set(id, m.id);
      }
      const court = session.courts.find((c) => c.number === m.courtNumber);
      if (court?.activeMatchId !== m.id)
        problems.push(`court ${m.courtNumber} does not own ${m.id}`);
    } else {
      if (m.number === null || numbers.has(m.number)) problems.push(`bad number on ${m.id}`);
      numbers.add(m.number ?? -1);
    }
  }
  const ended = session.matches.filter((m) => m.status === "ended").length;
  for (let n = 1; n <= ended; n++) if (!numbers.has(n)) problems.push(`missing match number ${n}`);

  const held = new Set<string>();
  for (const court of session.courts) {
    if (court.activeMatchId !== null) {
      const m = session.matches.find((x) => x.id === court.activeMatchId);
      if (m?.status !== "active") problems.push(`court ${court.number} points at a missing match`);
      if (court.lineup) problems.push(`busy court ${court.number} has a lineup`);
    }
    if (!court.lineup) continue;
    const ids = lineupPlayerIds(court.lineup);
    if (new Set(ids).size !== 4)
      problems.push(`lineup on ${court.number} lacks 4 distinct players`);
    for (const id of ids) {
      const p = byId.get(id);
      if (!p || p.removed || p.sittingOut) problems.push(`${id} unavailable but in a lineup`);
      if (activeIds.has(id)) problems.push(`${id} in a lineup and an active match`);
      if (held.has(id)) problems.push(`${id} in two lineups`);
      held.add(id);
    }
  }
  // Fill completeness: no Idle Court may lack a Lineup while 4+ Free players are unheld.
  const busy = new Set(activeIds.keys());
  const unheldFree = session.players.filter(
    (p) => !p.removed && !p.sittingOut && !busy.has(p.id) && !held.has(p.id),
  ).length;
  const emptyIdle = session.courts.filter((c) => c.activeMatchId === null && !c.lineup).length;
  if (emptyIdle > 0 && unheldFree >= 4) {
    problems.push(`${emptyIdle} idle court(s) empty while ${unheldFree} free players are unheld`);
  }
  const numbersOfCourts = session.courts.map((c) => c.number);
  if (new Set(numbersOfCourts).size !== numbersOfCourts.length)
    problems.push("duplicate court numbers");
  for (const queue of session.queues) {
    const ids = queue.slots.flat().filter((id): id is string => id !== null);
    if (new Set(ids).size !== ids.length) problems.push(`duplicate player in queue ${queue.id}`);
    for (const id of ids)
      if (!byId.get(id) || byId.get(id)!.removed) problems.push(`stale ${id} in queue`);
  }
  return problems;
}
