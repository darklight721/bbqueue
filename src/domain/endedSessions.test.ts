import { describe, expect, it } from "vite-plus/test";
import { ENDED_SESSIONS_PER_CLUB, isGoneFromServer, newestPerClub } from "./endedSessions.ts";
import type { EndedSession } from "./types.ts";

const ended = (id: string, endedAt: number, clubId: string | null): EndedSession => ({
  id,
  name: id,
  clubId,
  clubName: null,
  pointSystem: 21,
  startedAt: endedAt - 1,
  endedAt,
  players: [],
  matches: [],
});

describe("newestPerClub", () => {
  it("is 50 by default", () => {
    expect(ENDED_SESSIONS_PER_CLUB).toBe(50);
    const many = Array.from({ length: 60 }, (_, i) => ended(`e${i}`, i, "c1"));
    const kept = newestPerClub(many);
    expect(kept).toHaveLength(50);
    expect(kept[0]?.id).toBe("e59");
    expect(kept.at(-1)?.id).toBe("e10");
  });

  it("counts each Club on its own and returns everything newest first", () => {
    const kept = newestPerClub(
      [ended("a1", 1, "a"), ended("b3", 3, "b"), ended("a2", 2, "a"), ended("b4", 4, "b")],
      1,
    );
    expect(kept.map((e) => e.id)).toEqual(["b4", "a2"]);
  });

  it("doesn't change what it is given", () => {
    const list = [ended("a", 1, "c"), ended("b", 2, "c")];
    newestPerClub(list, 1);
    expect(list.map((e) => e.id)).toEqual(["a", "b"]);
  });
});

describe("isGoneFromServer", () => {
  const listed = [ended("a", 30, "c1"), ended("b", 20, "c1")];
  const report = { sessions: listed, clubIds: ["c1", "c2"] };

  it("is true for one of a Club whose whole list doesn't have it", () => {
    expect(isGoneFromServer(report, ended("x", 25, "c1"))).toBe(true);
    expect(isGoneFromServer(report, ended("old", 1, "c1"))).toBe(true);
    expect(isGoneFromServer(report, ended("x", 25, "c2"))).toBe(true);
  });

  it("is false for one the report lists", () => {
    expect(isGoneFromServer(report, ended("a", 30, "c1"))).toBe(false);
  });

  it("is false for one with no Club or of a Club that isn't in the report", () => {
    expect(isGoneFromServer(report, ended("x", 25, null))).toBe(false);
    expect(isGoneFromServer(report, ended("x", 25, "c9"))).toBe(false);
  });

  it("is false for a Club the server hasn't confirmed", () => {
    expect(isGoneFromServer({ ...report, unknown: ["c1"] }, ended("x", 25, "c1"))).toBe(false);
    expect(isGoneFromServer({ ...report, unknown: ["c1"] }, ended("x", 25, "c2"))).toBe(true);
  });

  it("only covers what is newer than the oldest of a full list", () => {
    const full = { sessions: [ended("a", 30, "c1"), ended("b", 20, "c1")], clubIds: ["c1"] };
    expect(isGoneFromServer(full, ended("newer", 25, "c1"), 2)).toBe(true);
    expect(isGoneFromServer(full, ended("tie", 20, "c1"), 2)).toBe(false);
    expect(isGoneFromServer(full, ended("older", 10, "c1"), 2)).toBe(false);
  });

  it("counts only the Club's own entries when deciding the list is full", () => {
    const mixed = { sessions: [ended("a", 30, "c1"), ended("z", 5, "c2")], clubIds: ["c1", "c2"] };
    expect(isGoneFromServer(mixed, ended("x", 10, "c1"), 2)).toBe(true);
  });
});
