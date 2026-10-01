import { describe, expect, it } from "vite-plus/test";
import { buildSummary } from "./summary.ts";
import { MIN, T0, match, playersNamed, session } from "./test-utils.ts";

const ended = (
  id: string,
  teams: [[string, string], [string, string]],
  score: [number, number] | null,
  n: number,
) =>
  match({
    id,
    teams,
    score,
    startedAt: T0 + n * 20 * MIN,
    endedAt: T0 + n * 20 * MIN + 10 * MIN,
    number: n,
  });

describe("buildSummary", () => {
  const matches = [
    ended(
      "m1",
      [
        ["p1", "p2"],
        ["p3", "p4"],
      ],
      [21, 10],
      1,
    ),
    ended(
      "m2",
      [
        ["p1", "p2"],
        ["p5", "p6"],
      ],
      [21, 19],
      2,
    ),
    ended(
      "m3",
      [
        ["p3", "p5"],
        ["p7", "p8"],
      ],
      [14, 21],
      3,
    ), // p7, p8 win
    ended(
      "m4",
      [
        ["p5", "p6"],
        ["p7", "p8"],
      ],
      null,
      4,
    ),
    match({
      id: "live",
      teams: [
        ["p1", "p3"],
        ["p2", "p4"],
      ],
      startedAt: T0 + 100 * MIN,
    }),
  ];

  it("counts Ended matches and players who played one", () => {
    const s = session({
      players: [...playersNamed(8), { ...playersNamed(9)[8]!, id: "never" }],
      matches,
    });
    const summary = buildSummary(s, T0 + 3 * 60 * MIN);
    expect(summary).toMatchObject({
      sessionName: "Test",
      totalMatches: 4,
      totalPlayers: 8,
      startedAt: T0,
      endedAt: T0 + 3 * 60 * MIN,
    });
  });

  it("ranks by wins, then fewer matches played, with shared places (1, 1, 3)", () => {
    const summary = buildSummary(session({ players: playersNamed(8), matches }), T0 + MIN);
    expect(summary.topWinners.map((w) => [w.place, w.name, w.wins, w.played])).toEqual([
      [1, "p1", 2, 2],
      [1, "p2", 2, 2],
      [3, "p7", 1, 2],
      [3, "p8", 1, 2],
    ]);
  });

  it("drops anyone below third place and ignores players without wins", () => {
    const summary = buildSummary(
      session({
        players: playersNamed(8),
        matches: [
          ended(
            "a",
            [
              ["p1", "p2"],
              ["p3", "p4"],
            ],
            [21, 1],
            1,
          ),
          ended(
            "b",
            [
              ["p1", "p3"],
              ["p2", "p5"],
            ],
            [21, 1],
            2,
          ),
          ended(
            "c",
            [
              ["p1", "p5"],
              ["p2", "p6"],
            ],
            [21, 1],
            3,
          ),
          ended(
            "d",
            [
              ["p1", "p6"],
              ["p7", "p8"],
            ],
            [21, 1],
            4,
          ),
          ended(
            "e",
            [
              ["p3", "p7"],
              ["p4", "p8"],
            ],
            [21, 1],
            5,
          ),
        ],
      }),
      T0,
    );
    // p1: 4 wins; p3: 2; then p5, p6, p7 share third (1 win in 2 matches); p2 (1 win in 3) is 6th.
    expect(summary.topWinners.map((w) => [w.place, w.name])).toEqual([
      [1, "p1"],
      [2, "p3"],
      [3, "p5"],
      [3, "p6"],
      [3, "p7"],
    ]);
  });

  it("returns no winners when nothing was scored", () => {
    const s = session({
      players: playersNamed(4),
      matches: [
        ended(
          "a",
          [
            ["p1", "p2"],
            ["p3", "p4"],
          ],
          null,
          1,
        ),
      ],
    });
    expect(buildSummary(s, T0).topWinners).toEqual([]);
  });
});
