import { describe, expect, it } from "vite-plus/test";
import type { Match, Session, Team } from "../types.ts";
import { fillLineups, setLineup } from "./lineups.ts";
import { upNext } from "./upNext.ts";
import { MIN, T0, lineupSet, match, player, playersNamed, session } from "./test-utils.ts";

const ids = (s: Session, now = T0) => upNext(s, now)!.rows.map((row) => row.playerId);
const likely = (s: Session, now = T0) =>
  upNext(s, now)!
    .rows.filter((row) => row.likelyNext)
    .map((row) => row.playerId)
    .sort();
const reasonOf = (s: Session, id: string, now = T0) =>
  upNext(s, now)!.rows.find((row) => row.playerId === id)!.reason;

const teams = (a: string, b: string, c: string, d: string): [Team, Team] => [
  [a, b],
  [c, d],
];

/** An Ended match of p1–p4, with everyone else free at its start. */
function ended(id: string, startedAt: number, four: [Team, Team], free: string[]): Match {
  return match({ id, teams: four, startedAt, endedAt: startedAt + 10 * MIN, freeAtStart: free });
}

describe("upNext", () => {
  it("is null until the first Match has started", () => {
    expect(upNext(session({ players: playersNamed(9) }), T0)).toBeNull();
  });

  it("lists only free players: not on court, not Sitting out, not in a Lineup", () => {
    const players = playersNamed(12).map((p) => (p.id === "p12" ? { ...p, sittingOut: true } : p));
    let s = session({
      players,
      courts: 2,
      matches: [match({ id: "m1", teams: teams("p1", "p2", "p3", "p4"), startedAt: T0 - MIN })],
    });
    s = setLineup(s, "c2", { teams: teams("p5", "p6", "p7", "p8") });
    expect(ids(s).sort()).toEqual(["p10", "p11", "p9"]);
    expect(upNext(s, T0)!.lineup).toBeNull();
    expect(likely(s)).toEqual([]);
  });

  it("marks the first four as Likely next; level players are in the order they joined", () => {
    const players = playersNamed(9).map((p, i) => ({ ...p, joinedAt: T0 - (9 - i) * MIN }));
    // p9 joined last, p5 first among the free.
    const s = session({
      players,
      matches: [match({ id: "m1", teams: teams("p1", "p2", "p3", "p4"), startedAt: T0 - MIN })],
    });
    expect(ids(s)).toEqual(["p5", "p6", "p7", "p8", "p9"]);
    expect(likely(s)).toEqual(["p5", "p6", "p7", "p8"]);
    const lineup = upNext(s, T0)!.lineup!;
    expect([...lineup.teams[0], ...lineup.teams[1]].sort()).toEqual(["p5", "p6", "p7", "p8"]);
  });

  it("puts players on a Streak of 2 last, tagged Resting; Rests in a row at the limit first", () => {
    const four = teams("p1", "p2", "p3", "p4");
    const s = session({
      players: playersNamed(6),
      matches: [
        ended("m1", T0 - 30 * MIN, four, ["p5", "p6"]),
        ended("m2", T0 - 15 * MIN, four, ["p5", "p6"]),
      ],
    });
    const order = ids(s);
    expect(order.slice(0, 2).sort()).toEqual(["p5", "p6"]);
    expect(reasonOf(s, "p5")).toEqual({ kind: "sat-out", count: 2 });
    // Two of the resting players fill the four; the other two come last.
    const rest = order.slice(4);
    expect(rest).toHaveLength(2);
    for (const id of rest) expect(reasonOf(s, id)).toEqual({ kind: "resting" });
  });

  it("tags Played N fewer against the most-played, else the Wait", () => {
    const s = session({
      players: playersNamed(6),
      matches: [ended("m1", T0 - 20 * MIN, teams("p1", "p2", "p3", "p4"), ["p5", "p6"])],
    });
    expect(ids(s).slice(0, 2).sort()).toEqual(["p5", "p6"]);
    expect(likely(s)).toEqual(expect.arrayContaining(["p5", "p6"]));
    expect(reasonOf(s, "p5")).toEqual({ kind: "played-fewer", count: 1 });
    expect(reasonOf(s, "p1")).toEqual({ kind: "waiting", ms: 10 * MIN });
  });

  it("does not count Sitting-out players towards the most-played", () => {
    const players = playersNamed(6).map((p) =>
      ["p1", "p2", "p3", "p4"].includes(p.id) ? { ...p, sittingOut: true } : p,
    );
    const s = session({
      players: [...players, player("p7"), player("p8")],
      matches: [ended("m1", T0 - 20 * MIN, teams("p1", "p2", "p3", "p4"), ["p5", "p6"])],
    });
    expect(reasonOf(s, "p5").kind).toBe("waiting");
  });

  it("likely four is what a Court freeing up now would get, when nobody comes off court", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const players = playersNamed(14).map((p, i) => ({
        ...p,
        skill: (["beginner", "intermediate", "advanced"] as const)[(i * seed) % 3]!,
      }));
      const history = [
        ended("m1", T0 - 40 * MIN, teams("p1", "p5", "p9", "p13"), ["p2", "p3", "p4"]),
        ended("m2", T0 - 30 * MIN, teams("p2", "p6", "p10", "p14"), ["p1", "p3", "p4"]),
        ended("m3", T0 - 20 * MIN, teams("p3", "p7", "p11", "p1"), ["p2", "p4"]),
      ];
      const s = session({
        players,
        courts: 2,
        matches: [
          ...history,
          match({ id: "m4", teams: teams("p4", "p8", "p12", "p2"), startedAt: T0 - 5 * MIN }),
        ],
      });
      const filled = fillLineups(s, { now: T0, rng: () => 0 });
      expect(likely(s)).toEqual(lineupSet(filled, 2));
    }
  });
});
