import { describe, expect, it } from "vite-plus/test";
import { addQueue, canMoveQueue, queueWarnings, setQueueSlot } from "./queues.ts";
import type { Queue, Session } from "../types.ts";
import { MIN, T0, makeCtx, match, player, session, unwrap } from "./test-utils.ts";

function withQueue(base: Session, ids: (string | null)[]): { s: Session; queue: Queue } {
  let s = addQueue(base, makeCtx());
  const queueId = s.queues[0]!.id;
  const slots: [0 | 1, 0 | 1][] = [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
  ];
  ids.forEach((id, i) => {
    s = unwrap(setQueueSlot(s, queueId, ...slots[i]!, id));
  });
  return { s, queue: s.queues[0]! };
}

const roster = [
  player("a1", "advanced"),
  player("a2", "advanced"),
  player("b1", "beginner"),
  player("b2", "beginner"),
  player("c1"),
  player("c2"),
];

describe("queueWarnings", () => {
  it("has none for a balanced, fresh Queue", () => {
    const { s, queue } = withQueue(session({ players: roster }), ["a1", "b1", "a2", "b2"]);
    expect(queueWarnings(s, queue, T0)).toEqual([]);
  });

  it("flags unbalanced Teams only when the Queue is complete", () => {
    const base = session({ players: roster });
    const { s, queue } = withQueue(base, ["a1", "a2", "b1", "b2"]);
    expect(queueWarnings(s, queue, T0)).toContainEqual({ kind: "unbalanced" });
    const partial = withQueue(base, ["a1", "a2", "b1", null]);
    expect(queueWarnings(partial.s, partial.queue, T0)).not.toContainEqual({ kind: "unbalanced" });
  });

  it("flags third in a row and repeat partners from history", () => {
    const history = [
      match({
        id: "m1",
        teams: [
          ["c1", "c2"],
          ["a1", "a2"],
        ],
        startedAt: T0 - 40 * MIN,
        endedAt: T0 - 30 * MIN,
      }),
      match({
        id: "m2",
        teams: [
          ["c1", "c2"],
          ["b1", "b2"],
        ],
        startedAt: T0 - 25 * MIN,
        endedAt: T0 - 15 * MIN,
      }),
    ];
    const { s, queue } = withQueue(session({ players: roster, matches: history }), [
      "c1",
      "c2",
      "a1",
      "b1",
    ]);
    const warnings = queueWarnings(s, queue, T0);
    expect(warnings).toContainEqual({ kind: "third-in-a-row", playerId: "c1" });
    expect(warnings).toContainEqual({ kind: "third-in-a-row", playerId: "c2" });
    expect(warnings).toContainEqual({ kind: "repeat-partners", team: 0 });
    expect(warnings).not.toContainEqual({ kind: "repeat-partners", team: 1 });
  });

  it("flags sitting-out players and players on court (with the Court number)", () => {
    const players = roster.map((p) => (p.id === "c1" ? { ...p, sittingOut: true } : p));
    const playing = [
      match({
        id: "m",
        court: 2,
        teams: [
          ["a1", "a2"],
          ["b1", "b2"],
        ],
        startedAt: T0,
      }),
    ];
    const { s, queue } = withQueue(session({ players, courts: 2, matches: playing }), [
      "c1",
      "a1",
      "c2",
      "b1",
    ]);
    const warnings = queueWarnings(s, queue, T0);
    expect(warnings).toContainEqual({ kind: "sitting-out", playerId: "c1" });
    expect(warnings).toContainEqual({ kind: "on-court", playerId: "a1", courtNumber: 2 });
    expect(warnings).toContainEqual({ kind: "on-court", playerId: "b1", courtNumber: 2 });
  });
});

describe("canMoveQueue", () => {
  const playing = [
    match({
      id: "m",
      court: 1,
      teams: [
        ["a1", "a2"],
        ["b1", "b2"],
      ],
      startedAt: T0,
    }),
  ];

  it("refuses an incomplete Queue", () => {
    const { s, queue } = withQueue(session({ players: roster, courts: 2, matches: playing }), [
      "c1",
      "c2",
      null,
      null,
    ]);
    expect(canMoveQueue(s, queue, s.courts[1]!)).toEqual({ ok: false, reason: "queue-incomplete" });
  });

  it("refuses a Busy Court and players on court", () => {
    const base = session({
      players: [...roster, player("d1"), player("d2")],
      courts: 2,
      matches: playing,
    });
    const complete = withQueue(base, ["c1", "c2", "d1", "d2"]);
    expect(canMoveQueue(complete.s, complete.queue, complete.s.courts[0]!)).toEqual({
      ok: false,
      reason: "court-busy",
    });

    const onCourt = withQueue(base, ["a1", "c1", "c2", "b1"]);
    expect(canMoveQueue(onCourt.s, onCourt.queue, onCourt.s.courts[1]!)).toEqual({
      ok: false,
      reason: "player-on-court",
      playerId: "a1",
      playerName: "a1",
      courtNumber: 1,
    });
  });

  it("is ok when complete, Court idle and nobody is on court", () => {
    const base = session({
      players: [...roster, player("d1"), player("d2")],
      courts: 2,
      matches: playing,
    });
    const ok = withQueue(base, ["c1", "c2", "d1", "d2"]);
    expect(canMoveQueue(ok.s, ok.queue, ok.s.courts[1]!)).toEqual({ ok: true });
  });
});
