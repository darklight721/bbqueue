import { describe, expect, it } from "vite-plus/test";
import type { Club, EndedSession } from "../../domain/types.ts";
import {
  buildClubFilterOptions,
  filterByClub,
  hasClubFilter,
  parseClubFilter,
  pastSessionsPath,
} from "./clubFilter.ts";
import {
  detailsPath,
  originBackPath,
  parseOrigin,
  summaryPath,
  validateOrigin,
} from "./sessionOrigin.ts";

function ended(
  id: string,
  endedAt: number,
  clubId: string | null,
  clubName: string | null,
): EndedSession {
  return {
    id,
    name: id,
    clubId,
    clubName,
    pointSystem: 21,
    startedAt: endedAt - 1000,
    endedAt,
    players: [],
    matches: [],
  };
}

const club = (id: string, name: string): Club => ({ id, name, kind: "local", players: [] });

describe("buildClubFilterOptions", () => {
  it("is only All clubs when there are no sessions", () => {
    expect(buildClubFilterOptions([], [club("a", "Alpha")])).toEqual([
      { value: "", label: "All clubs" },
    ]);
  });

  it("lists Clubs with sessions A–Z by current name, then No club", () => {
    const sessions = [
      ended("1", 10, "z", "Zulu"),
      ended("2", 20, "b", "Bravo old"),
      ended("3", 30, null, null),
      ended("4", 40, "b", "Bravo old"),
    ];
    const clubs = [club("z", "Zulu"), club("b", "alpha-renamed"), club("unused", "Never played")];
    expect(buildClubFilterOptions(sessions, clubs)).toEqual([
      { value: "", label: "All clubs" },
      { value: "b", label: "alpha-renamed" },
      { value: "z", label: "Zulu" },
      { value: "none", label: "No club" },
    ]);
  });

  it("labels a deleted Club with its latest saved name, and skips it when none was saved", () => {
    const sessions = [
      ended("1", 10, "gone", "Old name"),
      ended("2", 20, "gone", "Newer name"),
      ended("3", 30, "legacy", null),
    ];
    expect(buildClubFilterOptions(sessions, [])).toEqual([
      { value: "", label: "All clubs" },
      { value: "gone", label: "Newer name (deleted)" },
    ]);
  });

  it("omits No club when every session has a Club", () => {
    const options = buildClubFilterOptions([ended("1", 10, "a", "A")], [club("a", "A")]);
    expect(options.map((option) => option.value)).toEqual(["", "a"]);
  });
});

describe("hasClubFilter", () => {
  it("needs two real choices besides All clubs", () => {
    const all = { value: "", label: "All clubs" };
    const a = { value: "a", label: "A" };
    const none = { value: "none", label: "No club" };
    expect(hasClubFilter([all])).toBe(false);
    expect(hasClubFilter([all, a])).toBe(false);
    expect(hasClubFilter([all, a, none])).toBe(true);
  });
});

describe("parseClubFilter and filterByClub", () => {
  const options = buildClubFilterOptions(
    [ended("1", 10, "a", "A"), ended("2", 20, null, null)],
    [club("a", "A")],
  );
  const sessions = [
    ended("1", 10, "a", "A"),
    ended("2", 20, null, null),
    ended("3", 30, "x", null),
  ];

  it("treats missing and unknown values as All", () => {
    expect(parseClubFilter(null, options)).toBe("");
    expect(parseClubFilter("", options)).toBe("");
    expect(parseClubFilter("nope", options)).toBe("");
    expect(parseClubFilter("a", options)).toBe("a");
    expect(parseClubFilter("none", options)).toBe("none");
  });

  it("filters by Club id, No club, or nothing", () => {
    expect(filterByClub(sessions, "").map((e) => e.id)).toEqual(["1", "2", "3"]);
    expect(filterByClub(sessions, "a").map((e) => e.id)).toEqual(["1"]);
    expect(filterByClub(sessions, "none").map((e) => e.id)).toEqual(["2"]);
  });

  it("builds the list path", () => {
    expect(pastSessionsPath("")).toBe("/sessions");
    expect(pastSessionsPath("a b")).toBe("/sessions?club=a%20b");
  });
});

describe("session origin", () => {
  it("round-trips through the details and summary paths", () => {
    expect(detailsPath("s1", { kind: "all" })).toBe("/sessions/s1");
    expect(detailsPath("s1", { kind: "filter", value: "none" })).toBe("/sessions/s1?club=none");
    expect(detailsPath("s1", { kind: "club", clubId: "c1" })).toBe("/sessions/s1?fromClub=c1");
    expect(summaryPath("s1", { kind: "all" })).toBe("/sessions/s1/summary?from=details");
    expect(summaryPath("s1", { kind: "filter", value: "c1" })).toBe(
      "/sessions/s1/summary?from=details&club=c1",
    );
    expect(parseOrigin("from=details&club=c1")).toEqual({ kind: "filter", value: "c1" });
    expect(parseOrigin("?fromClub=c1")).toEqual({ kind: "club", clubId: "c1" });
    expect(parseOrigin("")).toEqual({ kind: "all" });
  });

  it("round-trips a Stats origin", () => {
    const player = { kind: "playerStats", clubId: "c1", clubPlayerId: "p 1" } as const;
    expect(detailsPath("s1", player)).toBe("/sessions/s1?statsClub=c1&statsPlayer=p+1");
    expect(parseOrigin("statsClub=c1&statsPlayer=p+1")).toEqual(player);
    expect(originBackPath(player)).toBe("/clubs/c1/players/p%201/stats");
    expect(detailsPath("s1", { kind: "accountStats" })).toBe("/sessions/s1?accountStats=1");
    expect(parseOrigin("?accountStats=1")).toEqual({ kind: "accountStats" });
    expect(originBackPath({ kind: "accountStats" })).toBe("/account/stats");
  });

  it("only ever goes back to a known list path", () => {
    expect(originBackPath({ kind: "all" })).toBe("/sessions");
    expect(originBackPath({ kind: "filter", value: "c1" })).toBe("/sessions?club=c1");
    expect(originBackPath({ kind: "club", clubId: "c1" })).toBe("/clubs/c1/sessions");
    expect(originBackPath({ kind: "club", clubId: "../x?y" })).toBe("/clubs/..%2Fx%3Fy/sessions");
  });

  it("drops origins that point nowhere", () => {
    const options = buildClubFilterOptions(
      [ended("1", 10, "a", "A"), ended("2", 20, null, null)],
      [club("a", "A")],
    );
    const clubs = [club("a", "A")];
    expect(validateOrigin({ kind: "filter", value: "a" }, options, clubs)).toEqual({
      kind: "filter",
      value: "a",
    });
    expect(validateOrigin({ kind: "filter", value: "zzz" }, options, clubs)).toEqual({
      kind: "all",
    });
    expect(validateOrigin({ kind: "club", clubId: "a" }, options, clubs)).toEqual({
      kind: "club",
      clubId: "a",
    });
    expect(validateOrigin({ kind: "club", clubId: "gone" }, options, clubs)).toEqual({
      kind: "all",
    });
  });
});
