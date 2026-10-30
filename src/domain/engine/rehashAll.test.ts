import { describe, expect, it } from "vite-plus/test";
import type { Session } from "../types.ts";
import { createSession, endMatch, fill, rehashAll, startMatch } from "./operations.ts";
import { setLineup } from "./lineups.ts";
import { createRng, randomInt } from "./rng.ts";
import { balanceOf, makeEnv, mixOf, owes, restKey, restsTier, teamKey } from "./select.ts";
import {
  MIN,
  T0,
  at,
  lineupSet,
  makeCtx,
  match,
  player,
  playersNamed,
  session,
  unwrap,
  violations,
} from "./test-utils.ts";

function create(players: number, courts: number, seed: number) {
  const ctx = makeCtx(seed);
  const s = createSession(
    {
      name: "S",
      clubId: null,
      clubName: null,
      pointSystem: 21,
      plannedHours: 2,
      courts,
      players: Array.from({ length: players }, (_, i) => ({
        name: `P${i + 1}`,
        skill: (["beginner", "intermediate", "advanced"] as const)[i % 3]!,
      })),
    },
    ctx,
  );
  return { ctx, s };
}

/** Play `rounds` rounds so partner history exists. */
function played(players: number, courts: number, rounds: number, seed: number) {
  const { ctx, s } = create(players, courts, seed);
  let current = s;
  for (let r = 0; r < rounds; r++) {
    const start = T0 + r * 30 * MIN;
    for (const court of current.courts) {
      if (court.lineup) current = unwrap(startMatch(current, court.id, at(ctx, start)));
    }
    for (const m of current.matches.filter((x) => x.status === "active")) {
      current = unwrap(endMatch(current, m.id, null, at(ctx, start + 15 * MIN)));
    }
  }
  return { ctx: at(ctx, T0 + rounds * 30 * MIN), s: current };
}

function repeats(s: Session): number {
  const pairs = new Map<string, number>();
  const key = (a: string, b: string) => [a, b].sort().join("|");
  for (const m of s.matches) {
    for (const team of m.teams)
      pairs.set(key(team[0], team[1]), (pairs.get(key(team[0], team[1])) ?? 0) + 1);
  }
  return s.courts.reduce(
    (sum, court) =>
      sum +
      (court.lineup?.teams ?? []).reduce(
        (t, team) => t + (pairs.get(key(team[0], team[1])) ?? 0),
        0,
      ),
    0,
  );
}

describe("rehash all", () => {
  it("never produces more partner repeats than independent per-Court picks, in aggregate", () => {
    let together = 0;
    let independent = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { ctx, s } = played(11, 3, 5, seed);
      together += repeats(unwrap(rehashAll(s, ctx)));
      const cleared = s.courts.reduce((acc, court) => setLineup(acc, court.id, null), s);
      independent += repeats(fill(cleared, ctx));
    }
    expect(together).toBeLessThanOrEqual(independent);
  });

  it("keeps every hard rule over many seeds and court counts", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { ctx, s } = played(10 + (seed % 7), 2 + (seed % 3), 3, seed);
      const next = unwrap(rehashAll(s, ctx));
      expect(violations(next)).toEqual([]);
    }
  });

  it("gives only as many Courts a Lineup as there are players for", () => {
    const { ctx, s } = create(6, 3, 1);
    const next = unwrap(rehashAll(s, ctx));
    expect(next.courts.filter((c) => c.lineup !== null)).toHaveLength(1);
    expect(next.courts[0]!.lineup).not.toBeNull();
  });
});

// ----------------------------------------------------------- Mixing (ADR-0009)

type Pairs = [[string, string], [string, string]];

/** Random Ended Matches among `count` players; Courts are idle with no Lineups. */
function randomHistory(seed: number, count: number, courts: number): Session {
  const rng = createRng(seed * 101);
  const players = playersNamed(count).map((p, i) =>
    player(p.id, (["beginner", "intermediate", "advanced"] as const)[i % 3]),
  );
  const total = 3 + randomInt(rng, 9);
  const matches = Array.from({ length: total }, (_, i) => {
    const order = players.map((p) => p.id).sort(() => rng() - 0.5);
    const four = order.slice(0, 4) as [string, string, string, string];
    return match({
      id: `m${i}`,
      teams: [
        [four[0], four[1]],
        [four[2], four[3]],
      ],
      startedAt: T0 - (total - i) * 9 * MIN,
      endedAt: T0 - (total - i) * 9 * MIN + 6 * MIN,
      freeAtStart: order.slice(4).filter(() => rng() < 0.9),
    });
  });
  return session({ players, courts, matches });
}

const playing = (s: Session) => s.courts.flatMap((c) => (c.lineup ? lineupSet(s, c.number) : []));

describe("rehash all with Mixing", () => {
  it("includes everyone owed a place before its players (Rest, Rests in a row, then ≻)", () => {
    for (const seed of Array.from({ length: 200 }, (_, i) => i + 1)) {
      const rng = createRng(seed);
      const courts = 2 + randomInt(rng, 2);
      const s = randomHistory(seed, 4 * courts + 1 + randomInt(rng, 8), courts);
      const next = unwrap(rehashAll(s, makeCtx(seed)));
      const chosen = new Set(playing(next));
      expect(chosen.size).toBe(courts * 4);
      const env = makeEnv(s, makeCtx(seed));
      for (const c of chosen) {
        for (const x of s.players.map((p) => p.id).filter((id) => !chosen.has(id))) {
          expect(restKey(env, x) < restKey(env, c)).toBe(false);
          if (restKey(env, x) !== restKey(env, c)) continue;
          expect(restsTier(env, x) > restsTier(env, c)).toBe(false);
          if (restsTier(env, x) === restsTier(env, c)) expect(owes(env, x, c)).toBe(false);
        }
      }
    }
  });

  it("keeps the players Rest forces in", () => {
    // Round 1 and 2 on two Courts: p1–p6 and p13–p14 play both rounds (Streak 2, rested);
    // p7–p12 never played, so they are the only players with a Streak below 2.
    const a: Pairs = [
      ["p1", "p2"],
      ["p3", "p4"],
    ];
    const b: Pairs = [
      ["p5", "p6"],
      ["p13", "p14"],
    ];
    const all = Array.from({ length: 14 }, (_, i) => `p${i + 1}`);
    const matches = [0, 1].flatMap((round) =>
      [a, b].map((teams, k) =>
        match({
          id: `r${round}c${k}`,
          court: k + 1,
          teams,
          startedAt: T0 - (60 - round * 20) * MIN,
          endedAt: T0 - (50 - round * 20) * MIN,
          freeAtStart: all.filter((id) => !teams.flat().includes(id)),
        }),
      ),
    );
    const s = session({ players: playersNamed(14), courts: 2, matches });
    for (let seed = 1; seed <= 100; seed++) {
      const ctx = makeCtx(seed);
      const next = unwrap(rehashAll(s, ctx));
      const chosen = playing(next);
      expect(chosen).toHaveLength(8);
      for (const id of ["p7", "p8", "p9", "p10", "p11", "p12"]) expect(chosen).toContain(id);
    }
  });

  it("keeps the players whose Rests in a row reached the limit (max(2 × Courts, floor(players / 4)))", () => {
    // Four starts passed while p9–p12 were free and sat out (limit is 4 on two Courts).
    const g1: Pairs = [
      ["p1", "p2"],
      ["p3", "p4"],
    ];
    const g2: Pairs = [
      ["p5", "p6"],
      ["p7", "p8"],
    ];
    const old = match({
      id: "old",
      teams: [
        ["p9", "p10"],
        ["p11", "p12"],
      ],
      startedAt: T0 - 120 * MIN,
      endedAt: T0 - 110 * MIN,
      freeAtStart: ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"],
    });
    const recent = [g1, g2, g1, g2].map((teams, i) =>
      match({
        id: `h${i}`,
        teams,
        startedAt: T0 - (80 - i * 15) * MIN,
        endedAt: T0 - (70 - i * 15) * MIN,
        freeAtStart: ["p9", "p10", "p11", "p12", ...(i % 2 === 0 ? g2 : g1).flat()],
      }),
    );
    const s = session({ players: playersNamed(12), courts: 2, matches: [old, ...recent] });
    const env = makeEnv(s, makeCtx());
    expect(restsTier(env, "p9")).toBe(1);
    for (let seed = 1; seed <= 100; seed++) {
      const chosen = playing(unwrap(rehashAll(s, makeCtx(seed))));
      for (const id of ["p9", "p10", "p11", "p12"]) expect(chosen).toContain(id);
    }
  });

  it("has a Mixing score no worse than the greedy per-Court start", () => {
    for (const seed of Array.from({ length: 120 }, (_, i) => i + 1)) {
      const rng = createRng(seed);
      const courts = 2 + randomInt(rng, 2);
      const s = randomHistory(seed, 4 * courts + 1 + randomInt(rng, 8), courts);
      const env = makeEnv(s, makeCtx(seed));
      const score = (x: Session): [number, number] => {
        let unbalanced = 0;
        let mix = 0;
        for (const court of x.courts) {
          if (!court.lineup) continue;
          if (balanceOf(env, court.lineup.teams) > 1) unbalanced += 1;
          mix += mixOf(env, lineupSet(x, court.number));
        }
        return [unbalanced, mix];
      };
      const greedy = score(fill(s, makeCtx(seed)));
      const all = score(unwrap(rehashAll(s, makeCtx(seed))));
      const worse = all[0] > greedy[0] || (all[0] === greedy[0] && all[1] > greedy[1]);
      expect(worse).toBe(false);
    }
  });

  it("still changes the set of Teams after history exists", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { ctx, s } = played(11 + (seed % 4), 2 + (seed % 2), 4, seed);
      const teams = (x: Session) =>
        x.courts
          .flatMap((c) => (c.lineup ? c.lineup.teams.map(teamKey) : []))
          .sort()
          .join("/");
      const next = unwrap(rehashAll(s, ctx));
      expect(teams(next)).not.toBe(teams(s));
      expect(violations(next)).toEqual([]);
    }
  });
});
