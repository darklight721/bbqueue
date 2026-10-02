import { describe, expect, it } from "vite-plus/test";
import type { Session, SessionPlayer } from "../types.ts";
import {
  addPlayer,
  createSession,
  endMatch,
  fill,
  moveQueueToCourt,
  rehashAll,
  removeMatch,
  removePlayer,
  setSittingOut,
  startMatch,
  validateCreateSessionInput,
  type CreateSessionInput,
} from "./operations.ts";
import { allPlayerStats } from "./playerStats.ts";
import { addQueue, canMoveQueue, setQueueSlot } from "./queues.ts";
import { randomInt, createRng } from "./rng.ts";
import { lineupPlayerIds, teamKey } from "./select.ts";
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

const seedList = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

function fillQueue(s: Session, ids: string[], ctx = makeCtx()): { s: Session; queueId: string } {
  let current = addQueue(s, ctx);
  const queueId = current.queues.at(-1)!.id;
  const slots: [0 | 1, 0 | 1][] = [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
  ];
  ids.forEach((id, i) => {
    current = unwrap(setQueueSlot(current, queueId, ...slots[i]!, id));
  });
  return { s: current, queueId };
}

// ------------------------------------------------------------------- Rest

describe("rest with staggered match ends", () => {
  /** Event-driven evening: each Court starts immediately and plays 10–20 minutes. */
  function maxStreak(playerCount: number, courts: number, seed: number): number {
    const rng = createRng(seed * 31);
    const ctx = makeCtx(seed);
    let s = createSession(
      {
        name: "Stagger",
        clubId: null,
        pointSystem: 21,
        plannedHours: 3,
        courts,
        players: Array.from({ length: playerCount }, (_, i) => ({
          name: `P${i}`,
          skill: (["beginner", "intermediate", "advanced"] as const)[i % 3]!,
        })),
      },
      ctx,
    );
    const endsAt = new Map<string, number>();
    let max = 0;
    for (let minute = 0; minute <= 180; minute++) {
      const now = T0 + minute * MIN;
      for (const m of s.matches.filter((x) => x.status === "active")) {
        if ((endsAt.get(m.id) ?? 0) <= now) s = unwrap(endMatch(s, m.id, null, at(ctx, now)));
      }
      for (const court of s.courts) {
        if (court.activeMatchId !== null || !court.lineup) continue;
        s = unwrap(startMatch(s, court.id, at(ctx, now)));
        endsAt.set(s.matches.at(-1)!.id, now + (10 + randomInt(rng, 11)) * MIN);
      }
      for (const stats of allPlayerStats(s, now).values()) max = Math.max(max, stats.streak);
      expect(violations(s)).toEqual([]);
    }
    return max;
  }

  const observed: Record<string, number> = {};
  const run = (label: string, players: number, courts: number) => {
    const worst = Math.max(...seedList(30).map((seed) => maxStreak(players, courts, seed)));
    observed[label] = worst;
    return worst;
  };

  it("keeps Streaks small for 13 players on 3 courts", () => {
    expect(run("13/3", 13, 3)).toBeLessThanOrEqual(5);
  });

  it("keeps Streaks small for 9 players on 2 courts", () => {
    expect(run("9/2", 9, 2)).toBeLessThanOrEqual(5);
  });

  it("keeps Streaks very small for 14 players on 3 courts", () => {
    expect(run("14/3", 14, 3)).toBeLessThanOrEqual(3);
  });

  it("reports the observed maxima", () => {
    console.info("max streaks", observed);
    expect(Object.keys(observed).length).toBeGreaterThan(0);
  });
});

describe("graded rest", () => {
  it("rests the longest Streak first when several players are over the limit", () => {
    // p1–p4 have a Streak of 3, p5–p8 a Streak of 2; p9–p12 rested. Only 8 can play on two courts.
    const players = playersNamed(12);
    const s = session({
      players,
      courts: 2,
      matches: [
        match({
          id: "a",
          teams: [
            ["p1", "p2"],
            ["p3", "p4"],
          ],
          startedAt: T0 - 90 * MIN,
          endedAt: T0 - 80 * MIN,
          freeAtStart: ["p5", "p6", "p7", "p8", "p9", "p10", "p11", "p12"],
        }),
        match({
          id: "b",
          teams: [
            ["p1", "p2"],
            ["p3", "p4"],
          ],
          startedAt: T0 - 70 * MIN,
          endedAt: T0 - 60 * MIN,
          freeAtStart: ["p5", "p6", "p7", "p8", "p9", "p10", "p11", "p12"],
        }),
        match({
          id: "c",
          teams: [
            ["p1", "p2"],
            ["p3", "p4"],
          ],
          startedAt: T0 - 50 * MIN,
          endedAt: T0 - 40 * MIN,
          freeAtStart: ["p5", "p6", "p7", "p8", "p9", "p10", "p11", "p12"],
        }),
        match({
          id: "d",
          teams: [
            ["p5", "p6"],
            ["p7", "p8"],
          ],
          startedAt: T0 - 35 * MIN,
          endedAt: T0 - 30 * MIN,
          freeAtStart: ["p9", "p10", "p11", "p12"],
        }),
        match({
          id: "e",
          teams: [
            ["p5", "p6"],
            ["p7", "p8"],
          ],
          startedAt: T0 - 28 * MIN,
          endedAt: T0 - 22 * MIN,
          freeAtStart: ["p9", "p10", "p11", "p12"],
        }),
      ],
    });
    // Streaks: p1–p4: 3; p5–p8: 2; p9–p12: 0 (never played).
    const withHistory = { ...s, courts: s.courts };
    for (const seed of seedList(30)) {
      const picked = [
        ...lineupSet(fill(withHistory, makeCtx(seed)), 1),
        ...lineupSet(fill(withHistory, makeCtx(seed)), 2),
      ];
      expect(picked.filter((id) => ["p1", "p2", "p3", "p4"].includes(id))).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------- rehashAll

describe("rehash all keeps the strict selection", () => {
  // p9–p12 have never played; p1–p8 each played one recent match.
  const history = () =>
    session({
      players: playersNamed(12),
      courts: 2,
      matches: [
        match({
          id: "m1",
          teams: [
            ["p1", "p2"],
            ["p3", "p4"],
          ],
          startedAt: T0 - 8 * MIN,
          endedAt: T0 - 4 * MIN,
          freeAtStart: ["p9", "p10", "p11", "p12"],
        }),
        match({
          id: "m2",
          teams: [
            ["p5", "p6"],
            ["p7", "p8"],
          ],
          startedAt: T0 - 8 * MIN,
          endedAt: T0 - 4 * MIN,
          freeAtStart: ["p9", "p10", "p11", "p12"],
        }),
      ],
    });

  it("always puts every never-played player on a Court (200 seeds)", () => {
    for (const seed of seedList(200)) {
      const ctx = makeCtx(seed);
      const s = unwrap(rehashAll(fill(history(), ctx), ctx));
      const playing = [...lineupSet(s, 1), ...lineupSet(s, 2)];
      expect(playing).toHaveLength(8);
      for (const id of ["p9", "p10", "p11", "p12"]) expect(playing).toContain(id);
    }
  });

  it("never picks a player with a Streak ≥ 2 while rested players are available", () => {
    const streaky = ["p1", "p2", "p3", "p4"];
    const rested = ["p5", "p6", "p7", "p8", "p9", "p10", "p11", "p12"];
    const s = session({
      players: playersNamed(12),
      courts: 2,
      matches: [
        ...rested.slice(0, 4).map((_, i) =>
          match({
            id: `r${i}`,
            teams: [
              ["p5", "p6"],
              ["p7", "p8"],
            ],
            startedAt: T0 - (200 - i) * MIN,
            endedAt: T0 - (190 - i) * MIN,
            freeAtStart: streaky,
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
          freeAtStart: rested,
        }),
        match({
          id: "g2",
          teams: [
            ["p1", "p3"],
            ["p2", "p4"],
          ],
          startedAt: T0 - 40 * MIN,
          endedAt: T0 - 35 * MIN,
          freeAtStart: rested,
        }),
      ],
    });
    for (const seed of seedList(100)) {
      const ctx = makeCtx(seed);
      const next = unwrap(rehashAll(fill(s, ctx), ctx));
      const playing = [...lineupSet(next, 1), ...lineupSet(next, 2)];
      expect(playing.filter((id) => streaky.includes(id))).toEqual([]);
    }
  });

  it("changes the set of Teams, not just which Court they are on", () => {
    for (const [players, courts] of [
      [8, 2],
      [12, 3],
      [9, 2],
    ] as const) {
      for (const seed of seedList(30)) {
        const ctx = makeCtx(seed);
        const s = createSession(
          {
            name: "S",
            clubId: null,
            pointSystem: 21,
            plannedHours: 2,
            courts,
            players: Array.from({ length: players }, (_, i) => ({
              name: `P${i}`,
              skill: (["beginner", "intermediate", "advanced"] as const)[i % 3]!,
            })),
          },
          ctx,
        );
        const teams = (x: Session) =>
          x.courts
            .flatMap((c) => (c.lineup ? c.lineup.teams.map(teamKey) : []))
            .sort()
            .join("/");
        const next = unwrap(rehashAll(s, ctx));
        expect(teams(next)).not.toBe(teams(s));
        expect(violations(next)).toEqual([]);
      }
    }
  });
});

// ---------------------------------------------------------------- Wait

describe("wait is part of fairness", () => {
  const withJoined = (joined: number[], skills: SessionPlayer["skill"][] = []) =>
    joined.map((minutesAgo, i) =>
      player(`p${i + 1}`, skills[i] ?? "intermediate", T0 - minutesAgo * MIN),
    );

  it("picks the longest-waiting four among equally fair players", () => {
    const players = withJoined([1, 2, 3, 4, 50, 60, 70, 80]);
    for (const seed of seedList(30)) {
      expect(lineupSet(fill(session({ players }), makeCtx(seed)), 1)).toEqual([
        "p5",
        "p6",
        "p7",
        "p8",
      ]);
    }
  });

  it("outranks team balance", () => {
    // The four longest-waiting are 3 advanced + 1 beginner (unbalanceable) even though
    // another set would split evenly.
    const skills: SessionPlayer["skill"][] = [
      "beginner",
      "beginner",
      "beginner",
      "beginner",
      "advanced",
      "advanced",
      "advanced",
      "beginner",
    ];
    const players = withJoined([1, 2, 3, 4, 50, 60, 70, 80], skills);
    for (const seed of seedList(20)) {
      expect(lineupSet(fill(session({ players }), makeCtx(seed)), 1)).toEqual([
        "p5",
        "p6",
        "p7",
        "p8",
      ]);
    }
  });

  it("applies the 12-player cut deterministically for large pools", () => {
    const players = withJoined(Array.from({ length: 20 }, (_, i) => 10 + i * 5));
    // Longest waits are the highest indexes.
    for (const seed of seedList(20)) {
      expect(lineupSet(fill(session({ players }), makeCtx(seed)), 1)).toEqual([
        "p17",
        "p18",
        "p19",
        "p20",
      ]);
    }
  });

  it("is used when rehashing all Courts", () => {
    const players = withJoined([1, 2, 3, 4, 5, 6, 7, 8, 50, 60, 70, 80, 90, 100, 110, 120]);
    for (const seed of seedList(30)) {
      const ctx = makeCtx(seed);
      const s = unwrap(rehashAll(session({ players, courts: 2 }), ctx));
      const playing = [...lineupSet(s, 1), ...lineupSet(s, 2)].sort();
      expect(playing).toEqual(["p10", "p11", "p12", "p13", "p14", "p15", "p16", "p9"].sort());
    }
  });
});

// ------------------------------------------------------------- re-adding players

describe("re-adding a removed player", () => {
  it("restores the same player with history instead of creating a new one", () => {
    const ctx = makeCtx(3);
    let s = createSession(
      {
        name: "S",
        clubId: null,
        pointSystem: 21,
        plannedHours: 2,
        courts: 1,
        players: Array.from({ length: 8 }, (_, i) => ({
          name: `P${i + 1}`,
          skill: "intermediate" as const,
          clubPlayerId: `cp${i + 1}`,
        })),
      },
      ctx,
    );
    s = unwrap(startMatch(s, s.courts[0]!.id, at(ctx, T0)));
    s = unwrap(endMatch(s, s.matches[0]!.id, null, at(ctx, T0 + 10 * MIN)));
    const playedId = s.matches[0]!.teams[0][0];
    const original = s.players.find((p) => p.id === playedId)!;
    const removed = unwrap(removePlayer(s, playedId, at(ctx, T0 + 11 * MIN)));
    const back = unwrap(
      addPlayer(
        removed,
        { name: original.name.toLowerCase(), skill: "advanced" },
        at(ctx, T0 + 12 * MIN),
      ),
    );
    expect(back.players).toHaveLength(s.players.length);
    const restored = back.players.find((p) => p.id === playedId)!;
    expect(restored).toMatchObject({
      removed: false,
      sittingOut: false,
      skill: "advanced",
      clubPlayerId: original.clubPlayerId,
      joinedAt: original.joinedAt,
    });
    expect(allPlayerStats(back, T0 + 12 * MIN).get(playedId)!.matchesPlayed).toBe(1);
    expect(violations(back)).toEqual([]);

    const withNewLink = unwrap(
      addPlayer(removed, { name: original.name, skill: "beginner", clubPlayerId: "new" }, ctx),
    );
    expect(withNewLink.players.find((p) => p.id === playedId)!.clubPlayerId).toBe("new");
  });

  it("still rejects a name equal to a non-removed player", () => {
    const ctx = makeCtx();
    const s = fill(session({ players: playersNamed(5) }), ctx);
    expect(addPlayer(s, { name: " P1 ", skill: "beginner" }, ctx)).toEqual({
      ok: false,
      reason: "duplicate-name",
    });
  });
});

// ------------------------------------------------- sitting out while on court

describe("sitting out while on court", () => {
  function playing() {
    const ctx = makeCtx(2);
    let s = createSession(
      {
        name: "S",
        clubId: null,
        pointSystem: 21,
        plannedHours: 2,
        courts: 1,
        players: Array.from({ length: 9 }, (_, i) => ({
          name: `P${i + 1}`,
          skill: "intermediate" as const,
        })),
      },
      ctx,
    );
    s = unwrap(startMatch(s, s.courts[0]!.id, at(ctx, T0)));
    return { ctx, s, id: s.matches[0]!.teams[0][0] };
  }

  it("is allowed, takes effect after the match and keeps the status on-court", () => {
    const { ctx, s, id } = playing();
    const sat = unwrap(setSittingOut(s, id, true, at(ctx, T0 + 5 * MIN)));
    expect(sat.players.find((p) => p.id === id)!.sittingOut).toBe(true);
    expect(sat.streakResetAt[id]).toBeUndefined();
    expect(allPlayerStats(sat, T0 + 5 * MIN).get(id)).toMatchObject({
      status: "on-court",
      streak: 1,
    });
    expect(violations(sat)).toEqual([]);
  });

  it("resets the Streak when the match ends and never picks them afterwards", () => {
    const { ctx, s, id } = playing();
    const sat = unwrap(setSittingOut(s, id, true, at(ctx, T0 + 5 * MIN)));
    const ended = unwrap(endMatch(sat, sat.matches[0]!.id, null, at(ctx, T0 + 10 * MIN)));
    expect(ended.streakResetAt[id]).toBe(T0 + 10 * MIN);
    const stats = allPlayerStats(ended, T0 + 10 * MIN).get(id)!;
    expect(stats).toMatchObject({ streak: 0, status: "sitting-out", matchesPlayed: 1 });
    for (const seed of seedList(20)) {
      const refilled = fill(
        { ...ended, courts: ended.courts.map((c) => ({ ...c, lineup: null })) },
        makeCtx(seed),
      );
      expect(lineupPlayerIds(refilled.courts[0]!.lineup)).not.toContain(id);
    }
    expect(violations(ended)).toEqual([]);
  });

  it("resets the Streak when the match is removed instead", () => {
    const { ctx, s, id } = playing();
    const sat = unwrap(setSittingOut(s, id, true, ctx));
    const removed = unwrap(removeMatch(sat, sat.matches[0]!.id, at(ctx, T0 + 3 * MIN)));
    expect(removed.streakResetAt[id]).toBe(T0 + 3 * MIN);
    expect(violations(removed)).toEqual([]);
  });

  it("does nothing special if they come back before the match ends", () => {
    const { ctx, s, id } = playing();
    const back = unwrap(setSittingOut(unwrap(setSittingOut(s, id, true, ctx)), id, false, ctx));
    const ended = unwrap(endMatch(back, back.matches[0]!.id, null, at(ctx, T0 + 10 * MIN)));
    expect(ended.streakResetAt[id]).toBeUndefined();
  });
});

// ----------------------------------------------------------------- queues

describe("moveQueueToCourt when a Lineup has no replacement", () => {
  it("nulls the Lineup, releasing its other players for other Lineups", () => {
    const ctx = makeCtx(9);
    // 8 players on two Courts, all held; a third Court is empty.
    let s = createSession(
      {
        name: "S",
        clubId: null,
        pointSystem: 21,
        plannedHours: 2,
        courts: 3,
        players: Array.from({ length: 8 }, (_, i) => ({
          name: `P${i + 1}`,
          skill: "intermediate" as const,
        })),
      },
      ctx,
    );
    expect(s.courts[2]!.lineup).toBeNull();
    const a = lineupSet(s, 1);
    const b = lineupSet(s, 2);
    const q = fillQueue(s, [a[0]!, a[1]!, a[2]!, b[0]!], ctx);
    s = unwrap(moveQueueToCourt(q.s, q.queueId, q.s.courts[2]!.id, at(ctx, T0 + MIN)));
    // Court 1 lost three players and nobody was free to replace the first: it becomes null,
    // and its remaining player is then offered to Court 2, replacing b[0].
    expect(s.courts[0]!.lineup).toBeNull();
    const after2 = lineupSet(s, 2);
    expect(after2).toHaveLength(4);
    expect(after2).toContain(a[3]);
    expect(after2).not.toContain(b[0]);
    for (const id of b.slice(1)) expect(after2).toContain(id);
    expect(violations(s)).toEqual([]);
  });

  it("leaves a Lineup empty (and valid) when nobody is left to offer", () => {
    const ctx = makeCtx(4);
    let s = createSession(
      {
        name: "S",
        clubId: null,
        pointSystem: 21,
        plannedHours: 2,
        courts: 3,
        players: Array.from({ length: 7 }, (_, i) => ({
          name: `P${i + 1}`,
          skill: "intermediate" as const,
        })),
      },
      ctx,
    );
    const a = lineupSet(s, 1);
    const free = s.players.map((p) => p.id).filter((id) => !a.includes(id));
    expect(free).toHaveLength(3);
    const q = fillQueue(s, [...free, a[0]!], ctx);
    s = unwrap(moveQueueToCourt(q.s, q.queueId, q.s.courts[2]!.id, ctx));
    expect(s.courts[0]!.lineup).toBeNull();
    expect(s.courts[1]!.lineup).toBeNull();
    expect(violations(s)).toEqual([]);
  });
});

describe("canMoveQueue with missing players", () => {
  it("refuses when a slot references a missing or removed player", () => {
    const base = session({ players: [...playersNamed(4)], courts: 1 });
    const { s, queueId } = fillQueue(base, ["p1", "p2", "p3", "p4"]);
    const queue = s.queues.find((q) => q.id === queueId)!;
    expect(canMoveQueue(s, queue, s.courts[0]!)).toEqual({ ok: true });
    const removed = {
      ...s,
      players: s.players.map((p) => (p.id === "p2" ? { ...p, removed: true } : p)),
    };
    expect(canMoveQueue(removed, queue, removed.courts[0]!)).toEqual({
      ok: false,
      reason: "player-not-found",
    });
    const ghost = {
      ...queue,
      slots: [
        ["p1", "ghost"],
        ["p3", "p4"],
      ] as typeof queue.slots,
    };
    expect(canMoveQueue(s, ghost, s.courts[0]!)).toEqual({ ok: false, reason: "player-not-found" });
    expect(
      moveQueueToCourt({ ...removed, queues: [queue] }, queueId, removed.courts[0]!.id, makeCtx()),
    ).toEqual({ ok: false, reason: "player-not-found" });
  });
});

// ------------------------------------------------------------ input validation

describe("validateCreateSessionInput", () => {
  const valid = (): CreateSessionInput => ({
    name: "Tuesday",
    clubId: null,
    pointSystem: 21,
    plannedHours: 1,
    courts: 2,
    players: ["A", "B", "C", "D"].map((name) => ({ name, skill: "beginner" as const })),
  });

  it("accepts a valid input", () => {
    expect(validateCreateSessionInput(valid())).toEqual([]);
  });

  it("reports each problem", () => {
    expect(validateCreateSessionInput({ ...valid(), name: "  " })).toEqual(["name-required"]);
    expect(validateCreateSessionInput({ ...valid(), courts: 0 })).toEqual(["courts-out-of-range"]);
    expect(validateCreateSessionInput({ ...valid(), courts: 11 })).toEqual(["courts-out-of-range"]);
    expect(validateCreateSessionInput({ ...valid(), courts: 1.5 })).toEqual([
      "courts-out-of-range",
    ]);
    expect(validateCreateSessionInput({ ...valid(), plannedHours: 0.5 })).toEqual([
      "hours-out-of-range",
    ]);
    expect(validateCreateSessionInput({ ...valid(), plannedHours: 0.25 })).toEqual([
      "hours-out-of-range",
    ]);
    expect(validateCreateSessionInput({ ...valid(), plannedHours: 13 })).toEqual([
      "hours-out-of-range",
    ]);
    expect(
      validateCreateSessionInput({ ...valid(), players: valid().players.slice(0, 3) }),
    ).toEqual(["too-few-players"]);
    expect(
      validateCreateSessionInput({
        ...valid(),
        players: [...valid().players.slice(0, 3), { name: "  ", skill: "beginner" }],
      }),
    ).toEqual(["player-name-required"]);
    expect(
      validateCreateSessionInput({
        ...valid(),
        players: [...valid().players.slice(0, 3), { name: " a ", skill: "beginner" }],
      }),
    ).toEqual(["duplicate-name"]);
  });

  it("can report several at once", () => {
    expect(validateCreateSessionInput({ ...valid(), name: "", courts: 0, players: [] })).toEqual([
      "name-required",
      "courts-out-of-range",
      "too-few-players",
    ]);
  });
});

describe("partial replacements prefer the longest Wait", () => {
  it("picks the longer-waiting of two equally keyed Candidates, even against balance", () => {
    // Replacing x leaves a1, a2, b1: the beginner Candidate would balance the Teams, but the
    // advanced one has waited longer and Wait (Fairness) outranks the split rule.
    const players = [
      player("a1", "advanced"),
      player("a2", "advanced"),
      player("b1", "beginner"),
      player("x", "intermediate"),
      player("long", "advanced", T0 - 60 * MIN),
      player("short", "beginner", T0 - 5 * MIN),
    ];
    const base = session({ players });
    const withLineup: Session = {
      ...base,
      courts: [
        {
          ...base.courts[0]!,
          lineup: {
            teams: [
              ["a1", "a2"],
              ["b1", "x"],
            ],
          },
        },
      ],
    };
    for (const seed of seedList(20)) {
      const next = unwrap(removePlayer(withLineup, "x", makeCtx(seed)));
      expect(lineupSet(next, 1)).toEqual(["a1", "a2", "b1", "long"]);
    }
  });
});
