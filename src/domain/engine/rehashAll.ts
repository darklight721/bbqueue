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
  splitSignature,
  lineupPlayerIds,
  type Env,
  type Split,
} from "./select.ts";
import { isIdle, sortedCourts } from "./stats.ts";

/** Total arrangements evaluated by the local search. */
const MAX_EVALUATIONS = 500;
const RESTARTS = 5;

type Cost = [unbalancedCourts: number, repeats: number, balance: number, unchangedCourts: number];

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

function costOf(env: Env, groups: readonly Split[], previous: readonly (string | null)[]): Cost {
  let unbalanced = 0;
  let repeats = 0;
  let balance = 0;
  let unchanged = 0;
  groups.forEach((teams, i) => {
    const b = balanceOf(env, teams);
    if (b > 1) unbalanced += 1;
    balance += b;
    repeats += partnerRepeats(env, teams);
    if (previous[i] === splitSignature(teams)) unchanged += 1;
  });
  return [unbalanced, repeats, balance, unchanged];
}

/**
 * Rehash all: release every Idle Court's Lineup and pick fresh ones together. Chooses 4k
 * players by the usual Rest/Fairness rule, then searches (seeded, bounded) for the grouping
 * and splits minimising unbalanced Courts, partner repeats and total imbalance. The result
 * differs from the previous arrangement whenever the search finds a different one.
 */
export function rehashAllLineups(session: Session, ctx: EngineContext): Session {
  const idle = sortedCourts(session).filter(isIdle);
  const previous = idle.map((court) => (court.lineup ? splitSignature(court.lineup.teams) : null));
  let base = idle.reduce((current, court) => setLineup(current, court.id, null), session);

  const held = heldPlayerIds(base);
  const candidates = freePlayerIds(base).filter((id) => !held.has(id));
  const courts = Math.min(idle.length, Math.floor(candidates.length / 4));
  if (courts === 0) return base;

  const env = makeEnv(base, ctx);
  const active = courts * 4;
  const { inn, pool } = selectionPool(candidates, active, env);
  const need = active - inn.length;
  const prev = previous.slice(0, courts);

  const randomStart = () => {
    const shuffledPool = shuffle(pool, ctx.rng);
    return [
      ...shuffle([...inn, ...shuffledPool.slice(0, need)], ctx.rng),
      ...shuffledPool.slice(need),
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
    if (!inn.every((id) => picked.includes(id))) return null;
    return [...picked, ...pool.filter((id) => !picked.includes(id))];
  };

  let bestAny: { cost: Cost; order: string[] } | null = null;
  let bestDifferent: { cost: Cost; order: string[] } | null = null;
  let evaluations = 0;

  const consider = (order: string[]): Cost => {
    evaluations += 1;
    const cost = costOf(env, chunks(order, courts), prev);
    const better = (best: { cost: Cost } | null) => {
      if (!best) return true;
      const diff = compareNumbers(cost, best.cost);
      return diff < 0 || (diff === 0 && ctx.rng() < 0.5);
    };
    if (better(bestAny)) bestAny = { cost, order: [...order] };
    if (cost[3] < courts && better(bestDifferent)) bestDifferent = { cost, order: [...order] };
    return cost;
  };

  const perStart = Math.floor(MAX_EVALUATIONS / RESTARTS);
  for (let start = 0; start < RESTARTS; start++) {
    const order = (start === 0 ? greedyStart() : null) ?? randomStart();
    let cost = consider(order);
    while (evaluations < Math.min(MAX_EVALUATIONS, (start + 1) * perStart)) {
      const i = randomInt(ctx.rng, active);
      const j = randomInt(ctx.rng, order.length);
      if (i === j) continue;
      [order[i], order[j]] = [order[j]!, order[i]!];
      const next = consider(order);
      if (compareNumbers(next, cost) <= 0) cost = next;
      else [order[i], order[j]] = [order[j]!, order[i]!];
    }
  }

  const winner = (bestDifferent ?? bestAny) as { order: string[] } | null;
  if (!winner) return base;
  const groups = chunks(winner.order, courts);
  groups.forEach((teams, i) => {
    base = setLineup(base, idle[i]!.id, { teams });
  });
  return base;
}
