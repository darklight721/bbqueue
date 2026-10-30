import type { Court, Lineup, Session, Team } from "../types.ts";
import { SKILL_VALUE } from "../types.ts";
import type { EngineContext } from "./context.ts";
import { countPlayers } from "./spare.ts";
import { buildHistory, matchPlayerIds, type History } from "./stats.ts";

/** The field is cut to this many best-placed players before enumerating combinations. */
const MAX_POOL = 12;

export type Split = [Team, Team];
type Score = number[];

/** Everything selection needs, computed once per operation. */
export interface Env {
  history: History;
  skill: ReadonlyMap<string, number>;
  rng: () => number;
  /**
   * Rests in a row at which a player is picked before Mixing gets a say:
   * max(2 × Courts, floor(players / 4)), players = Session players not removed and not Sitting out.
   */
  restsLimit: number;
}

export function makeEnv(session: Session, ctx: EngineContext): Env {
  return {
    history: buildHistory(session, ctx.now),
    skill: new Map(session.players.map((player) => [player.id, SKILL_VALUE[player.skill]])),
    rng: ctx.rng,
    restsLimit: Math.max(2 * session.courts.length, Math.floor(countPlayers(session) / 4)),
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
//
// Soft rules in strict priority (ADR-0009): Rest, Rests in a row (limit max(2 × Courts,
// floor(players / 4))), Fairness with a one-Match tolerance ("owed a place"), Team balance
// exists, Mixing, exact Fairness counts, Wait, new partners, exact balance, random.

/** Graded Rest: a Streak of 1 is fine, longer Streaks are progressively rested first. */
export function restKey(env: Env, id: string): number {
  return Math.max(0, env.history.byPlayer.get(id)!.streak - 1);
}

/** Rests in a row beyond the limit: 0 until `rests` reaches `restsLimit`, then 1, 2, … */
export function restsTier(env: Env, id: string): number {
  return Math.max(0, env.history.byPlayer.get(id)!.rests - env.restsLimit + 1);
}

/**
 * `x` is owed a place before `c`: 2+ fewer Matches in the Fairness window, or the same or
 * fewer in the window and 2+ fewer overall. Only meaningful between players of the same Rest
 * group and Rests-in-a-row group. A strict partial order.
 */
export function owes(env: Env, x: string, c: string): boolean {
  const a = env.history.byPlayer.get(x)!;
  const b = env.history.byPlayer.get(c)!;
  return a.recent <= b.recent - 2 || (a.recent <= b.recent && a.total <= b.total - 2);
}

export function compareNumbers(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Split `ids` by `keyOf` ascending. Whole groups before the one holding the `count`-th player
 * are `inn`; that group is the field, with `slots` places left in it (it may fit exactly).
 */
function cutBy(
  ids: readonly string[],
  count: number,
  keyOf: (id: string) => number,
): { inn: string[]; field: string[]; slots: number } {
  const groups = new Map<number, string[]>();
  for (const id of ids) {
    const key = keyOf(id);
    groups.set(key, [...(groups.get(key) ?? []), id]);
  }
  const inn: string[] = [];
  for (const key of [...groups.keys()].sort((a, b) => a - b)) {
    const group = groups.get(key)!;
    if (inn.length + group.length >= count) {
      return { inn, field: group, slots: count - inn.length };
    }
    inn.push(...group);
  }
  return { inn, field: [], slots: count - inn.length };
}

/**
 * Rest, then Rests in a row: everybody in a better Rest group (and, inside the cut Rest group,
 * in a higher Rests-in-a-row tier) is in; the group where the cut falls is the field with
 * `slots` places left. Candidates must number at least `count`.
 */
export function restCut(
  candidates: readonly string[],
  count: number,
  env: Env,
): { inn: string[]; field: string[]; slots: number } {
  const byRest = cutBy(candidates, count, (id) => restKey(env, id));
  const byTier = cutBy(byRest.field, byRest.slots, (id) => -restsTier(env, id));
  return { inn: [...byRest.inn, ...byTier.inn], field: byTier.field, slots: byTier.slots };
}

/** `dom(p)`: field players owed a place before `p`. */
export type Dom = ReadonlyMap<string, ReadonlySet<string>>;

export function domOf(field: readonly string[], env: Env): Dom {
  return new Map(
    field.map((p) => [p, new Set(field.filter((x) => x !== p && owes(env, x, p)))] as const),
  );
}

/** True when everyone owed a place before a chosen player is chosen too. */
export function isAllowed(dom: Dom, chosen: ReadonlySet<string>): boolean {
  for (const c of chosen) {
    for (const x of dom.get(c) ?? []) if (!chosen.has(x)) return false;
  }
  return true;
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

/**
 * Candidate 4-sets: Rest and Rests in a row decide who is in; inside the field, every set in
 * which nobody is left out for someone they are owed a place behind. Large fields are cut to
 * the 12 best by (recent, total), then longest Wait, then random; anyone owed a place before
 * a kept player sorts earlier and is kept too, so the cut stays allowed.
 */
export function fairSets(candidates: readonly string[], env: Env): string[][] {
  const { inn, field, slots } = restCut(candidates, 4, env);
  const dom = domOf(field, env);
  const fits = field.filter((p) => dom.get(p)!.size < slots);
  let cut = fits;
  if (fits.length > MAX_POOL) {
    const tiebreak = new Map(fits.map((id) => [id, env.rng()]));
    const h = (id: string) => env.history.byPlayer.get(id)!;
    cut = [...fits]
      .sort(
        (a, b) =>
          h(a).recent - h(b).recent ||
          h(a).total - h(b).total ||
          waitOf(env, b) - waitOf(env, a) ||
          tiebreak.get(a)! - tiebreak.get(b)!,
      )
      .slice(0, MAX_POOL);
  }
  return combinations(cut, slots)
    .filter((chosen) => isAllowed(dom, new Set(chosen)))
    .map((chosen) => [...inn, ...chosen]);
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

/** Past meetings (Partners or Opponents) summed over the set's pairs. */
export function mixOf(env: Env, ids: readonly string[]): number {
  let sum = 0;
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) sum += env.history.met(ids[i]!, ids[j]!);
  }
  return sum;
}

/** Σrecent, Σtotal, −Σwait of `ids`: the exact Fairness tie-breakers, Wait last. */
export function fairnessTerms(env: Env, ids: readonly string[]): [number, number, number] {
  let recent = 0;
  let total = 0;
  let wait = 0;
  for (const id of ids) {
    const h = env.history.byPlayer.get(id)!;
    recent += h.recent;
    total += h.total;
    wait += h.wait;
  }
  return [recent, total, -wait];
}

interface BestOptions {
  /** Splits to ignore. */
  skip?: (teams: Split) => boolean;
}

/**
 * Best (set, split) over the given 4-sets, smallest first:
 * [unbalanced, Mixing, Σrecent, Σtotal, −Σwait, partner repeats, balance, random].
 *
 * A split that can be balanced outranks Mixing (Team balance exists). Mixing outranks the exact
 * Fairness counts and Wait, because Wait only breaks ties among players who are level; the four
 * are common to every split of a set, so the set terms are computed once per set.
 */
export function bestSplitOf(
  sets: readonly (readonly string[])[],
  env: Env,
  options: BestOptions = {},
): Lineup | null {
  let best: { teams: Split; score: Score } | null = null;
  for (const set of sets) {
    const mix = mixOf(env, set);
    const [recent, total, wait] = fairnessTerms(env, set);
    for (const teams of splitsOf(set)) {
      if (options.skip?.(teams)) continue;
      const balance = balanceOf(env, teams);
      const score = [
        balance > 1 ? 1 : 0,
        mix,
        recent,
        total,
        wait,
        partnerRepeats(env, teams),
        balance,
        env.rng(),
      ];
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
  return bestSplitOf(fairSets(candidates, env), env);
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

/** Different allowed sets of four (Rest and Fairness, ADR-0009), leaving the current set out. */
function differentAllowedSets(
  candidates: readonly string[],
  currentSet: readonly string[],
  env: Env,
): string[][] {
  return fairSets(candidates, env).filter((set) => !sameSet(set, currentSet));
}

/**
 * Team balance limit for Rehash and New Teams: no worse than max(1, the current Lineup's
 * balance). So an already-unbalanced Lineup (no balanced four exists) may move to another four
 * that is no worse, but a balanced one never becomes unbalanced.
 */
function rehashBalanceLimit(env: Env, lineup: Lineup): number {
  return Math.max(1, balanceOf(env, lineup.teams));
}

/**
 * Rehash: a Lineup that differs from the Court's current one, never less balanced than
 * `rehashBalanceLimit` allows.
 * - A different allowed set of four (Rest and Fairness, ADR-0009), picked by the usual rules; or else
 * - the best other split of the same four. This is "New Teams".
 * It never swaps anybody in: a player the rules keep out stays out (see `pickSwapLineup`).
 * With a Lineup on the Court, null means there is nothing within the limit (also with fewer than
 * four Candidates); without one it is `pickLineup`.
 */
export function pickDifferentLineup(session: Session, court: Court, env: Env): Lineup | null {
  const current = court.lineup;
  if (!current) return pickLineup(session, court.id, env);
  const candidates = candidatesFor(session, court.id);
  if (candidates.length < 4) return null;
  const currentSet = lineupPlayerIds(current);
  const limit = rehashBalanceLimit(env, current);
  const tooUnbalanced = (teams: Split) => balanceOf(env, teams) > limit;

  const fromFair = bestSplitOf(differentAllowedSets(candidates, currentSet, env), env, {
    skip: tooUnbalanced,
  });
  if (fromFair) return fromFair;

  const currentSplit = splitSignature(current.teams);
  return bestSplitOf([currentSet], env, {
    skip: (teams) => splitSignature(teams) === currentSplit || tooUnbalanced(teams),
  });
}

export type RehashBlockReason = "rest" | "fairness" | "waited" | "balance";

/**
 * Why Rehash on this Court can't bring anybody else in, or null when it can act directly.
 * Null when a different allowed set within the balance limit exists, when there are exactly four
 * Candidates (nobody to bring in: Rehash only re-splits, or says no balanced Teams), and when
 * the Court has no Lineup or fewer than four Candidates. Otherwise, in priority order:
 * - "rest": Rest alone leaves only the current set (someone else would play a third Match in a row).
 * - "waited": Rest allows more, but Rests in a row forces the current set (those four have sat out
 *   as long as the limit lets them).
 * - "fairness": Rest and Rests in a row allow another set, but someone would be left out who is
 *   owed a place.
 * - "balance": other fours are allowed, but none splits into Teams within the balance limit.
 * `newTeams` is true when another split of the current four is within the limit.
 */
export function rehashBlockReason(
  session: Session,
  court: Court,
  env: Env,
): { reason: RehashBlockReason; newTeams: boolean } | null {
  const current = court.lineup;
  if (!current) return null;
  const candidates = candidatesFor(session, court.id);
  if (candidates.length <= 4) return null;
  const currentSet = lineupPlayerIds(current);
  const limit = rehashBalanceLimit(env, current);
  const allowed = differentAllowedSets(candidates, currentSet, env);
  const fitsLimit = (set: readonly string[]) =>
    splitsOf(set).some((teams) => balanceOf(env, teams) <= limit);
  if (allowed.some(fitsLimit)) return null;

  const currentSplit = splitSignature(current.teams);
  const newTeams = splitsOf(currentSet).some(
    (teams) => splitSignature(teams) !== currentSplit && balanceOf(env, teams) <= limit,
  );

  if (allowed.length > 0) return { reason: "balance", newTeams };
  // Nothing different is allowed: find which rule leaves only the current set.
  const allowsDifferent = (cut: { inn: string[]; field: string[]; slots: number }) =>
    cut.field.length > cut.slots || !sameSet([...cut.inn, ...cut.field], currentSet);
  const restOnly = restCut(candidates, 4, { ...env, restsLimit: Infinity });
  if (!allowsDifferent(restOnly)) return { reason: "rest", newTeams };
  if (!allowsDifferent(restCut(candidates, 4, env))) return { reason: "waited", newTeams };
  return { reason: "fairness", newTeams };
}

/** One-player swaps of `current` against the other candidates. */
function swapNeighbours(candidates: readonly string[], current: readonly string[]): string[][] {
  const outsiders = candidates.filter((id) => !current.includes(id));
  return current.flatMap((leaving) =>
    outsiders.map((entering) => [...current.filter((id) => id !== leaving), entering]),
  );
}

/** Same Rest group and same Rests-in-a-row tier: the only players `owes` compares. */
function sameGroup(env: Env, a: string, b: string): boolean {
  return restKey(env, a) === restKey(env, b) && restsTier(env, a) === restsTier(env, b);
}

/** [sorted rest keys, how many chosen players are owed a place by someone left out]. */
function swapKey(env: Env, candidates: readonly string[], set: readonly string[]): number[] {
  const left = candidates.filter((id) => !set.includes(id));
  const passedOver = set.filter((c) =>
    left.some((x) => sameGroup(env, x, c) && owes(env, x, c)),
  ).length;
  return [...set.map((id) => restKey(env, id)).sort((a, b) => a - b), passedOver];
}

/**
 * "Swap anyway": the best single-player swap of the Court's Lineup, on purpose ignoring Rest
 * and Fairness (it may bring in a rested player). Ranked by `swapKey`, then the usual set rules.
 * Null when the Court has no Lineup or there is nobody to swap in.
 */
export function pickSwapLineup(session: Session, court: Court, env: Env): Lineup | null {
  const current = court.lineup;
  if (!current) return null;
  const candidates = candidatesFor(session, court.id);
  const neighbours = swapNeighbours(candidates, lineupPlayerIds(current)).map((set) => ({
    set,
    keys: swapKey(env, candidates, set),
  }));
  if (neighbours.length === 0) return null;
  const bestKeys = neighbours.reduce(
    (best, entry) => (compareNumbers(entry.keys, best) < 0 ? entry.keys : best),
    neighbours[0]!.keys,
  );
  const group = neighbours
    .filter((entry) => compareNumbers(entry.keys, bestKeys) === 0)
    .map((entry) => entry.set);
  return bestSplitOf(group, env);
}

/**
 * Replace only `leavingId` in a Court's Lineup with the best Candidate, re-splitting the four.
 * Rest and Rests in a row give the field (one place); level Candidates are those nobody else in
 * the field is owed a place before. They are scored like any set: Mixing reduces to the
 * meetings with the three who stay. Null when there is no Candidate.
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
  const { field } = restCut(candidates, 1, env);
  const dom = domOf(field, env);
  const level = field.filter((id) => dom.get(id)!.size === 0);
  return bestSplitOf(
    level.map((id) => [...rest, id]),
    env,
  );
}
