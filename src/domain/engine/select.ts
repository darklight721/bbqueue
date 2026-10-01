import type { Court, Lineup, Session, Team } from "../types.ts";
import { SKILL_VALUE } from "../types.ts";
import type { EngineContext } from "./context.ts";
import { buildHistory, matchPlayerIds, type History } from "./stats.ts";

/** The tie pool is cut to this many longest-waiting players before enumerating combinations. */
const MAX_POOL = 12;

export type Split = [Team, Team];
type Key = readonly [rest: number, recent: number, total: number];
type Score = number[];

/** Everything selection needs, computed once per operation. */
export interface Env {
  history: History;
  skill: ReadonlyMap<string, number>;
  rng: () => number;
}

export function makeEnv(session: Session, ctx: EngineContext): Env {
  return {
    history: buildHistory(session, ctx.now),
    skill: new Map(session.players.map((player) => [player.id, SKILL_VALUE[player.skill]])),
    rng: ctx.rng,
  };
}

// ---------------------------------------------------------------- availability

export function busyPlayerIds(session: Session): Set<string> {
  const ids = new Set<string>();
  for (const match of session.matches) {
    if (match.status === "active") for (const id of matchPlayerIds(match)) ids.add(id);
  }
  return ids;
}

export function lineupPlayerIds(lineup: Lineup | null): string[] {
  return lineup ? [...lineup.teams[0], ...lineup.teams[1]] : [];
}

/** Players held by Lineups, optionally ignoring one Court's Lineup. */
export function heldPlayerIds(session: Session, exceptCourtId?: string): Set<string> {
  const ids = new Set<string>();
  for (const court of session.courts) {
    if (court.id === exceptCourtId) continue;
    for (const id of lineupPlayerIds(court.lineup)) ids.add(id);
  }
  return ids;
}

/** Free players: in the Session, not removed, not Sitting out, not in an Active match. */
export function freePlayerIds(session: Session): string[] {
  const busy = busyPlayerIds(session);
  return session.players
    .filter((player) => !player.removed && !player.sittingOut && !busy.has(player.id))
    .map((player) => player.id);
}

/** Candidates for a Lineup on `courtId`: Free and not held by a Lineup on another Court. */
export function candidatesFor(session: Session, courtId: string): string[] {
  const held = heldPlayerIds(session, courtId);
  return freePlayerIds(session).filter((id) => !held.has(id));
}

// --------------------------------------------------------------------- ranking

export function rankKey(env: Env, id: string): Key {
  const h = env.history.byPlayer.get(id)!;
  // Graded Rest: a Streak of 1 is fine, longer Streaks are progressively rested first.
  return [Math.max(0, h.streak - 1), h.recent, h.total];
}

export function compareNumbers(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function rankCandidates(candidates: readonly string[], env: Env): string[] {
  return [...candidates].sort((a, b) => compareNumbers(rankKey(env, a), rankKey(env, b)));
}

/**
 * Strict-priority selection of `count` players: everybody with a better key than the
 * `count`-th ranked candidate is in; the rest come from the tie pool.
 */
export function selectionPool(
  candidates: readonly string[],
  count: number,
  env: Env,
): { inn: string[]; pool: string[] } {
  const ranked = rankCandidates(candidates, env);
  const cutoff = rankKey(env, ranked[count - 1]!);
  const inn = ranked.filter((id) => compareNumbers(rankKey(env, id), cutoff) < 0);
  const pool = ranked.filter((id) => compareNumbers(rankKey(env, id), cutoff) === 0);
  return { inn, pool };
}

/** Every k-combination of `items` (callers keep `items` small). */
export function combinations<T>(items: readonly T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (k > items.length) return [];
  const all: T[][] = [];
  const walk = (start: number, chosen: T[]) => {
    if (chosen.length === k) {
      all.push(chosen);
      return;
    }
    for (let i = start; i < items.length; i++) walk(i + 1, [...chosen, items[i]!]);
  };
  walk(0, []);
  return all;
}

export function waitOf(env: Env, id: string): number {
  return env.history.byPlayer.get(id)!.wait;
}

/** Longest Wait first; players with equal Wait are ordered randomly. */
export function orderByWait(ids: readonly string[], env: Env): string[] {
  const tiebreak = new Map(ids.map((id) => [id, env.rng()]));
  return [...ids].sort(
    (a, b) => waitOf(env, b) - waitOf(env, a) || tiebreak.get(a)! - tiebreak.get(b)!,
  );
}

/**
 * Candidate 4-sets under the strict rule: Rest, then Fairness (recent, total, then Wait).
 * Everybody with a better key is in; the remaining slots come from the 12 longest-waiting
 * players of the tie pool, with every combination enumerated.
 */
export function strictSets(candidates: readonly string[], env: Env): string[][] {
  const { inn, pool } = selectionPool(candidates, 4, env);
  const cut = pool.length > MAX_POOL ? orderByWait(pool, env).slice(0, MAX_POOL) : pool;
  return combinations(cut, 4 - inn.length).map((chosen) => [...inn, ...chosen]);
}

// ---------------------------------------------------------------------- splits

export function splitsOf(four: readonly string[]): Split[] {
  const [a, b, c, d] = four as [string, string, string, string];
  return [
    [
      [a, b],
      [c, d],
    ],
    [
      [a, c],
      [b, d],
    ],
    [
      [a, d],
      [b, c],
    ],
  ];
}

export function teamSum(env: Env, team: Team): number {
  return (env.skill.get(team[0]) ?? 0) + (env.skill.get(team[1]) ?? 0);
}

export function balanceOf(env: Env, teams: Split): number {
  return Math.abs(teamSum(env, teams[0]) - teamSum(env, teams[1]));
}

export function partnerRepeats(env: Env, teams: Split): number {
  return teams.reduce((sum, team) => sum + env.history.partnered(team[0], team[1]), 0);
}

export function teamKey(team: Team): string {
  return [...team].sort().join("|");
}

/** Order-insensitive identity of an arrangement of two Teams. */
export function splitSignature(teams: Split): string {
  return [teamKey(teams[0]), teamKey(teams[1])].sort().join("/");
}

function scoreSplit(env: Env, teams: Split, withWait: boolean): Score {
  const balance = balanceOf(env, teams);
  const rest = [balance > 1 ? 1 : 0, partnerRepeats(env, teams), balance, env.rng()];
  if (!withWait) return rest;
  // Wait is part of Fairness, so longest total Wait outranks balance and partners. The "in"
  // players are common to every compared set, so summing all four ranks the same as summing
  // only the pool players.
  const wait = [...teams[0], ...teams[1]].reduce((sum, id) => sum + waitOf(env, id), 0);
  return [-wait, ...rest];
}

interface BestOptions {
  /** Rank by longest total Wait first (Lineup selection, not replacements). */
  withWait: boolean;
  /** Splits to ignore. */
  skip?: (teams: Split) => boolean;
}

/** Best (set, split) over the given 4-sets: [wait], balance, partners, then random. */
export function bestSplitOf(
  sets: readonly (readonly string[])[],
  env: Env,
  options: BestOptions,
): Lineup | null {
  let best: { teams: Split; score: Score } | null = null;
  for (const set of sets) {
    for (const teams of splitsOf(set)) {
      if (options.skip?.(teams)) continue;
      const score = scoreSplit(env, teams, options.withWait);
      if (!best || compareNumbers(score, best.score) < 0) best = { teams, score };
    }
  }
  return best ? { teams: best.teams } : null;
}

// --------------------------------------------------------------------- lineups

/** Pick a Lineup for one Court from scratch. Null when fewer than 4 Candidates. */
export function pickLineup(session: Session, courtId: string, env: Env): Lineup | null {
  const candidates = candidatesFor(session, courtId);
  if (candidates.length < 4) return null;
  return bestSplitOf(strictSets(candidates, env), env, { withWait: true });
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

/** One-player swaps of `current` against the other candidates. */
function swapNeighbours(candidates: readonly string[], current: readonly string[]): string[][] {
  const outsiders = candidates.filter((id) => !current.includes(id));
  return current.flatMap((leaving) =>
    outsiders.map((entering) => [...current.filter((id) => id !== leaving), entering]),
  );
}

function sortedKeys(env: Env, set: readonly string[]): number[] {
  return set
    .map((id) => rankKey(env, id))
    .sort(compareNumbers)
    .flat();
}

/**
 * Rehash: a Lineup that differs from the Court's current one whenever possible.
 * Prefers a different set of players (best by the usual rules), otherwise a different split.
 */
export function pickDifferentLineup(session: Session, court: Court, env: Env): Lineup | null {
  const current = court.lineup;
  if (!current) return pickLineup(session, court.id, env);
  const candidates = candidatesFor(session, court.id);
  if (candidates.length < 4) return null;
  const currentSet = lineupPlayerIds(current);

  const strict = strictSets(candidates, env).filter((set) => !sameSet(set, currentSet));
  const fromStrict = bestSplitOf(strict, env, { withWait: true });
  if (fromStrict) return fromStrict;

  // The strict best set *is* the current one: relax to the best single-player swap.
  const neighbours = swapNeighbours(candidates, currentSet).map((set) => ({
    set,
    keys: sortedKeys(env, set),
  }));
  if (neighbours.length > 0) {
    const bestKeys = neighbours.reduce(
      (best, entry) => (compareNumbers(entry.keys, best) < 0 ? entry.keys : best),
      neighbours[0]!.keys,
    );
    const group = neighbours
      .filter((entry) => compareNumbers(entry.keys, bestKeys) === 0)
      .map((entry) => entry.set);
    const fromSwap = bestSplitOf(group, env, { withWait: true });
    if (fromSwap) return fromSwap;
  }

  // Exactly four Candidates: choose the best different split.
  const currentSplit = splitSignature(current.teams);
  return bestSplitOf([currentSet], env, {
    withWait: true,
    skip: (teams) => splitSignature(teams) === currentSplit,
  });
}

/**
 * Replace only `leavingId` in a Court's Lineup with the best Candidate (rank key, then longest
 * Wait, then the split rule), re-splitting the four. Null when there is no Candidate.
 */
export function replaceInLineup(
  session: Session,
  court: Court,
  leavingId: string,
  env: Env,
): Lineup | null {
  const rest = lineupPlayerIds(court.lineup).filter((id) => id !== leavingId);
  const held = heldPlayerIds(session);
  const candidates = freePlayerIds(session).filter((id) => id !== leavingId && !held.has(id));
  if (candidates.length === 0) return null;
  // Rank key first, then longest Wait (part of Fairness); the split rule only breaks ties.
  const tied = selectionPool(candidates, 1, env).pool;
  const longest = Math.max(...tied.map((id) => waitOf(env, id)));
  const best = tied.filter((id) => waitOf(env, id) === longest);
  return bestSplitOf(
    best.map((id) => [...rest, id]),
    env,
    { withWait: false },
  );
}
