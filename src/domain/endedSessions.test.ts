import { describe, expect, it } from "vite-plus/test";
import { ENDED_SESSIONS_PER_CLUB, newestPerClub } from "./endedSessions.ts";
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
