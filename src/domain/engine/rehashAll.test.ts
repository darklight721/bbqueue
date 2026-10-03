import { describe, expect, it } from "vite-plus/test";
import type { Session } from "../types.ts";
import { createSession, endMatch, fill, rehashAll, startMatch } from "./operations.ts";
import { setLineup } from "./lineups.ts";
import { MIN, T0, at, makeCtx, unwrap, violations } from "./test-utils.ts";

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
