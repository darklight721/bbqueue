import { describe, expect, it } from "vite-plus/test";
import { allPlayerStats, playerStats } from "./playerStats.ts";
import { MIN, T0, match, player, playersNamed, session } from "./test-utils.ts";

describe("playerStats", () => {
  const m1 = match({
    id: "m1",
    teams: [
      ["p1", "p2"],
      ["p3", "p4"],
    ],
    startedAt: T0 - 60 * MIN,
    endedAt: T0 - 50 * MIN,
    freeAtStart: ["p5"],
  });
  const m2 = match({
    id: "m2",
    teams: [
      ["p1", "p5"],
      ["p3", "p4"],
    ],
    startedAt: T0 - 25 * MIN,
    endedAt: T0 - 20 * MIN,
    freeAtStart: ["p2"],
  });
  const m3 = match({
    id: "m3",
    teams: [
      ["p1", "p2"],
      ["p5", "p6"],
    ],
    startedAt: T0 - 10 * MIN,
    freeAtStart: [],
  });

  it("derives streak, recent, total, played and wait", () => {
    const s = session({ players: playersNamed(6), courts: 2, matches: [m1, m2, m3] });
    const stats = allPlayerStats(s, T0);
    expect(stats.get("p1")).toMatchObject({ streak: 3, total: 3, matchesPlayed: 2, recent: 1 });
    expect(stats.get("p2")).toMatchObject({ streak: 1, total: 2, matchesPlayed: 1 }); // rested m2
    expect(stats.get("p5")).toMatchObject({ streak: 2, total: 2, matchesPlayed: 1 });
    expect(stats.get("p3")).toMatchObject({ streak: 2, total: 2 }); // not free at m3: unchanged
    expect(stats.get("p1")!.wait).toBe(20 * MIN);
    expect(stats.get("p6")!.wait).toBe(0);
  });

  it("uses the 30-minute window for 31-point Sessions", () => {
    const base = { players: playersNamed(6), matches: [m1, m2, m3] };
    expect(allPlayerStats(session({ ...base, pointSystem: 21 }), T0).get("p1")!.recent).toBe(1);
    expect(allPlayerStats(session({ ...base, pointSystem: 31 }), T0).get("p1")!.recent).toBe(2);
  });

  it("counts only Matches started after a Sitting-out reset", () => {
    const s = session({
      players: playersNamed(6),
      matches: [m1, m2, m3],
      streakResetAt: { p1: T0 - 22 * MIN },
    });
    expect(playerStats(s, "p1", T0)!.streak).toBe(1);
  });

  it("reports status and Court numbers", () => {
    const players = [
      ...playersNamed(5),
      { ...player("sit"), sittingOut: true },
      { ...player("gone"), removed: true },
    ];
    const s = session({
      players,
      courts: 2,
      matches: [
        match({
          id: "live",
          court: 2,
          teams: [
            ["p1", "p2"],
            ["p3", "p4"],
          ],
          startedAt: T0,
        }),
      ],
    });
    const withLineup = {
      ...s,
      courts: s.courts.map((c) =>
        c.number === 1
          ? {
              ...c,
              lineup: {
                teams: [
                  ["p5", "x1"],
                  ["x2", "x3"],
                ] as [[string, string], [string, string]],
              },
            }
          : c,
      ),
    };
    const stats = allPlayerStats(withLineup, T0);
    expect(stats.get("p1")).toMatchObject({ status: "on-court", courtNumber: 2 });
    expect(stats.get("p5")).toMatchObject({ status: "in-lineup", courtNumber: 1 });
    expect(stats.get("sit")).toMatchObject({ status: "sitting-out", courtNumber: null });
    expect(stats.get("gone")!.status).toBe("removed");
    expect(playerStats(withLineup, "missing", T0)).toBeNull();
  });
});
