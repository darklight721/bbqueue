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
