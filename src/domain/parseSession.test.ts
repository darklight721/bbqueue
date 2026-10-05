import { describe, expect, it } from "vite-plus/test";
import { toEndedSession } from "./engine/endedSession.ts";
import { match, player, session } from "./engine/test-utils.ts";
import { parseEndedSession, parseSession } from "./parseSession.ts";
import type { Session } from "./types.ts";

const T = 1_000_000_000_000;

function played(): Session {
  const base = session({
    players: [player("a"), player("b"), player("c"), player("d")],
    courts: 2,
    matches: [
      match({
        id: "m1",
        teams: [
          ["a", "b"],
          ["c", "d"],
        ],
        startedAt: T,
        endedAt: T + 1000,
        number: 1,
        score: [21, 10],
      }),
    ],
  });
  return {
    ...base,
    queues: [
      {
        id: "q1",
        slots: [
          ["a", "b"],
          ["c", null],
        ],
      },
    ],
    streakResetAt: { a: T },
  };
}

/** Turns a value into what JSON would give back, as data from storage or the server is. */
const viaJson = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

describe("parseSession", () => {
  it("accepts a real Session as it is", () => {
    const real = played();
    expect(parseSession(viaJson(real))).toEqual(real);
  });

  it("keeps a Session player's Account and a Court's Lineup", () => {
    const real = played();
    real.players[0] = { ...real.players[0]!, accountId: "ann-1234", clubPlayerId: "cp1" };
    real.courts[1] = {
      ...real.courts[1]!,
      lineup: {
        teams: [
          ["a", "b"],
          ["c", "d"],
        ],
      },
    };
    expect(parseSession(viaJson(real))).toEqual(real);
  });

  it("fills in what older saves lack: the Club's name and a Match's Target", () => {
    const old = viaJson(played()) as Record<string, unknown>;
    delete old.clubName;
    delete old.clubId;
    delete old.streakResetAt;
    for (const m of old.matches as Record<string, unknown>[]) delete m.target;
    const parsed = parseSession(old);
    expect(parsed?.clubName).toBeNull();
    expect(parsed?.clubId).toBeNull();
    expect(parsed?.streakResetAt).toEqual({});
    expect(parsed?.matches[0]?.target).toBe(21);
  });

  it("drops fields it doesn't know", () => {
    const parsed = parseSession({ ...(viaJson(played()) as object), isAdmin: true, __proto__: 1 });
    expect(parsed).not.toBeNull();
    expect(parsed as object).not.toHaveProperty("isAdmin");
  });

  it("cuts names that are too long", () => {
    const real = played();
    real.players[0] = { ...real.players[0]!, name: "x".repeat(500) };
    const parsed = parseSession(viaJson(real));
    expect(parsed?.players[0]?.name).toHaveLength(40);
  });

  it.each([
    ["null", null],
    ["a string", "session"],
    ["a number", 7],
    ["an array", []],
    ["an empty object", {}],
  ])("returns null for %s", (_label, value) => {
    expect(parseSession(value)).toBeNull();
  });

  const bad: [string, (s: Record<string, unknown>) => void][] = [
    ["a null Match", (s) => (s.matches = [null])],
    ["a string Match", (s) => (s.matches = ["m"])],
    ["a Match without teams", (s) => (s.matches = [{ id: "m", status: "ended", startedAt: 1 }])],
    [
      "a Match with a team of three",
      (s) => {
        (s.matches as Record<string, unknown>[])[0]!.teams = [
          ["a", "b", "c"],
          ["c", "d"],
        ];
      },
    ],
    [
      "a Match with a wrong status",
      (s) => ((s.matches as Record<string, unknown>[])[0]!.status = "pending"),
    ],
    [
      "a Match with a Score that isn't two numbers",
      (s) => ((s.matches as Record<string, unknown>[])[0]!.score = [1, "2"]),
    ],
    ["a name that is an object", (s) => (s.name = {})],
    ["a name that is missing", (s) => delete s.name],
    ["players that aren't a list", (s) => (s.players = {})],
    ["a null player", (s) => (s.players = [null])],
    [
      "a player whose name is an object",
      (s) => ((s.players as Record<string, unknown>[])[0]!.name = { x: 1 }),
    ],
    [
      "a player with a skill that doesn't exist",
      (s) => ((s.players as Record<string, unknown>[])[0]!.skill = "godlike"),
    ],
    ["a player whose id is a number", (s) => ((s.players as Record<string, unknown>[])[0]!.id = 7)],
    ["a null Court", (s) => (s.courts = [null])],
    [
      "a Court with a Lineup that isn't teams",
      (s) => (s.courts = [{ id: "c", number: 1, lineup: 5 }]),
    ],
    ["a null Queue", (s) => (s.queues = [null])],
    ["a Queue with one row", (s) => (s.queues = [{ id: "q", slots: [["a", "b"]] }])],
    [
      "a Queue slot that is a number",
      (s) =>
        (s.queues = [
          {
            id: "q",
            slots: [
              [1, 2],
              [3, 4],
            ],
          },
        ]),
    ],
    ["a Point system that isn't 21 or 31", (s) => (s.pointSystem = 15)],
    ["a start time that isn't finite", (s) => (s.startedAt = null)],
    ["streak resets that aren't numbers", (s) => (s.streakResetAt = { a: "now" })],
    ["a Club name that is a number", (s) => (s.clubName = 3)],
    ["too many Matches", (s) => (s.matches = Array.from({ length: 2001 }, () => ({})))],
    ["too many players", (s) => (s.players = Array.from({ length: 301 }, () => ({})))],
  ];
  it.each(bad)("returns null, and doesn't throw, for %s", (_label, corrupt) => {
    const data = viaJson(played()) as Record<string, unknown>;
    corrupt(data);
    expect(() => parseSession(data)).not.toThrow();
    expect(parseSession(data)).toBeNull();
  });
});

describe("parseEndedSession", () => {
  const real = () => toEndedSession(played(), T + 5000)!;

  it("accepts a real Ended session as it is", () => {
    expect(parseEndedSession(viaJson(real()))).toEqual(real());
  });

  it("fills in the Club's name for older Ended sessions", () => {
    const old = viaJson(real()) as Record<string, unknown>;
    delete old.clubName;
    expect(parseEndedSession(old)?.clubName).toBeNull();
  });

  it("cuts names that are too long", () => {
    const data = viaJson(real()) as { players: { name: string }[] };
    data.players[0]!.name = "y".repeat(500);
    expect(parseEndedSession(data)?.players[0]?.name).toHaveLength(40);
  });

  it.each([null, "x", 1, [], {}])("returns null for %j", (value) => {
    expect(parseEndedSession(value)).toBeNull();
  });

  const bad: [string, (e: Record<string, unknown>) => void][] = [
    ["a null Match", (e) => (e.matches = [null])],
    ["a null player", (e) => (e.players = [null])],
    ["a name that is an object", (e) => (e.name = {})],
    ["players that aren't a list", (e) => (e.players = "none")],
    ["an endedAt that isn't a number", (e) => (e.endedAt = "yesterday")],
    ["an endedAt that is infinite", (e) => (e.endedAt = Infinity)],
    ["a Match without a number", (e) => delete (e.matches as Record<string, unknown>[])[0]!.number],
    [
      "a Match with teams that aren't pairs",
      (e) => ((e.matches as Record<string, unknown>[])[0]!.teams = [[], []]),
    ],
    ["too many Matches", (e) => (e.matches = Array.from({ length: 2001 }, () => ({})))],
  ];
  it.each(bad)("returns null, and doesn't throw, for %s", (_label, corrupt) => {
    const data = viaJson(real()) as Record<string, unknown>;
    corrupt(data);
    expect(() => parseEndedSession(data)).not.toThrow();
    expect(parseEndedSession(data)).toBeNull();
  });
});

describe("parseSession and applied request ids", () => {
  it("keeps them", () => {
    const real = { ...played(), appliedRequestIds: ["r1", "r2"] };
    expect(parseSession(viaJson(real))?.appliedRequestIds).toEqual(["r1", "r2"]);
  });

  it("has none when there are none", () => {
    expect(parseSession(viaJson(played()))).not.toHaveProperty("appliedRequestIds");
  });

  it("returns null when they aren't a list of ids, or there are too many", () => {
    expect(parseSession({ ...(viaJson(played()) as object), appliedRequestIds: "r1" })).toBeNull();
    expect(parseSession({ ...(viaJson(played()) as object), appliedRequestIds: [1] })).toBeNull();
    expect(
      parseSession({
        ...(viaJson(played()) as object),
        appliedRequestIds: Array.from({ length: 201 }, (_, i) => `r${i}`),
      }),
    ).toBeNull();
  });
});
