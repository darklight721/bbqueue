import { describe, expect, it } from "vite-plus/test";
import { makeSharedClub, sessionForSharing, shareInputProblem } from "./makeShared.ts";
import type { Club, Session } from "./types.ts";

const roy = { accountId: "roy-7k3f", name: "Roy Smith" };
const local: Club = {
  id: "c1",
  name: "Garage",
  kind: "local",
  players: [
    { id: "p1", name: "Ana", skill: "beginner" },
    { id: "p2", name: "Roy S.", skill: "advanced" },
    { id: "p3", name: "Cat", skill: "intermediate" },
  ],
};

describe("makeSharedClub", () => {
  it("links the chosen row as Organizer and nothing else, keeping the Club's id, name and rows", () => {
    const result = makeSharedClub(local, { type: "row", rowId: "p2" }, roy, () => "new");

    expect(result).toMatchObject({ ok: true, meRowId: "p2" });
    if (!result.ok) return;
    expect(result.club).toMatchObject({ id: "c1", name: "Garage", kind: "shared" });
    expect(result.club.players).toEqual([
      { id: "p1", name: "Ana", skill: "beginner" },
      {
        id: "p2",
        name: "Roy S.",
        skill: "advanced",
        link: { accountId: roy.accountId, role: "organizer" },
      },
      { id: "p3", name: "Cat", skill: "intermediate" },
    ]);
  });

  it("Add me adds a row named after the Account, Intermediate, linked as Organizer", () => {
    const result = makeSharedClub(local, { type: "add-me" }, roy, () => "me-row");

    expect(result.ok && result.meRowId).toBe("me-row");
    if (!result.ok) return;
    expect(result.club.players).toHaveLength(4);
    expect(result.club.players.at(-1)).toEqual({
      id: "me-row",
      name: "Roy Smith",
      skill: "intermediate",
      link: { accountId: roy.accountId, role: "organizer" },
    });
    // The existing rows are as they were.
    expect(result.club.players.slice(0, 3)).toEqual(local.players);
  });

  it("refuses Add me when a player of that name is on the roster already", () => {
    const named: Club = {
      ...local,
      players: [...local.players, { id: "p4", name: " roy  smith ", skill: "beginner" }],
    };
    expect(makeSharedClub(named, { type: "add-me" }, roy, () => "x")).toEqual({
      ok: false,
      reason: "name-taken",
    });
  });

  it("refuses a row that isn't there, and a Club that is shared already", () => {
    expect(makeSharedClub(local, { type: "row", rowId: "nope" }, roy, () => "x")).toEqual({
      ok: false,
      reason: "row-not-found",
    });
    expect(
      makeSharedClub({ ...local, kind: "shared" }, { type: "add-me" }, roy, () => "x"),
    ).toEqual({ ok: false, reason: "already-shared" });
  });

  it("doesn't change the Local club it was given", () => {
    const before = JSON.stringify(local);
    makeSharedClub(local, { type: "row", rowId: "p1" }, roy, () => "x");
    expect(JSON.stringify(local)).toBe(before);
  });
});

describe("sessionForSharing", () => {
  const player = (id: string, clubPlayerId: string | null) => ({
    id,
    name: id,
    skill: "intermediate" as const,
    clubPlayerId,
    sittingOut: false,
    removed: false,
    joinedAt: 1,
  });
  const session = {
    id: "s1",
    players: [player("sp1", "p1"), player("sp2", "p2"), player("sp3", null)],
  } as unknown as Session;

  it("gives the Session player made from the chosen row the Account, and nobody else", () => {
    const shared = sessionForSharing(session, "p2", roy.accountId);
    expect(shared.players.map((p) => p.accountId)).toEqual([undefined, roy.accountId, undefined]);
  });

  it("changes nothing when that row isn't in the Session", () => {
    expect(sessionForSharing(session, "p9", roy.accountId)).toBe(session);
  });
});

describe("shareInputProblem", () => {
  const shared = (): Club => {
    const result = makeSharedClub(local, { type: "row", rowId: "p2" }, roy, () => "new");
    if (!result.ok) throw new Error("setup");
    return result.club;
  };
  const input = (club: Club) => ({ club, endedSessions: [], activeSession: null });

  it("accepts the Club as makeSharedClub makes it", () => {
    expect(shareInputProblem(input(shared()), roy)).toBeNull();
  });

  it("compares the Account ID without regard to capitalisation", () => {
    expect(shareInputProblem(input(shared()), { ...roy, accountId: "ROY-7K3F" })).toBeNull();
  });

  it("refuses a Club that isn't Shared", () => {
    expect(shareInputProblem(input({ ...shared(), kind: "local" }), roy)).toBe("not-shared");
  });

  it("refuses a link that isn't exactly one, the Account's own, as Organizer", () => {
    const club = shared();
    const other = { accountId: "ana-2222", name: "Ana" };
    expect(shareInputProblem(input(club), other)).toBe("wrong-link");
    expect(shareInputProblem(input(local), roy)).toBe("not-shared");
    const noLink = { ...club, players: club.players.map(({ link: _link, ...row }) => row) };
    expect(shareInputProblem(input(noLink), roy)).toBe("wrong-link");
    const player = {
      ...club,
      players: club.players.map((row) =>
        row.link ? { ...row, link: { ...row.link, role: "player" as const } } : row,
      ),
    };
    expect(shareInputProblem(input(player), roy)).toBe("wrong-link");
    const two = {
      ...club,
      players: club.players.map((row, i) =>
        i === 0 ? { ...row, link: { accountId: "ana-2222", role: "player" as const } } : row,
      ),
    };
    expect(shareInputProblem(input(two), roy)).toBe("wrong-link");
  });

  it("refuses an Ended session or a Session of another Club", () => {
    const club = shared();
    const ended = {
      id: "e",
      name: "N",
      clubId: "other",
      clubName: null,
      pointSystem: 21 as const,
      startedAt: 1,
      endedAt: 2,
      players: [],
      matches: [],
    };
    expect(shareInputProblem({ club, endedSessions: [ended], activeSession: null }, roy)).toBe(
      "other-club",
    );
    const session = {
      id: "s",
      name: "N",
      clubId: "other",
      clubName: null,
      pointSystem: 21 as const,
      plannedHours: 1,
      startedAt: 1,
      players: [],
      courts: [],
      matches: [],
      queues: [],
      streakResetAt: {},
    };
    expect(shareInputProblem({ club, endedSessions: [], activeSession: session }, roy)).toBe(
      "other-club",
    );
  });
});
