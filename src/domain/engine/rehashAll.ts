import type { Session } from "../types.ts";
import type { EngineContext } from "./context.ts";
import { setLineup } from "./lineups.ts";
import { randomInt, shuffle } from "./rng.ts";
import {
  balanceOf,
  compareNumbers,
  domOf,
  fairnessTerms,
  heldPlayerIds,
  freePlayerIds,
  isAllowed,
  makeEnv,
  mixOf,
  partnerRepeats,
  pickLineup,
  restCut,
  teamKey,
  lineupPlayerIds,
  type Env,
  type Split,
} from "./select.ts";
import { isIdle, sortedCourts } from "./stats.ts";

/** Total arrangements evaluated by the local search. */
const MAX_EVALUATIONS = 500;
const RESTARTS = 5;
/** Safety cap on draws that were rejected (illegal swaps), so the search cannot spin. */
const MAX_REJECTED = 2000;

type Cost = [
  unbalancedCourts: number,
  mixing: number,
  recent: number,
  total: number,
  negWait: number,
  repeats: number,
  balance: number,
  unchangedTeams: number,
];

/** Positions 4i..4i+3 form Court i: [0,1] vs [2,3]. Extra field players trail the active ones. */
function chunks(order: readonly string[], courts: number): Split[] {
  return Array.from({ length: courts }, (_, i) => {
    const [a, b, c, d] = order.slice(i * 4, i * 4 + 4) as [string, string, string, string];
    return [
      [a, b],
      [c, d],
    ] as Split;
  });
}

function costOf(
  env: Env,
  order: readonly string[],
  courts: number,
  previousTeams: ReadonlySet<string>,
): Cost {
  let unbalanced = 0;
  let mixing = 0;
  let repeats = 0;
  let balance = 0;
  let unchanged = 0;
  for (const teams of chunks(order, courts)) {
    const b = balanceOf(env, teams);
    if (b > 1) unbalanced += 1;
    balance += b;
    mixing += mixOf(env, [...teams[0], ...teams[1]]);
    repeats += partnerRepeats(env, teams);
    for (const team of teams) if (previousTeams.has(teamKey(team))) unchanged += 1;
  }
  const [recent, total, negWait] = fairnessTerms(env, order.slice(0, courts * 4));
  return [unbalanced, mixing, recent, total, negWait, repeats, balance, unchanged];
}

/**
 * Rehash all: release every Idle Court's Lineup and pick fresh ones together.
 *
 * The 4k places are filled by the usual steps (Rest, then Rests in a row): everybody in a
 * better group is in, and the rest come from the field. The search may swap field players in
 * and out, but only to arrangements where everyone owed a place before a chosen player is
 * chosen too; the better-grouped players ("inn") never leave. Among those it searches (seeded,
 * bounded) for the grouping and splits with the lowest cost: unbalanced Courts, Mixing, exact
 * Fairness counts, Wait, partner repeats and total imbalance. "Different" means a different
 * set of Teams, regardless of which Court they are on.
 */
export function rehashAllLineups(session: Session, ctx: EngineContext): Session {
  const idle = sortedCourts(session).filter(isIdle);
  const previousTeams = new Set(
    idle.flatMap((court) => (court.lineup ? court.lineup.teams.map(teamKey) : [])),
  );
  let base = idle.reduce((current, court) => setLineup(current, court.id, null), session);

  const held = heldPlayerIds(base);
  const candidates = freePlayerIds(base).filter((id) => !held.has(id));
  const courts = Math.min(idle.length, Math.floor(candidates.length / 4));
  if (courts === 0) return base;

  const env = makeEnv(base, ctx);
  const active = courts * 4;
  const { inn, field, slots } = restCut(candidates, active, env);
  const dom = domOf(field, env);
  const fieldSet = new Set(field);

  /** Field players added in random order, each only once everyone owed a place before them is in. */
  const randomChosen = (): string[] => {
    const chosen = new Set<string>();
    const order: string[] = [];
    while (order.length < slots) {
      const ready = field.filter(
        (p) => !chosen.has(p) && [...dom.get(p)!].every((x) => chosen.has(x)),
      );
      if (ready.length === 0) break;
      const next = ready[randomInt(ctx.rng, ready.length)]!;
      chosen.add(next);
      order.push(next);
    }
    return order;
  };

  const randomStart = () => {
    const chosen = randomChosen();
    return [
      ...shuffle([...inn, ...chosen], ctx.rng),
      ...shuffle(
        field.filter((id) => !chosen.includes(id)),
        ctx.rng,
      ),
    ];
  };

  // Seed one start with the independent per-Court greedy picks so we are never worse than them.
  const greedyStart = (): string[] | null => {
    let current = base;
    const picked: string[] = [];
    for (const court of idle.slice(0, courts)) {
      const lineup = pickLineup(current, court.id, env);
      if (!lineup) return null;
      current = setLineup(current, court.id, lineup);
      picked.push(...lineupPlayerIds(lineup));
    }
    const pickedSet = new Set(picked);
    const fromField = picked.filter((id) => fieldSet.has(id)).length;
    if (!inn.every((id) => pickedSet.has(id))) return null;
    if (fromField !== slots || !isAllowed(dom, pickedSet)) return null;
    return [...picked, ...field.filter((id) => !pickedSet.has(id))];
  };

  type Found = { cost: Cost; order: string[] };
  let bestAny: Found | null = null;
  let bestDifferent: Found | null = null;
  let evaluations = 0;

  const consider = (order: string[]): Cost => {
    evaluations += 1;
    const cost = costOf(env, order, courts, previousTeams);
    const better = (best: Found | null) => {
      if (!best) return true;
      const diff = compareNumbers(cost, best.cost);
      return diff < 0 || (diff === 0 && ctx.rng() < 0.5);
    };
    if (better(bestAny)) bestAny = { cost, order: [...order] };
    // Identical Team set (on any Courts) is not "different".
    const sameTeams = previousTeams.size === active / 2 && cost[7] === active / 2;
    if (!sameTeams && better(bestDifferent)) bestDifferent = { cost, order: [...order] };
    return cost;
  };

  const perStart = Math.floor(MAX_EVALUATIONS / RESTARTS);
  let rejected = 0;
  for (let start = 0; start < RESTARTS; start++) {
    const order = (start === 0 ? greedyStart() : null) ?? randomStart();
    let cost = consider(order);
    while (evaluations < Math.min(MAX_EVALUATIONS, (start + 1) * perStart)) {
      const i = randomInt(ctx.rng, active);
      const j = randomInt(ctx.rng, order.length);
      // Never move an "inn" player out of the active positions.
      if (i === j || (j >= active && !fieldSet.has(order[i]!))) {
        if (++rejected > MAX_REJECTED) break;
        continue;
      }
      [order[i], order[j]] = [order[j]!, order[i]!];
      // A swap that brings a field player in must keep everyone owed a place before them in.
      if (j >= active && !isAllowed(dom, new Set(order.slice(0, active)))) {
        [order[i], order[j]] = [order[j]!, order[i]!];
        if (++rejected > MAX_REJECTED) break;
        continue;
      }
      const next = consider(order);
      if (compareNumbers(next, cost) <= 0) cost = next;
      else [order[i], order[j]] = [order[j]!, order[i]!];
    }
    if (rejected > MAX_REJECTED) break;
  }

  const winner = (bestDifferent ?? bestAny) as Found | null;
  if (!winner) return base;
  chunks(winner.order, courts).forEach((teams, i) => {
    base = setLineup(base, idle[i]!.id, { teams });
  });
  return base;
}
