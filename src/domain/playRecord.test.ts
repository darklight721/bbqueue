import { describe, expect, it } from "vite-plus/test";
import { accountPlayRecord, clubPlayRecord, winRate } from "./playRecord.ts";
import type { Club, EndedSession, EndedSessionMatch } from "./types.ts";

type Pair = [string, string];
type Row = { a: Pair; b: Pair; score: [number, number] | null };

/** Session player ids double as names; `ids` maps a Session player id to its Club player id (absent = Guest). */
function ended(
  id: string,
  endedAt: number,
  rows: Row[],
  ids: Record<string, string | null | undefined>,
  overrides: Partial<EndedSession> = {},
): EndedSession {
  const matches: EndedSessionMatch[] = rows.map((row, index) => ({
    number: index + 1,
    courtNumber: 1,
    teams: [row.a, row.b],
    target: 21,
    startedAt: endedAt - 100_000 + index * 1000,
    endedAt: endedAt - 90_000 + index * 1000,
    score: row.score,
  }));
  const names = [...new Set(rows.flatMap((row) => [...row.a, ...row.b]))];
  return {
    id,
    name: `Session ${id}`,
    clubId: "c1",
    clubName: "Garage",
    pointSystem: 21,
    startedAt: endedAt - 200_000,
    endedAt,
    players: names.map((name) => {
      const clubPlayerId = ids[name];
      const base = { id: name, name, skill: "intermediate" as const };
      // `undefined` = a record from before the id was saved: the field is missing altogether.
      return clubPlayerId === undefined ? (base as never) : { ...base, clubPlayerId };
    }),
    matches,
    ...overrides,
  };
}

const club = (
  id: string,
  players: { id: string; name: string; account?: string }[],
  name = "Garage",
): Club => ({
  id,
  name,
  kind: "local",
  players: players.map((p) => ({
    id: p.id,
    name: p.name,
    skill: "intermediate",
    ...(p.account ? { link: { accountId: p.account, role: "player" as const } } : {}),
  })),
});

const ALL = { ann: "cp-ann", bob: "cp-bob", cat: "cp-cat", dan: "cp-dan" };
const garage = club("c1", [
  { id: "cp-ann", name: "Ann" },
  { id: "cp-bob", name: "Bob" },
  { id: "cp-cat", name: "Cat" },
  { id: "cp-dan", name: "Dan" },
]);

describe("winRate", () => {
  it("is wins ÷ (wins + losses), and none without either", () => {
    expect(winRate(3, 1)).toBe(0.75);
    expect(winRate(0, 2)).toBe(0);
    expect(winRate(0, 0)).toBeNull();
  });
});

describe("clubPlayRecord", () => {
  it("counts wins, losses and played, leaving unscored matches out of the Win rate", () => {
    const night = ended(
      "s1",
      1000_000,
      [
        { a: ["ann", "bob"], b: ["cat", "dan"], score: [21, 10] },
        { a: ["ann", "cat"], b: ["bob", "dan"], score: [15, 21] },
        { a: ["ann", "dan"], b: ["bob", "cat"], score: null },
      ],
      ALL,
    );
    const record = clubPlayRecord([night], [garage], "c1", "cp-ann");
    expect(record.totals).toEqual({ played: 3, wins: 1, losses: 1, winRate: 0.5, sessions: 1 });
    expect(record.sessions).toHaveLength(1);
    expect(record.sessions[0]).toMatchObject({
      sessionId: "s1",
      clubId: "c1",
      clubName: "Garage",
      wins: 1,
      losses: 1,
      played: 3,
      winRate: 0.5,
    });
  });

  it("has no Win rate, not 0%, when every match is unscored", () => {
    const night = ended(
      "s1",
      1000_000,
      [{ a: ["ann", "bob"], b: ["cat", "dan"], score: null }],
      ALL,
    );
    const record = clubPlayRecord([night], [garage], "c1", "cp-ann");
    expect(record.totals).toEqual({ played: 1, wins: 0, losses: 0, winRate: null, sessions: 1 });
    expect(record.sessions[0]!.winRate).toBeNull();
  });

  it("treats a level score as played with no winner", () => {
    const night = ended(
      "s1",
      1000_000,
      [{ a: ["ann", "bob"], b: ["cat", "dan"], score: [15, 15] }],
      ALL,
    );
    const record = clubPlayRecord([night], [garage], "c1", "cp-ann");
    expect(record.totals).toMatchObject({ played: 1, wins: 0, losses: 0, winRate: null });
  });

  it("is empty for an unknown Club player or no Ended sessions", () => {
    const night = ended(
      "s1",
      1000_000,
      [{ a: ["ann", "bob"], b: ["cat", "dan"], score: [21, 1] }],
      ALL,
    );
    for (const record of [
      clubPlayRecord([night], [garage], "c1", "cp-nobody"),
      clubPlayRecord([], [garage], "c1", "cp-ann"),
    ]) {
      expect(record.totals).toEqual({ played: 0, wins: 0, losses: 0, winRate: null, sessions: 0 });
      expect(record.sessions).toEqual([]);
      expect(record.partners).toEqual({ mostFrequent: null, best: null });
    }
    expect(clubPlayRecord([night], [garage], "c1", "cp-nobody").name).toBeNull();
  });

  it("only looks at Ended sessions of that Club, matched by Club player id", () => {
    const rows: Row[] = [{ a: ["ann", "bob"], b: ["cat", "dan"], score: [21, 10] }];
    const mine = ended("mine", 3000_000, rows, ALL);
    const otherClub = ended("other", 2000_000, rows, ALL, { clubId: "c2", clubName: "Other" });
    const noClub = ended("none", 1500_000, rows, ALL, { clubId: null, clubName: null });
    // Same Session-player name, but a different Club player.
    const someoneElse = ended("else", 1000_000, rows, { ...ALL, ann: "cp-other-ann" });
    const record = clubPlayRecord([mine, otherClub, noClub, someoneElse], [garage], "c1", "cp-ann");
    expect(record.sessions.map((s) => s.sessionId)).toEqual(["mine"]);
    expect(record.totals).toMatchObject({ played: 1, wins: 1, sessions: 1 });
  });

  it("reads old Ended sessions without clubPlayerId without errors, adding nothing", () => {
    const rows: Row[] = [{ a: ["ann", "bob"], b: ["cat", "dan"], score: [21, 10] }];
    const old = ended("old", 1000_000, rows, {
      ann: undefined,
      bob: undefined,
      cat: undefined,
      dan: undefined,
    });
    const recent = ended("recent", 2000_000, rows, ALL);
    const record = clubPlayRecord([old, recent], [garage], "c1", "cp-ann");
    expect(record.sessions.map((s) => s.sessionId)).toEqual(["recent"]);
    // Partners in a new session whose own record is partial are tolerated too.
    expect(clubPlayRecord([old], [garage], "c1", "cp-ann").totals.played).toBe(0);
  });

  it("lists Sessions newest first, each with its place from the Standings", () => {
    const first = ended(
      "first",
      1000_000,
      [
        { a: ["ann", "bob"], b: ["cat", "dan"], score: [21, 10] },
        { a: ["ann", "cat"], b: ["bob", "dan"], score: [21, 12] },
      ],
      ALL,
    );
    const second = ended(
      "second",
      2000_000,
      [
        { a: ["ann", "bob"], b: ["cat", "dan"], score: [10, 21] },
        { a: ["ann", "cat"], b: ["bob", "dan"], score: [12, 21] },
      ],
      ALL,
    );
    const record = clubPlayRecord([first, second], [garage], "c1", "cp-ann");
    expect(record.sessions.map((s) => [s.sessionId, s.place])).toEqual([
      ["second", 4],
      ["first", 1],
    ]);
    expect(record.sessions[0]!.endedAt).toBe(2000_000);
    expect(record.sessions[0]!.startedAt).toBe(1_800_000);
  });

  it("uses the Club name as at Start", () => {
    const night = ended(
      "s1",
      1000_000,
      [{ a: ["ann", "bob"], b: ["cat", "dan"], score: [21, 1] }],
      ALL,
      {
        clubName: "Old name",
      },
    );
    const record = clubPlayRecord([night], [{ ...garage, name: "New name" }], "c1", "cp-ann");
    expect(record.sessions[0]!.clubName).toBe("Old name");
  });

  describe("name", () => {
    const rows: Row[] = [{ a: ["ann", "bob"], b: ["cat", "dan"], score: [21, 10] }];

    it("is the current roster name", () => {
      const night = ended("s1", 1000_000, rows, ALL);
      const renamed = club("c1", [{ id: "cp-ann", name: "Annabel" }]);
      expect(clubPlayRecord([night], [renamed], "c1", "cp-ann").name).toBe("Annabel");
    });

    it("falls back to the name in the most recent Ended session when off the roster", () => {
      const older = ended("s1", 1000_000, rows, ALL);
      const newer = ended("s2", 2000_000, rows, ALL);
      newer.players = newer.players.map((p) => (p.id === "ann" ? { ...p, name: "Annie" } : p));
      const empty = club("c1", []);
      expect(clubPlayRecord([older, newer], [empty], "c1", "cp-ann").name).toBe("Annie");
      expect(clubPlayRecord([newer, older], [], "c1", "cp-ann").name).toBe("Annie");
    });
  });

  describe("Partners", () => {
    /** Ann + Bob win/lose against Cat + Dan; the Partner is always Bob unless stated. */
    const together = (scores: ([number, number] | null)[], partner = "bob") =>
      scores.map<Row>((score) => ({ a: ["ann", partner], b: ["cat", "dan"], score }));

    it("picks the most frequent Partner by matches together, scored or not", () => {
      const night = ended(
        "s1",
        1000_000,
        [
          ...together([null, null, [21, 10]], "bob"),
          ...together([[21, 10]], "cat").map<Row>((row) => ({ ...row, b: ["bob", "dan"] })),
        ],
        ALL,
      );
      const { partners } = clubPlayRecord([night], [garage], "c1", "cp-ann");
      expect(partners.mostFrequent).toMatchObject({
        clubId: "c1",
        clubPlayerId: "cp-bob",
        name: "Bob",
        together: 3,
        wins: 1,
        losses: 0,
        winRate: 1,
      });
    });

    it("breaks most-frequent ties by name", () => {
      const night = ended(
        "s1",
        1000_000,
        [
          { a: ["ann", "dan"], b: ["bob", "cat"], score: [21, 1] },
          { a: ["ann", "bob"], b: ["cat", "dan"], score: [21, 1] },
        ],
        ALL,
      );
      const { partners } = clubPlayRecord([night], [garage], "c1", "cp-ann");
      expect(partners.mostFrequent?.name).toBe("Bob");
    });

    it("leaves Guests out of both", () => {
      const night = ended(
        "s1",
        1000_000,
        together(
          [
            [21, 1],
            [21, 1],
            [21, 1],
            [21, 1],
          ],
          "guest",
        ),
        { ...ALL, guest: null },
      );
      const { partners } = clubPlayRecord([night], [garage], "c1", "cp-ann");
      expect(partners).toEqual({ mostFrequent: null, best: null });
    });

    it("needs at least 3 matches together for Best partner", () => {
      const two = ended(
        "s1",
        1000_000,
        together([
          [21, 1],
          [21, 1],
        ]),
        ALL,
      );
      const three = ended(
        "s2",
        1000_000,
        together([
          [21, 1],
          [21, 1],
          [21, 1],
        ]),
        ALL,
      );
      expect(clubPlayRecord([two], [garage], "c1", "cp-ann").partners.best).toBeNull();
      expect(clubPlayRecord([three], [garage], "c1", "cp-ann").partners.best?.clubPlayerId).toBe(
        "cp-bob",
      );
    });

    it("needs at least one scored match together for Best partner", () => {
      const night = ended("s1", 1000_000, together([null, null, null]), ALL);
      const { partners } = clubPlayRecord([night], [garage], "c1", "cp-ann");
      expect(partners.best).toBeNull();
      expect(partners.mostFrequent?.winRate).toBeNull();
    });

    it("counts matches together across Sessions and picks the highest Win rate", () => {
      const a = ended(
        "s1",
        1000_000,
        [
          ...together(
            [
              [21, 1],
              [1, 21],
              [21, 1],
            ],
            "bob",
          ),
          ...together(
            [
              [21, 1],
              [21, 1],
              [21, 1],
            ],
            "cat",
          ).map<Row>((row) => ({ ...row, b: ["bob", "dan"] })),
        ],
        ALL,
      );
      const { partners } = clubPlayRecord([a], [garage], "c1", "cp-ann");
      expect(partners.best).toMatchObject({ clubPlayerId: "cp-cat", winRate: 1, together: 3 });
    });

    it("breaks Best partner ties by more matches together, then by name", () => {
      const rows = (partner: string, count: number): Row[] =>
        Array.from({ length: count }, () => ({
          a: ["ann", partner] as Pair,
          b: ["x", "y"] as Pair,
          score: [21, 1] as [number, number],
        }));
      const ids = { ...ALL, x: null, y: null };
      const moreTogether = ended("s1", 1000_000, [...rows("bob", 3), ...rows("cat", 4)], ids);
      expect(clubPlayRecord([moreTogether], [garage], "c1", "cp-ann").partners.best?.name).toBe(
        "Cat",
      );
      const sameTogether = ended("s2", 1000_000, [...rows("cat", 3), ...rows("bob", 3)], ids);
      expect(clubPlayRecord([sameTogether], [garage], "c1", "cp-ann").partners.best?.name).toBe(
        "Bob",
      );
    });

    it("uses the current roster name, else the name from the latest Ended session", () => {
      const older = ended("s1", 1000_000, together([[21, 1]]), ALL);
      const newer = ended("s2", 2000_000, together([[21, 1]]), ALL);
      newer.players = newer.players.map((p) => (p.id === "bob" ? { ...p, name: "Bobby" } : p));
      expect(
        clubPlayRecord([older, newer], [club("c1", [])], "c1", "cp-ann").partners.mostFrequent
          ?.name,
      ).toBe("Bobby");
      expect(
        clubPlayRecord([older, newer], [garage], "c1", "cp-ann").partners.mostFrequent?.name,
      ).toBe("Bob");
    });
  });
});

describe("accountPlayRecord", () => {
  const rows: Row[] = [{ a: ["ann", "bob"], b: ["cat", "dan"], score: [21, 10] }];
  const clubs = [
    club("c1", [
      { id: "cp-ann", name: "Ann", account: "ann-2222" },
      { id: "cp-bob", name: "Bob" },
    ]),
    club(
      "c2",
      [
        { id: "cp-a2", name: "Annie", account: "ANN-2222" },
        { id: "cp-z", name: "Zed" },
      ],
      "Court",
    ),
  ];
  const inC1 = ended("s1", 1000_000, rows, { ...ALL });
  const inC2 = ended(
    "s2",
    2000_000,
    [{ a: ["ann", "zed"], b: ["cat", "dan"], score: [3, 21] }],
    { ann: "cp-a2", zed: "cp-z", cat: null, dan: null },
    { clubId: "c2", clubName: "Court" },
  );

  it("combines the Club views of every row currently linked to the Account, newest first", () => {
    const record = accountPlayRecord([inC1, inC2], clubs, "ann-2222");
    expect(record.name).toBe("Ann");
    expect(record.totals).toEqual({ played: 2, wins: 1, losses: 1, winRate: 0.5, sessions: 2 });
    expect(record.sessions.map((s) => [s.sessionId, s.clubId, s.clubName])).toEqual([
      ["s2", "c2", "Court"],
      ["s1", "c1", "Garage"],
    ]);
    expect(record.partners.mostFrequent).toMatchObject({ clubId: "c1", clubPlayerId: "cp-bob" });
  });

  it("is empty when no row is linked to the Account", () => {
    const record = accountPlayRecord([inC1, inC2], clubs, "someone-9999");
    expect(record.name).toBeNull();
    expect(record.totals.played).toBe(0);
    expect(record.sessions).toEqual([]);
  });

  it("follows the current links: an unlinked or relinked row no longer counts", () => {
    const relinked = [
      clubs[0]!,
      club("c2", [
        { id: "cp-a2", name: "Annie", account: "ben-3333" },
        { id: "cp-z", name: "Zed" },
      ]),
    ];
    const record = accountPlayRecord([inC1, inC2], relinked, "ann-2222");
    expect(record.sessions.map((s) => s.sessionId)).toEqual(["s1"]);
    expect(
      accountPlayRecord([inC1, inC2], relinked, "ben-3333").sessions.map((s) => s.sessionId),
    ).toEqual(["s2"]);
  });
});
