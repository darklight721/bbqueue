import { describe, expect, it } from "vite-plus/test";
import type { Session } from "../types.ts";
import {
  addCourt,
  addPlayer,
  createSession,
  endMatch,
  endSession,
  fill,
  moveQueueToCourt,
  rehashAll,
  rehashCourt,
  removeCourt,
  removeMatch,
  removePlayer,
  setSittingOut,
  startMatch,
  type CreateSessionInput,
} from "./operations.ts";
import { addQueue, removeQueue, setQueueSlot } from "./queues.ts";
import { allPlayerStats } from "./playerStats.ts";
import { lineupPlayerIds } from "./select.ts";
import {
  MIN,
  T0,
  at,
  deepFreeze,
  lineupSet,
  makeCtx,
  playersNamed,
  session,
  unwrap,
  violations,
} from "./test-utils.ts";

function input(count: number, courts = 1): CreateSessionInput {
  return {
    name: "Tuesday",
    clubId: "club-1",
    pointSystem: 21,
    plannedHours: 2,
    courts,
    players: Array.from({ length: count }, (_, i) => ({
      name: `Player ${i + 1}`,
      skill: i % 2 === 0 ? "advanced" : "beginner",
      clubPlayerId: `cp-${i + 1}`,
    })),
  };
}

function created(count: number, courts = 1, seed = 1) {
  const ctx = makeCtx(seed);
  return { ctx, session: createSession(input(count, courts), ctx) };
}

describe("createSession", () => {
  it("snapshots players and creates numbered Courts with Lineups", () => {
    const { session: s } = created(8, 2);
    expect(s.players).toHaveLength(8);
    expect(s.players[0]).toMatchObject({
      name: "Player 1",
      clubPlayerId: "cp-1",
      sittingOut: false,
      removed: false,
      joinedAt: T0,
    });
    expect(s.courts.map((c) => c.number)).toEqual([1, 2]);
    expect(s.courts.every((c) => c.lineup !== null && c.activeMatchId === null)).toBe(true);
    expect(s).toMatchObject({ name: "Tuesday", clubId: "club-1", pointSystem: 21, startedAt: T0 });
    expect(violations(s)).toEqual([]);
  });

  it("leaves extra Courts waiting when players are short", () => {
    const { session: s } = created(5, 2);
    expect(s.courts[0]!.lineup).not.toBeNull();
    expect(s.courts[1]!.lineup).toBeNull();
  });
});

describe("startMatch", () => {
  it("starts an Active match from the Lineup and leaves other Lineups alone", () => {
    const { ctx, session: s } = created(8, 2);
    const other = s.courts[1]!.lineup;
    const next = unwrap(startMatch(s, s.courts[0]!.id, at(ctx, T0 + MIN)));
    const m = next.matches[0]!;
    expect(m).toMatchObject({
      status: "active",
      number: null,
      courtNumber: 1,
      startedAt: T0 + MIN,
      endedAt: null,
      score: null,
    });
    expect([...m.teams[0], ...m.teams[1]].sort()).toEqual(lineupSet(s, 1));
    expect(next.courts[0]).toMatchObject({ lineup: null, activeMatchId: m.id });
    expect(next.courts[1]!.lineup).toEqual(other);
    // The other Lineup's players were Free when this started.
    expect(m.freeAtStart.sort()).toEqual(lineupSet(s, 2));
    expect(violations(next)).toEqual([]);
  });

  it("is rejected without a Lineup, on a busy Court, or for unknown Courts", () => {
    const empty = session({ players: playersNamed(3) });
    expect(startMatch(empty, "c1", makeCtx())).toEqual({ ok: false, reason: "no-lineup" });
    const { ctx, session: s } = created(8, 1);
    const busy = unwrap(startMatch(s, s.courts[0]!.id, ctx));
    expect(startMatch(busy, busy.courts[0]!.id, ctx)).toEqual({ ok: false, reason: "court-busy" });
    expect(startMatch(s, "nope", ctx)).toEqual({ ok: false, reason: "court-not-found" });
  });
});

describe("endMatch", () => {
  it("records the score, numbers the match and refills the Court immediately", () => {
    const { ctx, session: s } = created(8, 1);
    const playing = unwrap(startMatch(s, s.courts[0]!.id, at(ctx, T0)));
    const id = playing.matches[0]!.id;
    const next = unwrap(endMatch(playing, id, [21, 15], at(ctx, T0 + 10 * MIN)));
    expect(next.matches[0]).toMatchObject({
      status: "ended",
      number: 1,
      endedAt: T0 + 10 * MIN,
      score: [21, 15],
    });
    expect(next.courts[0]!.activeMatchId).toBeNull();
    expect(next.courts[0]!.lineup).not.toBeNull();
    expect(violations(next)).toEqual([]);
  });

  it("numbers Ended matches in order and allows ending without a score", () => {
    const { ctx, session: s } = created(8, 2);
    let current = unwrap(startMatch(s, s.courts[0]!.id, at(ctx, T0)));
    current = unwrap(startMatch(current, current.courts[1]!.id, at(ctx, T0)));
    const [first, second] = current.matches;
    current = unwrap(endMatch(current, second!.id, null, at(ctx, T0 + 5 * MIN)));
    current = unwrap(endMatch(current, first!.id, [21, 3], at(ctx, T0 + 6 * MIN)));
    expect(current.matches.find((m) => m.id === second!.id)).toMatchObject({
      number: 1,
      score: null,
    });
    expect(current.matches.find((m) => m.id === first!.id)).toMatchObject({ number: 2 });
  });

  it("rejects unknown, already ended and invalidly scored matches", () => {
    const { ctx, session: s } = created(8, 1);
    const playing = unwrap(startMatch(s, s.courts[0]!.id, ctx));
    const id = playing.matches[0]!.id;
    expect(endMatch(playing, "nope", null, ctx)).toEqual({ ok: false, reason: "match-not-found" });
    expect(endMatch(playing, id, [20, 10], ctx)).toEqual({ ok: false, reason: "invalid-score" });
    const ended = unwrap(endMatch(playing, id, null, ctx));
    expect(endMatch(ended, id, null, ctx)).toEqual({ ok: false, reason: "match-not-active" });
  });
});

describe("removeMatch", () => {
  it("deletes the match without a trace and refills the Court", () => {
    const { ctx, session: s } = created(8, 1);
    const playing = unwrap(startMatch(s, s.courts[0]!.id, ctx));
    const next = unwrap(removeMatch(playing, playing.matches[0]!.id, ctx));
    expect(next.matches).toEqual([]);
    expect(next.courts[0]!.activeMatchId).toBeNull();
    expect(next.courts[0]!.lineup).not.toBeNull();
    for (const stats of allPlayerStats(next, T0).values()) {
      expect(stats).toMatchObject({ total: 0, recent: 0, matchesPlayed: 0, streak: 0 });
    }
    expect(removeMatch(next, "nope", ctx)).toEqual({ ok: false, reason: "match-not-found" });
  });

  it("renumbers the remaining Ended matches", () => {
    const { ctx, session: s } = created(8, 1);
    let current = s;
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      current = unwrap(startMatch(current, current.courts[0]!.id, at(ctx, T0 + i * 20 * MIN)));
      const id = current.matches.at(-1)!.id;
      ids.push(id);
      current = unwrap(endMatch(current, id, null, at(ctx, T0 + i * 20 * MIN + 10 * MIN)));
    }
    current = unwrap(removeMatch(current, ids[0]!, ctx));
    expect(current.matches.map((m) => m.number)).toEqual([1, 2]);
  });
});

describe("courts", () => {
  it("adds the lowest unused number, up to 10, and fills the new Court", () => {
    const { ctx, session: s } = created(8, 2);
    const without1 = unwrap(removeCourt(s, s.courts[0]!.id, ctx));
    const added = unwrap(addCourt(without1, ctx));
    expect(added.courts.map((c) => c.number)).toEqual([1, 2]);
    expect(added.courts[0]!.lineup).not.toBeNull();

    let many = s;
    for (let i = 0; i < 8; i++) many = unwrap(addCourt(many, ctx));
    expect(many.courts).toHaveLength(10);
    expect(addCourt(many, ctx)).toEqual({ ok: false, reason: "max-courts" });
  });

  it("rejects removing a Busy Court and releases Lineup players otherwise", () => {
    const { ctx, session: s } = created(9, 2);
    const playing = unwrap(startMatch(s, s.courts[0]!.id, ctx));
    expect(removeCourt(playing, playing.courts[0]!.id, ctx)).toEqual({
      ok: false,
      reason: "court-busy",
    });
    expect(removeCourt(playing, "nope", ctx)).toEqual({ ok: false, reason: "court-not-found" });
    const removed = unwrap(removeCourt(playing, playing.courts[1]!.id, ctx));
    expect(removed.courts).toHaveLength(1);
    expect(violations(removed)).toEqual([]);
  });
});

describe("players", () => {
  it("adds a player (unique name) and fills a waiting Court", () => {
    const { ctx, session: s } = created(3, 1);
    expect(s.courts[0]!.lineup).toBeNull();
    const next = unwrap(
      addPlayer(s, { name: "  New   Guy ", skill: "beginner" }, at(ctx, T0 + MIN)),
    );
    const added = next.players.at(-1)!;
    expect(added).toMatchObject({
      name: "New Guy",
      clubPlayerId: null,
      joinedAt: T0 + MIN,
      removed: false,
    });
    expect(next.courts[0]!.lineup).not.toBeNull();
    expect(addPlayer(next, { name: "new guy", skill: "advanced" }, ctx)).toEqual({
      ok: false,
      reason: "duplicate-name",
    });
    expect(addPlayer(next, { name: "  ", skill: "advanced" }, ctx)).toEqual({
      ok: false,
      reason: "name-required",
    });
  });

  it("lets a removed player's name be reused", () => {
    const { ctx, session: s } = created(6, 1);
    const id = s.players.find((p) => p.name === "Player 1")!.id;
    const removed = unwrap(removePlayer(s, id, ctx));
    expect(addPlayer(removed, { name: "Player 1", skill: "advanced" }, ctx).ok).toBe(true);
  });

  it("rejects removing a player in an Active match", () => {
    const { ctx, session: s } = created(8, 1);
    const playing = unwrap(startMatch(s, s.courts[0]!.id, ctx));
    const onCourt = playing.matches[0]!.teams[0][0];
    expect(removePlayer(playing, onCourt, ctx)).toEqual({
      ok: false,
      reason: "player-in-active-match",
    });
    expect(removePlayer(playing, "nope", ctx)).toEqual({ ok: false, reason: "player-not-found" });
  });

  it("replaces only the removed player in a Lineup and clears their Queue slots", () => {
    const { ctx, session: s } = created(9, 1);
    const lineup = lineupPlayerIds(s.courts[0]!.lineup);
    const leaving = lineup[0]!;
    let withQueue = addQueue(s, ctx);
    const queueId = withQueue.queues[0]!.id;
    withQueue = unwrap(setQueueSlot(withQueue, queueId, 0, 0, leaving));
    const next = unwrap(removePlayer(withQueue, leaving, ctx));
    const after = lineupPlayerIds(next.courts[0]!.lineup);
    expect(after).toHaveLength(4);
    expect(after).not.toContain(leaving);
    expect(after.filter((id) => lineup.includes(id)).sort()).toEqual(lineup.slice(1).sort());
    expect(next.players.find((p) => p.id === leaving)!.removed).toBe(true);
    expect(next.queues[0]!.slots[0][0]).toBeNull();
    expect(violations(next)).toEqual([]);
  });

  it("empties a Lineup when nobody can replace the removed player", () => {
    const { ctx, session: s } = created(4, 1);
    const next = unwrap(removePlayer(s, s.players[0]!.id, ctx));
    expect(next.courts[0]!.lineup).toBeNull();
  });
});

describe("sitting out", () => {
  it("replaces only that player in the Lineup, resets the Streak and fills when back", () => {
    const { ctx, session: s } = created(9, 1);
    const lineup = lineupPlayerIds(s.courts[0]!.lineup);
    const out = lineup[0]!;
    const next = unwrap(setSittingOut(s, out, true, at(ctx, T0 + MIN)));
    const after = lineupPlayerIds(next.courts[0]!.lineup);
    expect(after).not.toContain(out);
    expect(after.filter((id) => lineup.includes(id)).sort()).toEqual(lineup.slice(1).sort());
    expect(next.streakResetAt[out]).toBe(T0 + MIN);
    expect(allPlayerStats(next, T0 + MIN).get(out)!.status).toBe("sitting-out");
    expect(violations(next)).toEqual([]);

    const back = unwrap(setSittingOut(next, out, false, ctx));
    expect(back.players.find((p) => p.id === out)!.sittingOut).toBe(false);
    expect(setSittingOut(back, "nope", true, ctx)).toEqual({
      ok: false,
      reason: "player-not-found",
    });
  });

  it("fills a waiting Court when a player comes back", () => {
    const { ctx, session: s } = created(4, 1);
    const out = s.players[0]!.id;
    const sitting = unwrap(setSittingOut(s, out, true, ctx));
    expect(sitting.courts[0]!.lineup).toBeNull();
    expect(unwrap(setSittingOut(sitting, out, false, ctx)).courts[0]!.lineup).not.toBeNull();
  });

  it("resets the Streak", () => {
    const { ctx, session: s } = created(5, 1);
    let current = s;
    for (let i = 0; i < 2; i++) {
      current = unwrap(startMatch(current, current.courts[0]!.id, at(ctx, T0 + i * 20 * MIN)));
      current = unwrap(
        endMatch(current, current.matches.at(-1)!.id, null, at(ctx, T0 + i * 20 * MIN + 10 * MIN)),
      );
    }
    const streaky = current.players.find(
      (p) => allPlayerStats(current, T0 + 50 * MIN).get(p.id)!.streak === 2,
    )!;
    const after = unwrap(setSittingOut(current, streaky.id, true, at(ctx, T0 + 50 * MIN)));
    expect(allPlayerStats(after, T0 + 50 * MIN).get(streaky.id)!.streak).toBe(0);
  });
});

describe("rehash all", () => {
  it("is rejected with fewer than 2 Idle Courts", () => {
    const { ctx, session: s } = created(12, 2);
    expect(rehashAll(session({ players: playersNamed(8), courts: 1 }), ctx)).toEqual({
      ok: false,
      reason: "not-enough-idle-courts",
    });
    const oneBusy = unwrap(startMatch(s, s.courts[0]!.id, ctx));
    expect(rehashAll(oneBusy, ctx)).toEqual({ ok: false, reason: "not-enough-idle-courts" });
  });

  it("produces disjoint Lineups for every Idle Court", () => {
    const { ctx, session: s } = created(12, 3);
    const next = unwrap(rehashAll(s, ctx));
    expect(next.courts.every((c) => c.lineup !== null)).toBe(true);
    expect(violations(next)).toEqual([]);
  });

  it("differs from the previous arrangement when possible", () => {
    const sig = (s: Session) =>
      s.courts
        .map((c) =>
          c
            .lineup!.teams.map((t) => [...t].sort().join())
            .sort()
            .join("/"),
        )
        .join(";");
    for (let seed = 1; seed <= 30; seed++) {
      const { ctx, session: s } = created(8, 2, seed);
      expect(sig(unwrap(rehashAll(s, ctx)))).not.toBe(sig(s));
    }
  });

  it("only touches Idle Courts and leaves Busy ones playing", () => {
    const { ctx, session: s } = created(14, 3);
    const playing = unwrap(startMatch(s, s.courts[0]!.id, ctx));
    const next = unwrap(rehashAll(playing, ctx));
    expect(next.courts[0]).toEqual(playing.courts[0]);
    expect(violations(next)).toEqual([]);
  });
});

describe("queue operations", () => {
  it("adds, fills, rejects duplicates and removes Queues", () => {
    const { ctx, session: s } = created(8, 1);
    const withQueue = addQueue(s, ctx);
    expect(withQueue.queues).toHaveLength(1);
    const queueId = withQueue.queues[0]!.id;
    const [a, b] = [s.players[0]!.id, s.players[1]!.id];
    const filled = unwrap(setQueueSlot(withQueue, queueId, 0, 0, a));
    expect(filled.queues[0]!.slots[0][0]).toBe(a);
    expect(setQueueSlot(filled, queueId, 1, 1, a)).toEqual({
      ok: false,
      reason: "duplicate-in-queue",
    });
    expect(unwrap(setQueueSlot(filled, queueId, 0, 0, a)).queues[0]!.slots[0][0]).toBe(a);
    expect(unwrap(setQueueSlot(filled, queueId, 0, 0, b)).queues[0]!.slots[0][0]).toBe(b);
    expect(unwrap(setQueueSlot(filled, queueId, 0, 0, null)).queues[0]!.slots[0][0]).toBeNull();
    expect(setQueueSlot(filled, queueId, 0, 1, "nope")).toEqual({
      ok: false,
      reason: "player-not-found",
    });
    expect(setQueueSlot(filled, "nope", 0, 1, a)).toEqual({ ok: false, reason: "queue-not-found" });
    expect(unwrap(removeQueue(filled, queueId)).queues).toEqual([]);
    expect(removeQueue(filled, "nope")).toEqual({ ok: false, reason: "queue-not-found" });
  });

  it("allows the same player in several Queues", () => {
    const { ctx, session: s } = created(8, 1);
    let current = addQueue(addQueue(s, ctx), ctx);
    for (const queue of current.queues) {
      current = unwrap(setQueueSlot(current, queue.id, 0, 0, s.players[0]!.id));
    }
    expect(current.queues.map((q) => q.slots[0][0])).toEqual([s.players[0]!.id, s.players[0]!.id]);
  });
});

describe("moveQueueToCourt", () => {
  function twoCourts() {
    const ctx = makeCtx(5);
    const s = createSession(input(8, 2), ctx);
    return { ctx, s };
  }

  it("starts the Queue's Teams, deletes the Queue and replaces only conflicting players", () => {
    const { ctx, s } = twoCourts();
    const lineup1 = lineupSet(s, 1);
    const lineup2 = lineupSet(s, 2);
    // Two players from Court 2's Lineup + two from Court 1's Lineup.
    const queued = [lineup2[0]!, lineup1[0]!, lineup2[1]!, lineup1[1]!];
    let current = addQueue(s, ctx);
    const queueId = current.queues[0]!.id;
    const slots: [0 | 1, 0 | 1][] = [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ];
    queued.forEach((id, i) => {
      current = unwrap(setQueueSlot(current, queueId, ...slots[i]!, id));
    });
    const next = unwrap(
      moveQueueToCourt(current, queueId, current.courts[0]!.id, at(ctx, T0 + MIN)),
    );

    expect(next.queues).toEqual([]);
    const m = next.matches[0]!;
    expect(m.teams).toEqual([
      [queued[0], queued[1]],
      [queued[2], queued[3]],
    ]);
    expect(m.courtNumber).toBe(1);
    expect(next.courts[0]).toMatchObject({ lineup: null, activeMatchId: m.id });
    // Court 2 keeps its non-queued players and replaces only the two conflicting ones.
    const after2 = lineupSet(next, 2);
    expect(after2).toHaveLength(4);
    const kept = lineup2.filter((id) => !queued.includes(id));
    expect(kept).toHaveLength(2);
    for (const id of kept) expect(after2).toContain(id);
    for (const id of queued) expect(after2).not.toContain(id);
    expect(violations(next)).toEqual([]);
  });

  it("brings Sitting-out queued players back in", () => {
    const { ctx, s } = twoCourts();
    const lineup1 = lineupSet(s, 1);
    const sitter = lineup1[0]!;
    let current = unwrap(setSittingOut(s, sitter, true, ctx));
    current = addQueue(current, ctx);
    const queueId = current.queues[0]!.id;
    const ids = [
      sitter,
      ...s.players
        .map((p) => p.id)
        .filter((id) => id !== sitter)
        .slice(0, 3),
    ];
    const slots: [0 | 1, 0 | 1][] = [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ];
    ids.forEach((id, i) => {
      current = unwrap(setQueueSlot(current, queueId, ...slots[i]!, id));
    });
    const next = unwrap(moveQueueToCourt(current, queueId, current.courts[0]!.id, ctx));
    expect(next.players.find((p) => p.id === sitter)).toMatchObject({ sittingOut: false });
    expect(next.matches[0]!.teams.flat()).toContain(sitter);
    expect(violations(next)).toEqual([]);
  });

  it("is rejected for busy Courts, incomplete Queues and players on court", () => {
    const { ctx, s } = twoCourts();
    const playing = unwrap(startMatch(s, s.courts[0]!.id, ctx));
    const onCourt = playing.matches[0]!.teams.flat();
    let current = addQueue(playing, ctx);
    const queueId = current.queues[0]!.id;
    expect(moveQueueToCourt(current, queueId, current.courts[1]!.id, ctx)).toEqual({
      ok: false,
      reason: "queue-incomplete",
    });
    const free = lineupSet(playing, 2);
    const ids = [onCourt[0]!, free[0]!, free[1]!, free[2]!];
    const slots: [0 | 1, 0 | 1][] = [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ];
    ids.forEach((id, i) => {
      current = unwrap(setQueueSlot(current, queueId, ...slots[i]!, id));
    });
    expect(moveQueueToCourt(current, queueId, current.courts[1]!.id, ctx)).toEqual({
      ok: false,
      reason: "player-on-court",
    });
    expect(moveQueueToCourt(current, queueId, current.courts[0]!.id, ctx)).toEqual({
      ok: false,
      reason: "court-busy",
    });
    expect(moveQueueToCourt(current, "nope", current.courts[1]!.id, ctx)).toEqual({
      ok: false,
      reason: "queue-not-found",
    });
    expect(moveQueueToCourt(current, queueId, "nope", ctx)).toEqual({
      ok: false,
      reason: "court-not-found",
    });
  });
});

describe("endSession", () => {
  it("ends Active matches without a score and summarises", () => {
    const { ctx, session: s } = created(8, 2);
    let current = unwrap(startMatch(s, s.courts[0]!.id, at(ctx, T0)));
    current = unwrap(startMatch(current, current.courts[1]!.id, at(ctx, T0)));
    current = unwrap(endMatch(current, current.matches[0]!.id, [21, 5], at(ctx, T0 + 10 * MIN)));
    const { session: ended, summary } = endSession(current, at(ctx, T0 + 30 * MIN));
    expect(ended.matches.every((m) => m.status === "ended")).toBe(true);
    expect(ended.matches[1]).toMatchObject({ score: null, endedAt: T0 + 30 * MIN });
    expect(summary).toMatchObject({
      sessionName: "Tuesday",
      totalMatches: 2,
      totalPlayers: 8,
      startedAt: T0,
      endedAt: T0 + 30 * MIN,
    });
    expect(summary.topWinners).toHaveLength(2);
  });
});

describe("purity", () => {
  it("never mutates its input", () => {
    const { ctx, session: s } = created(10, 2);
    const frozen = deepFreeze(structuredClone(s));
    const snapshot = JSON.stringify(frozen);
    const courtId = frozen.courts[0]!.id;
    const playerId = frozen.players[0]!.id;
    const withQueue = deepFreeze(addQueue(frozen, ctx));
    const queueId = withQueue.queues[0]!.id;
    const playing = deepFreeze(unwrap(startMatch(frozen, courtId, ctx)));
    const matchId = playing.matches[0]!.id;
    const calls: (() => unknown)[] = [
      () => fill(frozen, ctx),
      () => rehashCourt(frozen, courtId, ctx),
      () => rehashAll(frozen, ctx),
      () => startMatch(frozen, courtId, ctx),
      () => endMatch(playing, matchId, [21, 1], ctx),
      () => removeMatch(playing, matchId, ctx),
      () => addCourt(frozen, ctx),
      () => removeCourt(frozen, frozen.courts[1]!.id, ctx),
      () => addPlayer(frozen, { name: "Zed", skill: "beginner" }, ctx),
      () => removePlayer(frozen, playerId, ctx),
      () => setSittingOut(frozen, playerId, true, ctx),
      () => setQueueSlot(withQueue, queueId, 0, 0, playerId),
      () => removeQueue(withQueue, queueId),
      () => endSession(playing, ctx),
    ];
    for (const call of calls) expect(call).not.toThrow();
    expect(JSON.stringify(frozen)).toBe(snapshot);
  });

  it("is deterministic for the same input and seed", () => {
    const script = (seed: number) => {
      const ctx = makeCtx(seed);
      let s = createSession(input(14, 3), ctx);
      s = unwrap(rehashAll(s, ctx));
      s = unwrap(startMatch(s, s.courts[0]!.id, at(ctx, T0 + MIN)));
      s = unwrap(endMatch(s, s.matches[0]!.id, [21, 9], at(ctx, T0 + 11 * MIN)));
      s = unwrap(rehashCourt(s, s.courts[1]!.id, ctx));
      return JSON.stringify(s);
    };
    expect(script(42)).toBe(script(42));
    expect(script(42)).not.toBe(script(43));
  });
});
