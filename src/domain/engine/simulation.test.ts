import { describe, expect, it } from "vite-plus/test";
import type { Session } from "../types.ts";
import {
  addCourt,
  addPlayer,
  createSession,
  endMatch,
  moveQueueToCourt,
  rehashAll,
  rehashCourt,
  removeCourt,
  removeMatch,
  removePlayer,
  setSittingOut,
  startMatch,
} from "./operations.ts";
import { allPlayerStats } from "./playerStats.ts";
import { buildHistory } from "./stats.ts";
import { addQueue, queueWarnings, removeQueue, setQueueSlot } from "./queues.ts";
import { createRng, randomInt } from "./rng.ts";
import { MIN, T0, at, makeCtx, unwrap, violations } from "./test-utils.ts";

type Step = (
  s: Session,
  rng: () => number,
  now: number,
  ctx: ReturnType<typeof makeCtx>,
) => Session;

function pick<T>(items: readonly T[], rng: () => number): T | undefined {
  return items[randomInt(rng, items.length)];
}

function settle(
  result: { ok: true; session: Session } | { ok: false },
  fallback: Session,
): Session {
  return result.ok ? result.session : fallback;
}

const steps: Step[] = [
  // start a match on an Idle Court that has a Lineup
  (s, rng, _now, ctx) => {
    const court = pick(
      s.courts.filter((c) => c.activeMatchId === null && c.lineup),
      rng,
    );
    return court ? settle(startMatch(s, court.id, ctx), s) : s;
  },
  // end an Active match, scored or not
  (s, rng, _now, ctx) => {
    const active = pick(
      s.matches.filter((m) => m.status === "active"),
      rng,
    );
    if (!active) return s;
    const target = s.pointSystem;
    const score: [number, number] | null =
      rng() < 0.3
        ? null
        : rng() < 0.5
          ? [target, randomInt(rng, target - 1)]
          : [randomInt(rng, target - 1), target];
    return settle(endMatch(s, active.id, score, ctx), s);
  },
  (s, rng, _now, ctx) => {
    const active = pick(
      s.matches.filter((m) => m.status === "active"),
      rng,
    );
    return active ? settle(removeMatch(s, active.id, ctx), s) : s;
  },
  (s, rng, _now, ctx) => {
    const p = pick(
      s.players.filter((x) => !x.removed),
      rng,
    );
    return p ? settle(setSittingOut(s, p.id, !p.sittingOut, ctx), s) : s;
  },
  (s, rng, _now, ctx) => {
    const p = pick(
      s.players.filter((x) => !x.removed),
      rng,
    );
    return p ? settle(removePlayer(s, p.id, ctx), s) : s;
  },
  (s, rng, _now, ctx) =>
    settle(
      addPlayer(
        s,
        {
          name: `Late ${s.players.length}`,
          skill: pick(["beginner", "intermediate", "advanced"], rng)!,
        },
        ctx,
      ),
      s,
    ),
  (s, rng, _now, ctx) => {
    const court = pick(
      s.courts.filter((c) => c.activeMatchId === null && c.lineup),
      rng,
    );
    return court ? settle(rehashCourt(s, court.id, ctx), s) : s;
  },
  (s, _rng, _now, ctx) => settle(rehashAll(s, ctx), s),
  (s, _rng, _now, ctx) => settle(addCourt(s, ctx), s),
  (s, rng, _now, ctx) => {
    const court = pick(s.courts, rng);
    return court && s.courts.length > 1 ? settle(removeCourt(s, court.id, ctx), s) : s;
  },
  // queue: add / fill / move / remove
  (s, _rng, _now, ctx) => (s.queues.length < 3 ? addQueue(s, ctx) : s),
  (s, rng, _now, _ctx) => {
    const queue = pick(s.queues, rng);
    const p = pick(
      s.players.filter((x) => !x.removed),
      rng,
    );
    if (!queue || !p) return s;
    return settle(
      setQueueSlot(
        s,
        queue.id,
        randomInt(rng, 2) as 0 | 1,
        randomInt(rng, 2) as 0 | 1,
        rng() < 0.2 ? null : p.id,
      ),
      s,
    );
  },
  (s, rng, _now, ctx) => {
    const queue = pick(s.queues, rng);
    const court = pick(s.courts, rng);
    return queue && court ? settle(moveQueueToCourt(s, queue.id, court.id, ctx), s) : s;
  },
  (s, rng, _now, _ctx) => {
    const queue = pick(s.queues, rng);
    return queue ? settle(removeQueue(s, queue.id), s) : s;
  },
];

function simulate(seed: number): void {
  const rng = createRng(seed * 7919);
  const ctx = makeCtx(seed);
  const players = 12 + randomInt(rng, 19);
  let s = createSession(
    {
      name: `Run ${seed}`,
      clubId: null,
      clubName: null,
      pointSystem: rng() < 0.5 ? 21 : 31,
      plannedHours: 2,
      courts: 1 + randomInt(rng, 6),
      players: Array.from({ length: players }, (_, i) => ({
        name: `P${i}`,
        skill: (["beginner", "intermediate", "advanced"] as const)[randomInt(rng, 3)]!,
      })),
    },
    ctx,
  );
  let now = T0;
  for (let step = 0; step < 80; step++) {
    now += (1 + randomInt(rng, 5)) * MIN;
    const op = steps[randomInt(rng, steps.length)]!;
    s = op(s, rng, now, at(ctx, now));
    const problems = violations(s);
    if (problems.length > 0) {
      throw new Error(`seed ${seed} step ${step}: ${problems.join("; ")}`);
    }
    // Derived helpers must also stay well-formed.
    for (const stats of allPlayerStats(s, now).values()) {
      if (stats.streak < 0 || stats.total < stats.matchesPlayed) {
        throw new Error(`seed ${seed} step ${step}: inconsistent stats`);
      }
    }
    for (const queue of s.queues) queueWarnings(s, queue, now);
  }
}

describe("randomised simulation", () => {
  it("keeps every hard rule over 200 seeded runs", () => {
    const started = performance.now();
    for (let seed = 1; seed <= 200; seed++) simulate(seed);
    // Informational: the run is expected to take a second or two.
    expect(performance.now() - started).toBeLessThan(60_000);
  }, 60_000);
});

describe("rest rule over whole evenings", () => {
  function playRounds(playersCount: number, courts: number, rounds: number, seed: number) {
    const ctx = makeCtx(seed);
    let s = createSession(
      {
        name: "Rest",
        clubId: null,
        clubName: null,
        pointSystem: 21,
        plannedHours: 3,
        courts,
        players: Array.from({ length: playersCount }, (_, i) => ({
          name: `P${i}`,
          skill: (["beginner", "intermediate", "advanced"] as const)[i % 3]!,
        })),
      },
      ctx,
    );
    let maxStreak = 0;
    for (let r = 0; r < rounds; r++) {
      const start = T0 + r * 30 * MIN;
      for (const court of s.courts) {
        if (court.lineup) s = unwrap(startMatch(s, court.id, at(ctx, start)));
      }
      maxStreak = Math.max(
        maxStreak,
        ...[...allPlayerStats(s, start).values()].map((x) => x.streak),
      );
      for (const m of s.matches.filter((x) => x.status === "active")) {
        s = unwrap(endMatch(s, m.id, null, at(ctx, start + 20 * MIN)));
      }
    }
    return maxStreak;
  }

  it("nobody plays a third match in a row when there are enough players", () => {
    for (let seed = 1; seed <= 10; seed++) {
      expect(playRounds(14, 2, 24, seed)).toBeLessThanOrEqual(2);
      expect(playRounds(20, 3, 24, seed)).toBeLessThanOrEqual(2);
    }
  });

  it("with exactly 4 players on 1 Court they must play back to back", () => {
    expect(playRounds(4, 1, 6, 1)).toBe(6);
  });
});

// ------------------------------------------------- Mixing over whole evenings

const SKILL_CYCLE = ["beginner", "intermediate", "advanced"] as const;

interface StaggeredOptions {
  players: number;
  courts: number;
  /** Stop once this many Matches have ended. */
  matches: number;
  /** Court i starts its first Match `i × stagger` minutes after Court 1. */
  stagger: number;
  seed: number;
  mixedSkill?: boolean;
  matchMinutes?: number;
  /** A new player joins at this minute (before any Match ending at the same minute). */
  latecomerAtMin?: number;
  /** Also stop once the clock reaches this minute. */
  untilMin?: number;
}

interface StaggeredResult {
  session: Session;
  courts: number;
  /** Players present from the start. */
  originals: string[];
  latecomerId: string | null;
  /** Ended Matches in start order, as sorted player ids. */
  sets: string[][];
  pairsShared: number;
  partnerPairs: number;
  distinctSets: number;
  /** Most minus fewest Matches played among the original players at the end. */
  finalSpread: number;
  /** Worst (most − fewest total Matches among originals) seen at any pick. */
  maxSpreadAtPick: number;
  maxStreakAtPick: number;
  /** Longest run of Match starts a player was free and sat out (originals). */
  maxSitRun: number;
  /** Picks at which some free player's Rests in a row had reached 2 × Courts. */
  restsTriggers: number;
  /** Times a set at index i equals the set at index i + 2, in total (8 players, 1 Court). */
  returnsAfterTwo: number;
  /** Most times any single 4-set came back two Matches later. */
  maxReturnsPerSet: number;
  /** Ids of the first Match started at or after the latecomer joined. */
  firstMatchAfterJoin: string[] | null;
  /** Matches started in the 60 minutes after the latecomer joined, per player. */
  startedAfterJoin: Map<string, number>;
}

/**
 * Event-driven evening: every Match lasts `matchMinutes` and a Court restarts the moment its
 * Match ends. Court starts are staggered so Courts end at different times.
 */
function playStaggered(o: StaggeredOptions): StaggeredResult {
  const length = (o.matchMinutes ?? 15) * MIN;
  const ctx = makeCtx(o.seed);
  let s = createSession(
    {
      name: "Mix",
      clubId: null,
      clubName: null,
      pointSystem: 21,
      plannedHours: 3,
      courts: o.courts,
      players: Array.from({ length: o.players }, (_, i) => ({
        name: `P${i + 1}`,
        skill: o.mixedSkill ? SKILL_CYCLE[i % 3]! : "intermediate",
      })),
    },
    ctx,
  );
  const originals = s.players.map((p) => p.id);
  const courtIds = s.courts.map((c) => c.id);
  const firstStart = new Map(courtIds.map((id, i) => [id, T0 + i * o.stagger * MIN]));
  const joinAt = o.latecomerAtMin === undefined ? null : T0 + o.latecomerAtMin * MIN;
  const stopAt = o.untilMin === undefined ? Infinity : T0 + o.untilMin * MIN;
  let latecomerId: string | null = null;
  let ended = 0;
  let now = T0;
  let maxSpreadAtPick = 0;
  let maxStreakAtPick = 0;
  let restsTriggers = 0;
  const limit = 2 * o.courts;

  const inspect = () => {
    const history = buildHistory(s, now);
    const totals = originals.map((id) => history.byPlayer.get(id)!.total);
    maxSpreadAtPick = Math.max(maxSpreadAtPick, Math.max(...totals) - Math.min(...totals));
    for (const h of history.byPlayer.values())
      maxStreakAtPick = Math.max(maxStreakAtPick, h.streak);
  };

  for (let guard = 0; guard < 10_000 && ended < o.matches && now < stopAt; guard++) {
    if (joinAt !== null && latecomerId === null && now >= joinAt) {
      s = unwrap(addPlayer(s, { name: "Late", skill: "intermediate" }, at(ctx, now)));
      latecomerId = s.players.at(-1)!.id;
    }
    for (const court of s.courts) {
      if (court.activeMatchId !== null || !court.lineup) continue;
      if (now < (firstStart.get(court.id) ?? T0)) continue;
      const history = buildHistory(s, now);
      if ([...history.byPlayer.values()].some((h) => h.rests >= limit)) restsTriggers += 1;
      s = unwrap(startMatch(s, court.id, at(ctx, now)));
    }
    const active = s.matches.filter((m) => m.status === "active");
    const waiting = courtIds
      .map((id) => firstStart.get(id)!)
      .filter((t) => t > now && s.courts.some((c) => c.lineup));
    const nextEnd = active.map((m) => m.startedAt + length);
    const nextJoin = joinAt !== null && latecomerId === null ? [joinAt] : [];
    const t = Math.min(...waiting, ...nextEnd, ...nextJoin);
    if (!Number.isFinite(t)) break;
    now = t;
    if (joinAt !== null && latecomerId === null && now >= joinAt) continue;
    for (const m of active.filter((x) => x.startedAt + length === now)) {
      s = unwrap(endMatch(s, m.id, null, at(ctx, now)));
      ended += 1;
      inspect();
    }
  }

  const sorted = [...s.matches].sort((a, b) => a.startedAt - b.startedAt);
  const endedMatches = sorted.filter((m) => m.status === "ended");
  const sets = endedMatches.map((m) => [...m.teams[0], ...m.teams[1]].sort());
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const shared = new Set<string>();
  const partners = new Set<string>();
  for (const m of endedMatches) {
    const four = [...m.teams[0], ...m.teams[1]];
    for (const a of four) for (const b of four) if (a < b) shared.add(key(a, b));
    for (const team of m.teams) partners.add(key(team[0], team[1]));
  }
  const played = new Map(originals.map((id) => [id, 0]));
  for (const set of sets) for (const id of set) played.set(id, (played.get(id) ?? 0) + 1);
  const counts = originals.map((id) => played.get(id)!);

  let maxSitRun = 0;
  for (const id of originals) {
    let run = 0;
    for (const m of sorted) {
      if ([...m.teams[0], ...m.teams[1]].includes(id)) run = 0;
      else if (m.freeAtStart.includes(id)) maxSitRun = Math.max(maxSitRun, ++run);
    }
  }
  const startedAfterJoin = new Map<string, number>();
  let firstMatchAfterJoin: string[] | null = null;
  if (joinAt !== null) {
    for (const m of sorted) {
      if (m.startedAt < joinAt) continue;
      const four = [...m.teams[0], ...m.teams[1]];
      firstMatchAfterJoin ??= four;
      if (m.startedAt >= joinAt + 60 * MIN) continue;
      for (const id of four) startedAfterJoin.set(id, (startedAfterJoin.get(id) ?? 0) + 1);
    }
  }
  const returns = sets.filter(
    (set, i) => i + 2 < sets.length && set.join() === sets[i + 2]!.join(),
  );
  const perSet = new Map<string, number>();
  for (const set of returns) perSet.set(set.join(), (perSet.get(set.join()) ?? 0) + 1);
  return {
    session: s,
    courts: o.courts,
    originals,
    latecomerId,
    sets,
    pairsShared: shared.size,
    partnerPairs: partners.size,
    distinctSets: new Set(sets.map((set) => set.join(","))).size,
    finalSpread: Math.max(...counts) - Math.min(...counts),
    maxSpreadAtPick,
    maxStreakAtPick,
    maxSitRun,
    restsTriggers,
    returnsAfterTwo: returns.length,
    maxReturnsPerSet: Math.max(0, ...perSet.values()),
    firstMatchAfterJoin,
    startedAfterJoin,
  };
}

const MIXING_SEEDS = Array.from({ length: 10 }, (_, i) => i + 1);

interface Scenario {
  label: string;
  players: number;
  courts: number;
  matches: number;
  stagger: number;
}

const EIGHT: Scenario = { label: "8p/1c", players: 8, courts: 1, matches: 16, stagger: 0 };
const NINE: Scenario = { label: "9p/1c", players: 9, courts: 1, matches: 24, stagger: 0 };
const TEN: Scenario = { label: "10p/1c", players: 10, courts: 1, matches: 24, stagger: 0 };
const TWELVE: Scenario = { label: "12p/2c", players: 12, courts: 2, matches: 36, stagger: 7 };
const SIXTEEN: Scenario = { label: "16p/3c", players: 16, courts: 3, matches: 48, stagger: 5 };

/** Every scenario twice (same Skill, mixed Skill) over 10 seeds. */
function runAll(sc: Scenario): { mixedSkill: boolean; runs: StaggeredResult[] }[] {
  return [false, true].map((mixedSkill) => ({
    mixedSkill,
    runs: MIXING_SEEDS.map((seed) => playStaggered({ ...sc, seed, mixedSkill })),
  }));
}

const lowest = (xs: number[]) => Math.min(...xs);
const highest = (xs: number[]) => Math.max(...xs);

describe("mixing over whole evenings", () => {
  // Thresholds: the worst of 10 seeds (both Skill mixes) was 28/28, 66/66 and 118/120 pairs;
  // the spec asks for ≥ 26/28, ≥ 85% of 66 and ≥ 75% of 120, which sit about 10% below.
  it("8 players, 1 Court: 16 rounds cover ≥ 26 of 28 pairs, a 4-set rarely returns", () => {
    for (const { runs } of runAll(EIGHT)) {
      expect(lowest(runs.map((r) => r.pairsShared))).toBeGreaterThanOrEqual(26);
      // the same 4-set comes back 2 rounds later at most once (per set); two sets in total
      expect(highest(runs.map((r) => r.maxReturnsPerSet))).toBeLessThanOrEqual(1);
      expect(highest(runs.map((r) => r.returnsAfterTwo))).toBeLessThanOrEqual(2);
    }
  });

  it("12 players, 2 Courts started at different times: 36 Matches cover ≥ 85% of 66 pairs", () => {
    for (const { runs } of runAll(TWELVE)) {
      expect(lowest(runs.map((r) => r.pairsShared))).toBeGreaterThanOrEqual(Math.ceil(0.85 * 66));
    }
  });

  it("16 players, 3 Courts started at different times: 48 Matches cover ≥ 75% of 120 pairs", () => {
    for (const { runs } of runAll(SIXTEEN)) {
      expect(lowest(runs.map((r) => r.pairsShared))).toBeGreaterThanOrEqual(90);
    }
  });

  it("9 and 10 players on 1 Court mix at least as well as before (baseline 35/36 and 44/45)", () => {
    for (const { runs } of runAll(NINE)) {
      expect(lowest(runs.map((r) => r.pairsShared))).toBeGreaterThanOrEqual(35);
    }
    for (const { runs } of runAll(TEN)) {
      expect(lowest(runs.map((r) => r.pairsShared))).toBeGreaterThanOrEqual(44);
    }
  });

  it("keeps play counts within 2 and Streaks within 2 at every pick", () => {
    for (const sc of [EIGHT, NINE, TEN, TWELVE, SIXTEEN]) {
      for (const { runs } of runAll(sc)) {
        expect(highest(runs.map((r) => r.maxSpreadAtPick))).toBeLessThanOrEqual(2);
        expect(highest(runs.map((r) => r.maxStreakAtPick))).toBeLessThanOrEqual(2);
      }
    }
  });

  it("nobody sits out more than 2 rounds in a row on 1 Court", () => {
    for (const sc of [EIGHT, NINE, TEN]) {
      for (const { runs } of runAll(sc)) {
        expect(highest(runs.map((r) => r.maxSitRun))).toBeLessThanOrEqual(2);
      }
    }
  });

  it("reports the observed numbers, including how often Rests in a row can trigger", () => {
    const lines: string[] = [];
    const range = (xs: number[]) => `${lowest(xs)}–${highest(xs)}`;
    for (const sc of [EIGHT, NINE, TEN, TWELVE, SIXTEEN]) {
      for (const { mixedSkill, runs } of runAll(sc)) {
        lines.push(
          `${sc.label} ${mixedSkill ? "mixed" : "same "}: pairs ${range(runs.map((r) => r.pairsShared))}` +
            ` sets ${range(runs.map((r) => r.distinctSets))} spread ${range(runs.map((r) => r.finalSpread))}` +
            ` sitRun ${range(runs.map((r) => r.maxSitRun))} (limit ${2 * sc.courts})` +
            ` restsTriggers ${range(runs.map((r) => r.restsTriggers))}`,
        );
      }
    }
    console.info("\n" + lines.join("\n"));
    expect(lines).toHaveLength(10);
  });
});

describe("latecomer over a whole evening", () => {
  it("is in the first Lineup after joining at minute 60 and plays at most 1 more than anyone", () => {
    for (const sc of [EIGHT, TWELVE, SIXTEEN]) {
      for (const mixedSkill of [false, true]) {
        for (const seed of MIXING_SEEDS) {
          const r = playStaggered({
            ...sc,
            matches: 10_000,
            untilMin: 120,
            latecomerAtMin: 60,
            seed,
            mixedSkill,
          });
          const label = `${sc.label} ${mixedSkill ? "mixed" : "same"} seed ${seed}`;
          expect([label, r.firstMatchAfterJoin!.includes(r.latecomerId!)]).toEqual([label, true]);
          const late = r.startedAfterJoin.get(r.latecomerId!) ?? 0;
          const most = highest(r.originals.map((id) => r.startedAfterJoin.get(id) ?? 0));
          expect([label, late - most <= 1]).toEqual([label, true]);
        }
      }
    }
  });
});
