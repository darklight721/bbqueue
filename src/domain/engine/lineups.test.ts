import { describe, expect, it } from "vite-plus/test";
import { fill, rehashCourt } from "./operations.ts";
import { allPlayerStats } from "./playerStats.ts";
import { lineupPlayerIds } from "./select.ts";
import {
  MIN,
  T0,
  lineupSet,
  makeCtx,
  match,
  player,
  playersNamed,
  session,
  unwrap,
} from "./test-utils.ts";

const seeds = Array.from({ length: 20 }, (_, i) => i + 1);

describe("lineup selection", () => {
  it("gives a Court a Lineup of 4 distinct players in 2 Teams of 2", () => {
    const s = fill(session({ players: playersNamed(6) }), makeCtx());
    const lineup = s.courts[0]!.lineup!;
    expect(lineup.teams.every((team) => team.length === 2)).toBe(true);
    expect(new Set(lineupPlayerIds(lineup)).size).toBe(4);
  });

  it("leaves a Court waiting with fewer than 4 candidates", () => {
    const s = fill(session({ players: playersNamed(3) }), makeCtx());
    expect(s.courts[0]!.lineup).toBeNull();
  });

  it("ignores sitting-out and removed players", () => {
    const players = playersNamed(5);
    players[0] = { ...players[0]!, sittingOut: true };
    players[1] = { ...players[1]!, removed: true };
    expect(fill(session({ players }), makeCtx()).courts[0]!.lineup).toBeNull();
  });

  it("never changes existing Lineups when filling", () => {
    const base = fill(session({ players: playersNamed(9), courts: 2 }), makeCtx(3));
    const withMore = { ...base, players: [...base.players, player("p10"), player("p11")] };
    const again = fill(withMore, makeCtx(99));
    expect(again.courts[0]!.lineup).toEqual(base.courts[0]!.lineup);
    expect(again.courts[1]!.lineup).toEqual(base.courts[1]!.lineup);
  });

  it("gives disjoint Lineups to different Courts", () => {
    const s = fill(session({ players: playersNamed(9), courts: 2 }), makeCtx());
    const a = lineupSet(s, 1);
    const b = lineupSet(s, 2);
    expect(a).toHaveLength(4);
    expect(b).toHaveLength(4);
    expect(a.some((id) => b.includes(id))).toBe(false);
  });
});

describe("balance", () => {
  const mixed = [
    player("a1", "advanced"),
    player("a2", "advanced"),
    player("b1", "beginner"),
    player("b2", "beginner"),
  ];

  it("pairs each advanced player with a beginner", () => {
    for (const seed of seeds) {
      const s = fill(session({ players: mixed }), makeCtx(seed));
      for (const team of s.courts[0]!.lineup!.teams) {
        expect(team.filter((id) => id.startsWith("a"))).toHaveLength(1);
      }
    }
  });

  it("still produces a Lineup when balance is impossible", () => {
    const players = [
      player("a1", "advanced"),
      player("a2", "advanced"),
      player("a3", "advanced"),
      player("b1", "beginner"),
    ];
    const s = fill(session({ players }), makeCtx());
    expect(s.courts[0]!.lineup).not.toBeNull();
  });
});

describe("fairness", () => {
  it("picks players with the fewest recent matches first", () => {
    const players = playersNamed(6);
    const s = session({
      players,
      matches: [
        match({
          id: "m1",
          teams: [
            ["p1", "p2"],
            ["p3", "p4"],
          ],
          startedAt: T0 - 8 * MIN,
          endedAt: T0 - 2 * MIN,
          freeAtStart: ["p5", "p6"],
        }),
      ],
    });
    for (const seed of seeds) {
      const picked = lineupSet(fill(s, makeCtx(seed)), 1);
      expect(picked).toContain("p5");
      expect(picked).toContain("p6");
    }
  });

  // Group A played 20 min ago once; group B played three times 60–90 min ago.
  const history = (pointSystem: 21 | 31) =>
    session({
      pointSystem,
      players: playersNamed(8),
      matches: [
        match({
          id: "b1",
          teams: [
            ["p5", "p6"],
            ["p7", "p8"],
          ],
          startedAt: T0 - 90 * MIN,
          endedAt: T0 - 85 * MIN,
          freeAtStart: ["p1", "p2", "p3", "p4"],
        }),
        match({
          id: "b2",
          teams: [
            ["p5", "p7"],
            ["p6", "p8"],
          ],
          startedAt: T0 - 80 * MIN,
          endedAt: T0 - 75 * MIN,
          freeAtStart: ["p1", "p2", "p3", "p4"],
        }),
        match({
          id: "b3",
          teams: [
            ["p5", "p8"],
            ["p6", "p7"],
          ],
          startedAt: T0 - 70 * MIN,
          endedAt: T0 - 65 * MIN,
          freeAtStart: ["p1", "p2", "p3", "p4"],
        }),
        match({
          id: "a1",
          teams: [
            ["p1", "p2"],
            ["p3", "p4"],
          ],
          startedAt: T0 - 20 * MIN,
          endedAt: T0 - 10 * MIN,
          freeAtStart: ["p5", "p6", "p7", "p8"],
        }),
      ],
    });

  it("uses a 15 minute window for 21 points: the 20-minute-old match does not count", () => {
    for (const seed of seeds) {
      // Nobody has a recent match, so fewest total (group A: 1 vs group B: 3) decides.
      expect(lineupSet(fill(history(21), makeCtx(seed)), 1)).toEqual(["p1", "p2", "p3", "p4"]);
    }
  });

  it("uses a 30 minute window for 31 points: the 20-minute-old match counts", () => {
    for (const seed of seeds) {
      expect(lineupSet(fill(history(31), makeCtx(seed)), 1)).toEqual(["p5", "p6", "p7", "p8"]);
    }
  });
});

describe("rest", () => {
  // G (p1–p4) played the last two matches in a row but have the fewest total matches;
  // H (p5–p8) rested for those and have played five times each.
  const hTeams: [string, string][][] = [
    [
      ["p5", "p6"],
      ["p7", "p8"],
    ],
    [
      ["p5", "p7"],
      ["p6", "p8"],
    ],
    [
      ["p5", "p8"],
      ["p6", "p7"],
    ],
    [
      ["p5", "p6"],
      ["p7", "p8"],
    ],
    [
      ["p5", "p7"],
      ["p6", "p8"],
    ],
  ];
  const history = () =>
    session({
      players: playersNamed(8),
      matches: [
        ...hTeams.map((teams, i) =>
          match({
            id: `h${i}`,
            teams: teams as [[string, string], [string, string]],
            startedAt: T0 - (200 - i * 10) * MIN,
            endedAt: T0 - (195 - i * 10) * MIN,
            freeAtStart: ["p1", "p2", "p3", "p4"],
          }),
        ),
        match({
          id: "g1",
          teams: [
            ["p1", "p2"],
            ["p3", "p4"],
          ],
          startedAt: T0 - 50 * MIN,
          endedAt: T0 - 45 * MIN,
          freeAtStart: ["p5", "p6", "p7", "p8"],
        }),
        match({
          id: "g2",
          teams: [
            ["p1", "p3"],
            ["p2", "p4"],
          ],
          startedAt: T0 - 40 * MIN,
          endedAt: T0 - 35 * MIN,
          freeAtStart: ["p5", "p6", "p7", "p8"],
        }),
      ],
    });

  it("computes the streak from started matches", () => {
    const stats = allPlayerStats(history(), T0);
    expect(stats.get("p1")!.streak).toBe(2);
    expect(stats.get("p5")!.streak).toBe(0);
  });

  it("outranks fairness: players on a 2-match streak sit out even with the fewest matches", () => {
    for (const seed of seeds) {
      expect(lineupSet(fill(history(), makeCtx(seed)), 1)).toEqual(["p5", "p6", "p7", "p8"]);
    }
  });
});

describe("new partners", () => {
  it("avoids repeating the previous split when an equally fair one exists", () => {
    const s = session({
      players: playersNamed(4),
      matches: [
        match({
          id: "m1",
          teams: [
            ["p1", "p2"],
            ["p3", "p4"],
          ],
          startedAt: T0 - 20 * MIN,
          endedAt: T0 - 10 * MIN,
        }),
      ],
    });
    for (const seed of seeds) {
      const [a, b] = fill(s, makeCtx(seed)).courts[0]!.lineup!.teams;
      const key = (team: readonly string[]) => [...team].sort().join();
      expect([key(a), key(b)].sort()).not.toEqual(["p1,p2", "p3,p4"]);
    }
  });

  it("prefers balance over new partners", () => {
    const players = [
      player("a1", "advanced"),
      player("a2", "advanced"),
      player("b1", "beginner"),
      player("b2", "beginner"),
    ];
    // a1+b1 | a2+b2 was the previous split: the only other balanced split is a1+b2 | a2+b1.
    const s = session({
      players,
      matches: [
        match({
          id: "m1",
          teams: [
            ["a1", "b1"],
            ["a2", "b2"],
          ],
          startedAt: T0 - 20 * MIN,
          endedAt: T0 - 10 * MIN,
        }),
      ],
    });
    for (const seed of seeds) {
      const teams = fill(s, makeCtx(seed)).courts[0]!.lineup!.teams;
      for (const team of teams) expect(team.filter((id) => id.startsWith("a"))).toHaveLength(1);
      const keys = teams.map((team) => [...team].sort().join());
      expect(keys).not.toContain("a1,b1");
    }
  });
});

describe("rehash", () => {
  it("returns a different set of players when one exists", () => {
    for (const seed of seeds) {
      const ctx = makeCtx(seed);
      const s = fill(session({ players: playersNamed(8) }), ctx);
      const before = lineupSet(s, 1);
      const after = lineupSet(unwrap(rehashCourt(s, "c1", ctx)), 1);
      expect(after).toHaveLength(4);
      expect(after).not.toEqual(before);
    }
  });

  it("returns a different set even when ranking would pick the same four", () => {
    const players = playersNamed(5);
    for (const seed of seeds) {
      const ctx = makeCtx(seed);
      const s = fill(session({ players }), ctx);
      const before = lineupSet(s, 1);
      const after = lineupSet(unwrap(rehashCourt(s, "c1", ctx)), 1);
      expect(after).not.toEqual(before);
    }
  });

  it("changes only the split when there are exactly 4 candidates", () => {
    for (const seed of seeds) {
      const ctx = makeCtx(seed);
      const s = fill(session({ players: playersNamed(4) }), ctx);
      const before = s.courts[0]!.lineup!;
      const after = unwrap(rehashCourt(s, "c1", ctx)).courts[0]!.lineup!;
      expect(lineupPlayerIds(after).sort()).toEqual(lineupPlayerIds(before).sort());
      const sig = (l: typeof before) =>
        l.teams
          .map((t) => [...t].sort().join())
          .sort()
          .join("/");
      expect(sig(after)).not.toBe(sig(before));
    }
  });

  it("is rejected for unknown or busy Courts", () => {
    const busy = session({
      players: playersNamed(4),
      matches: [
        match({
          id: "m",
          teams: [
            ["p1", "p2"],
            ["p3", "p4"],
          ],
          startedAt: T0,
        }),
      ],
    });
    expect(rehashCourt(busy, "c1", makeCtx())).toEqual({ ok: false, reason: "court-busy" });
    expect(rehashCourt(busy, "nope", makeCtx())).toEqual({ ok: false, reason: "court-not-found" });
  });
});
