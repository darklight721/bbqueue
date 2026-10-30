import { describe, expect, it } from "vite-plus/test";
import { createSession, endMatch, removeMatch, startMatch } from "./operations.ts";
import { allPlayerStats, playerStats } from "./playerStats.ts";
import { buildHistory } from "./stats.ts";
import {
  MIN,
  T0,
  at,
  makeCtx,
  match,
  player,
  playersNamed,
  session,
  unwrap,
} from "./test-utils.ts";

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

describe("met", () => {
  const ended = match({
    id: "e",
    teams: [
      ["p1", "p2"],
      ["p3", "p4"],
    ],
    startedAt: T0 - 60 * MIN,
    endedAt: T0 - 50 * MIN,
  });
  const active = match({
    id: "a",
    teams: [
      ["p1", "p5"],
      ["p2", "p6"],
    ],
    startedAt: T0 - 5 * MIN,
  });

  it("counts Partners and Opponents once per Ended Match", () => {
    const history = buildHistory(session({ players: playersNamed(6), matches: [ended] }), T0);
    for (const [a, b] of [
      ["p1", "p2"],
      ["p3", "p4"],
      ["p1", "p3"],
      ["p2", "p4"],
      ["p1", "p4"],
      ["p2", "p3"],
    ] as const) {
      expect(history.met(a, b)).toBe(1);
      expect(history.met(b, a)).toBe(1);
    }
    expect(history.met("p1", "p5")).toBe(0);
  });

  it("adds up over several Matches", () => {
    const again = {
      ...ended,
      id: "e2",
      number: 2,
      startedAt: T0 - 40 * MIN,
      endedAt: T0 - 30 * MIN,
    };
    const history = buildHistory(
      session({ players: playersNamed(6), matches: [ended, again] }),
      T0,
    );
    expect(history.met("p1", "p4")).toBe(2);
    expect(history.met("p5", "p6")).toBe(0);
  });

  it("ignores Active Matches", () => {
    const history = buildHistory(
      session({ players: playersNamed(6), matches: [ended, active] }),
      T0,
    );
    expect(history.met("p1", "p5")).toBe(0);
    expect(history.met("p5", "p6")).toBe(0);
    expect(history.met("p1", "p2")).toBe(1);
  });

  it("ignores a Removed Match", () => {
    const ctx = makeCtx(1);
    let s = createSession(
      {
        name: "S",
        clubId: null,
        clubName: null,
        pointSystem: 21,
        plannedHours: 2,
        courts: 1,
        players: ["A", "B", "C", "D"].map((name) => ({ name, skill: "intermediate" as const })),
      },
      ctx,
    );
    s = unwrap(startMatch(s, s.courts[0]!.id, at(ctx, T0)));
    s = unwrap(endMatch(s, s.matches[0]!.id, null, at(ctx, T0 + 10 * MIN)));
    const [a, b] = [s.players[0]!.id, s.players[1]!.id];
    expect(buildHistory(s, T0 + 11 * MIN).met(a, b)).toBe(1);
    s = unwrap(removeMatch(s, s.matches[0]!.id, at(ctx, T0 + 12 * MIN)));
    expect(buildHistory(s, T0 + 13 * MIN).met(a, b)).toBe(0);
  });
});

describe("rests (Rests in a row)", () => {
  const m = (id: string, at: number, teams: [[string, string], [string, string]], free: string[]) =>
    match({ id, teams, startedAt: T0 - at * MIN, endedAt: T0 - (at - 5) * MIN, freeAtStart: free });
  const rests = (s: ReturnType<typeof session>, id: string) =>
    buildHistory(s, T0).byPlayer.get(id)!.rests;
  const others: [[string, string], [string, string]] = [
    ["p1", "p2"],
    ["p3", "p4"],
  ];

  it("goes up each time the player is free and does not play", () => {
    const s = session({
      players: playersNamed(6),
      matches: [
        m("a", 40, others, ["p5", "p6"]),
        m("b", 30, others, ["p5", "p6"]),
        m("c", 20, others, ["p5"]),
      ],
    });
    expect(rests(s, "p5")).toBe(3);
    expect(rests(s, "p6")).toBe(2);
  });

  it("does not move while the player is not free (on another Court)", () => {
    const s = session({
      players: playersNamed(6),
      matches: [m("a", 40, others, ["p5"]), m("b", 30, others, []), m("c", 20, others, ["p5"])],
    });
    expect(rests(s, "p5")).toBe(2);
  });

  it("resets when the player plays", () => {
    const s = session({
      players: playersNamed(6),
      matches: [
        m("a", 40, others, ["p5"]),
        m(
          "b",
          30,
          [
            ["p5", "p1"],
            ["p3", "p4"],
          ],
          ["p2"],
        ),
        m("c", 20, others, ["p5"]),
      ],
    });
    expect(rests(s, "p5")).toBe(1);
  });

  it("restarts after a Sitting-out reset", () => {
    const s = session({
      players: playersNamed(6),
      matches: [m("a", 40, others, ["p5"]), m("b", 30, others, ["p5"]), m("c", 20, others, ["p5"])],
      streakResetAt: { p5: T0 - 35 * MIN },
    });
    expect(rests(s, "p5")).toBe(2);
  });

  it("is 0 for a player who has never been free for a start", () => {
    const s = session({ players: playersNamed(6), matches: [] });
    expect(rests(s, "p1")).toBe(0);
  });
});
