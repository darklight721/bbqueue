import { describe, expect, it } from "vite-plus/test";
import type { ClubPlayer } from "../../domain/types.ts";
import { sessionDay, sessionDayWithYear } from "../session-summary/summaryFormat.ts";
import { sortRoster } from "./rosterSort.ts";

const player = (id: string, name: string): ClubPlayer => ({ id, name, skill: "intermediate" });
const roster = [player("z", "Zed"), player("a", "alice"), player("b", "Bob"), player("c", "Cy")];
const names = (players: readonly ClubPlayer[]) => players.map((p) => p.name);

describe("sortRoster", () => {
  const lastPlayed = new Map([
    ["z", 1_000],
    ["b", 3_000],
    ["c", 1_000],
  ]);

  it("by name: A→Z, ignoring case", () => {
    expect(names(sortRoster(roster, lastPlayed, "name"))).toEqual(["alice", "Bob", "Cy", "Zed"]);
  });

  it("by Last played: most recent first, ties by name, never-played last", () => {
    expect(names(sortRoster(roster, lastPlayed, "last-played"))).toEqual([
      "Bob",
      "Cy",
      "Zed",
      "alice",
    ]);
  });

  it("by Last played with nobody played: the same as by name", () => {
    expect(names(sortRoster(roster, new Map(), "last-played"))).toEqual([
      "alice",
      "Bob",
      "Cy",
      "Zed",
    ]);
  });
});

describe("sessionDayWithYear", () => {
  const now = new Date(2026, 10, 3, 12).getTime();

  it("is the session day alone in the current year", () => {
    const at = new Date(2026, 9, 2, 18).getTime();
    expect(sessionDayWithYear(at, now)).toBe(sessionDay(at));
    expect(sessionDayWithYear(at, now)).not.toContain("2026");
  });

  it("adds the year when it isn't the current one", () => {
    const at = new Date(2025, 9, 2, 18).getTime();
    expect(sessionDayWithYear(at, now)).toContain("2025");
    expect(sessionDayWithYear(at, now)).toContain(sessionDay(at).split(" ").at(-1)!);
  });
});
