import { describe, expect, it } from "vite-plus/test";
import type { EndedSession, EndedSessionMatch, Team } from "../types.ts";
import { buildSummary, rankStandings } from "./summary.ts";
import { MIN, T0 } from "./test-utils.ts";

type Row = [Team, Team, [number, number] | null];

function ended(rows: Row[], playerCount = 8): EndedSession {
  const matches: EndedSessionMatch[] = rows.map(([a, b, score], index) => ({
    number: index + 1,
    courtNumber: 1,
    teams: [a, b],
    target: 21,
    startedAt: T0 + index * 20 * MIN,
    endedAt: T0 + index * 20 * MIN + 10 * MIN,
    score,
  }));
  return {
    id: "s",
    name: "Test",
    clubId: null,
    pointSystem: 21,
    startedAt: T0,
    endedAt: T0 + 3 * 60 * MIN,
    players: Array.from({ length: playerCount }, (_, i) => ({
      id: `p${i + 1}`,
      name: `p${i + 1}`,
      skill: "intermediate" as const,
    })),
    matches,
  };
}

const board = (rows: Row[], playerCount = 8) =>
  rankStandings(ended(rows, playerCount)).map((w) => [w.place, w.name, w.wins, w.losses, w.played]);

describe("buildSummary", () => {
  it("counts Ended matches and the stored players", () => {
    const summary = buildSummary(
      ended([
        [
          ["p1", "p2"],
          ["p3", "p4"],
          [21, 10],
        ],
        [["p5", "p6"], ["p7", "p8"], null],
      ]),
    );
    expect(summary).toMatchObject({
      sessionName: "Test",
      totalMatches: 2,
      totalPlayers: 8,
      startedAt: T0,
      endedAt: T0 + 3 * 60 * MIN,
    });
  });

  it("ranks fewer losses before more matches played", () => {
    // p2 and p3 won once and lost once over 2 matches; p1 and p5 won once and never lost.
    expect(
      board([
        [
          ["p1", "p2"],
          ["p3", "p4"],
          [21, 10],
        ],
        [
          ["p3", "p5"],
          ["p2", "p6"],
          [21, 15],
        ],
      ]),
    ).toEqual([
      [1, "p1", 1, 0, 1],
      [1, "p5", 1, 0, 1],
      [3, "p2", 1, 1, 2],
      [3, "p3", 1, 1, 2],
      [5, "p4", 0, 1, 1],
      [5, "p6", 0, 1, 1],
    ]);
  });

  it("ranks more matches played first when wins and losses are level; unscored counts as played", () => {
    expect(
      board([
        [
          ["p1", "p2"],
          ["p3", "p4"],
          [21, 10],
        ],
        [["p1", "p5"], ["p6", "p7"], null],
      ]),
    ).toEqual([
      [1, "p1", 1, 0, 2],
      [2, "p2", 1, 0, 1],
      [3, "p5", 0, 0, 1],
      [3, "p6", 0, 0, 1],
      [3, "p7", 0, 0, 1],
      [6, "p3", 0, 1, 1],
      [6, "p4", 0, 1, 1],
    ]);
  });

  it("shares a place only when wins, losses and played are all equal (1, 1, 3)", () => {
    expect(
      board([
        [
          ["p1", "p2"],
          ["p3", "p4"],
          [21, 10],
        ],
        [
          ["p1", "p2"],
          ["p5", "p6"],
          [21, 19],
        ],
        [
          ["p3", "p5"],
          ["p7", "p8"],
          [14, 21],
        ],
      ]),
    ).toEqual([
      [1, "p1", 2, 0, 2],
      [1, "p2", 2, 0, 2],
      [3, "p7", 1, 0, 1],
      [3, "p8", 1, 0, 1],
      [5, "p4", 0, 1, 1],
      [5, "p6", 0, 1, 1],
      [7, "p3", 0, 2, 2],
      [7, "p5", 0, 2, 2],
    ]);
  });

  it("includes players with no wins, ranked by losses", () => {
    expect(
      board([
        [
          ["p1", "p2"],
          ["p3", "p4"],
          [21, 10],
        ],
        [
          ["p5", "p6"],
          ["p3", "p7"],
          [21, 10],
        ],
      ]),
    ).toEqual([
      [1, "p1", 1, 0, 1],
      [1, "p2", 1, 0, 1],
      [1, "p5", 1, 0, 1],
      [1, "p6", 1, 0, 1],
      [5, "p4", 0, 1, 1],
      [5, "p7", 0, 1, 1],
      [7, "p3", 0, 2, 2],
    ]);
  });

  it("includes players who only played unscored matches, ranking 0–0 above 0–3", () => {
    expect(
      board(
        [
          [["p1", "p2"], ["p3", "p4"], null],
          [
            ["p5", "p6"],
            ["p3", "p4"],
            [21, 10],
          ],
          [
            ["p5", "p6"],
            ["p3", "p4"],
            [21, 10],
          ],
          [
            ["p5", "p6"],
            ["p3", "p4"],
            [21, 10],
          ],
        ],
        8,
      ),
    ).toEqual([
      [1, "p5", 3, 0, 3],
      [1, "p6", 3, 0, 3],
      [3, "p1", 0, 0, 1],
      [3, "p2", 0, 0, 1],
      [5, "p3", 0, 3, 4],
      [5, "p4", 0, 3, 4],
    ]);
  });

  it("leaves out players who never played", () => {
    const names = board([[["p1", "p2"], ["p3", "p4"], null]]).map((row) => row[1]);
    expect(names).toEqual(["p1", "p2", "p3", "p4"]);
  });

  it("produces Standings when no match was scored, ranked by played with shared places", () => {
    expect(
      board([
        [["p1", "p2"], ["p3", "p4"], null],
        [["p1", "p5"], ["p6", "p7"], null],
      ]),
    ).toEqual([
      [1, "p1", 0, 0, 2],
      [2, "p2", 0, 0, 1],
      [2, "p3", 0, 0, 1],
      [2, "p4", 0, 0, 1],
      [2, "p5", 0, 0, 1],
      [2, "p6", 0, 0, 1],
      [2, "p7", 0, 0, 1],
    ]);
  });

  it("keeps Top winners to place 3 or better with at least one win", () => {
    const rows: Row[] = [
      [
        ["p1", "p2"],
        ["p3", "p4"],
        [21, 10],
      ],
    ];
    // Standings place p3 and p4 third, but without a win they are not Top winners.
    expect(board(rows).map((row) => row[0])).toEqual([1, 1, 3, 3]);
    expect(buildSummary(ended(rows)).topWinners.map((w) => w.name)).toEqual(["p1", "p2"]);
  });

  it("drops anyone below third place and ignores players without wins", () => {
    const summary = buildSummary(
      ended([
        [
          ["p1", "p2"],
          ["p3", "p4"],
          [21, 1],
        ],
        [
          ["p1", "p3"],
          ["p2", "p5"],
          [21, 1],
        ],
        [
          ["p1", "p5"],
          ["p2", "p6"],
          [21, 1],
        ],
        [
          ["p1", "p6"],
          ["p7", "p8"],
          [21, 1],
        ],
        [
          ["p3", "p7"],
          ["p4", "p8"],
          [21, 1],
        ],
      ]),
    );
    // p1 4-0; p3 2-1; p5, p6, p7 1-1 in 2 matches share third; p2 (1-2) is 6th.
    expect(summary.topWinners.map((w) => [w.place, w.name])).toEqual([
      [1, "p1"],
      [2, "p3"],
      [3, "p5"],
      [3, "p6"],
      [3, "p7"],
    ]);
    expect(summary.topWinners[0]).toMatchObject({
      wins: 4,
      losses: 0,
      played: 4,
      skill: "intermediate",
    });
  });

  it("returns no winners when nothing was scored", () => {
    expect(buildSummary(ended([[["p1", "p2"], ["p3", "p4"], null]])).topWinners).toEqual([]);
  });
});
