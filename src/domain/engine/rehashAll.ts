import type { Session } from "../types.ts";
import type { EngineContext } from "./context.ts";
import { setLineup } from "./lineups.ts";
import { randomInt, shuffle } from "./rng.ts";
import {
  balanceOf,
  compareNumbers,
  heldPlayerIds,
  freePlayerIds,
  makeEnv,
  partnerRepeats,
  pickLineup,
  selectionPool,
  orderByWait,
  teamKey,
  waitOf,
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

type Cost = [unbalancedCourts: number, repeats: number, balance: number, unchangedTeams: number];

/** Positions 4i..4i+3 form Court i: [0,1] vs [2,3]. Extra tie-pool players trail the active ones. */
function chunks(order: readonly string[], courts: number): Split[] {
  return Array.from({ length: courts }, (_, i) => {
    const [a, b, c, d] = order.slice(i * 4, i * 4 + 4) as [string, string, string, string];
    return [
      [a, b],
      [c, d],
    ] as Split;
  });
}

function costOf(env: Env, groups: readonly Split[], previousTeams: ReadonlySet<string>): Cost {
  let unbalanced = 0;
  let repeats = 0;
  let balance = 0;
  let unchanged = 0;
  for (const teams of groups) {
    const b = balanceOf(env, teams);
    if (b > 1) unbalanced += 1;
    balance += b;
    repeats += partnerRepeats(env, teams);
    for (const team of teams) if (previousTeams.has(teamKey(team))) unchanged += 1;
  }
  return [unbalanced, repeats, balance, unchanged];
}

/**
 * Rehash all: release every Idle Court's Lineup and pick fresh ones together.
 *
 * The 4k players are fixed by the usual rule (Rest, Fairness incl. Wait): everybody with a
 * better key is in, and tie-pool players are taken longest-Wait first. The search may only
 * swap players whose Wait ties at the cut-off in or out; it never drops anyone else. Among
 * the chosen players it searches (seeded, bounded) for the grouping and splits minimising
 * unbalanced Courts, partner repeats and total imbalance. "Different" means a different
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
  const { inn, pool } = selectionPool(candidates, active, env);
  const need = active - inn.length;

  // Wait is part of Fairness: take pool players longest-Wait first. Only players tied at the
  // cut-off Wait are interchangeable ("flex"); everybody else is fixed.
  const byWait = orderByWait(pool, env);
  const cutoffWait = waitOf(env, byWait[need - 1]!);
  const fixed = [...inn, ...byWait.filter((id) => waitOf(env, id) > cutoffWait)];
  const flex = byWait.filter((id) => waitOf(env, id) === cutoffWait);
  const flexNeeded = active - fixed.length;
  const flexSet = new Set(flex);

  const randomStart = () => {
    const shuffledFlex = shuffle(flex, ctx.rng);
    return [
      ...shuffle([...fixed, ...shuffledFlex.slice(0, flexNeeded)], ctx.rng),
      ...shuffledFlex.slice(flexNeeded),
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
    if (!fixed.every((id) => picked.includes(id))) return null;
    return [...picked, ...flex.filter((id) => !picked.includes(id))];
  };

  type Found = { cost: Cost; order: string[] };
  let bestAny: Found | null = null;
  let bestDifferent: Found | null = null;
  let evaluations = 0;

  const consider = (order: string[]): Cost => {
    evaluations += 1;
    const cost = costOf(env, chunks(order, courts), previousTeams);
    const better = (best: Found | null) => {
      if (!best) return true;
      const diff = compareNumbers(cost, best.cost);
      return diff < 0 || (diff === 0 && ctx.rng() < 0.5);
    };
    if (better(bestAny)) bestAny = { cost, order: [...order] };
    // Identical Team set (on any Courts) is not "different".
    const sameTeams = previousTeams.size === active / 2 && cost[3] === active / 2;
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
      // Never move a fixed player out of the active positions.
      if (i === j || (j >= active && !flexSet.has(order[i]!))) {
        if (++rejected > MAX_REJECTED) break;
        continue;
      }
      [order[i], order[j]] = [order[j]!, order[i]!];
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
