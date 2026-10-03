import { describe, expect, it } from "vite-plus/test";
import { applyClubChange, creatorPlayer, diffClub, roleInClub } from "./clubChanges.ts";
import type { Club, ClubPlayer } from "./types.ts";

const ana: ClubPlayer = { id: "p1", name: "Ana", skill: "beginner" };
const ben: ClubPlayer = { id: "p2", name: "Ben", skill: "advanced" };
const club: Club = { id: "c1", name: "Tuesday", kind: "shared", players: [ana, ben] };

describe("creatorPlayer", () => {
  it("is the Account itself, Intermediate, linked as Organizer", () => {
    expect(creatorPlayer({ accountId: "roy-7k3f", name: "Roy" }, "p0")).toEqual({
      id: "p0",
      name: "Roy",
      skill: "intermediate",
      link: { accountId: "roy-7k3f", role: "organizer" },
    });
  });
});

describe("roleInClub", () => {
  const linked: Club = {
    ...club,
    players: [{ ...ana, link: { accountId: "ana-2222", role: "player" } }, ben],
  };

  it("is the Role on the linked row, ignoring Account ID case", () => {
    expect(roleInClub(linked, "ANA-2222")).toBe("player");
  });

  it("is null when no row is linked to the Account", () => {
    expect(roleInClub(linked, "ben-3333")).toBeNull();
    expect(roleInClub(club, "ana-2222")).toBeNull();
  });
});

describe("applyClubChange", () => {
  it("renames", () => {
    expect(applyClubChange(club, { type: "rename", name: "Friday" }).name).toBe("Friday");
  });

  it("adds a row once", () => {
    const cat: ClubPlayer = { id: "p3", name: "Cat", skill: "intermediate" };
    const added = applyClubChange(club, { type: "addPlayer", player: cat });
    expect(added.players.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
    expect(applyClubChange(added, { type: "addPlayer", player: cat })).toBe(added);
  });

  it("updates only the given fields of one row", () => {
    const updated = applyClubChange(club, {
      type: "updatePlayer",
      playerId: "p1",
      patch: { skill: "advanced" },
    });
    expect(updated.players[0]).toEqual({ ...ana, skill: "advanced" });
    expect(updated.players[1]).toBe(ben);
  });

  it("removes a row, and ignores rows that are gone", () => {
    const removed = applyClubChange(club, { type: "removePlayer", playerId: "p1" });
    expect(removed.players).toEqual([ben]);
    expect(
      applyClubChange(removed, { type: "updatePlayer", playerId: "p1", patch: { name: "X" } }),
    ).toEqual(removed);
  });
});

describe("diffClub", () => {
  it("has no changes for an identical Club, or whitespace-only differences", () => {
    expect(diffClub(club, club)).toEqual([]);
    expect(
      diffClub(club, { ...club, name: "  Tuesday ", players: [{ ...ana, name: "Ana " }, ben] }),
    ).toEqual([]);
  });

  it("finds the rename, edited fields only, removed rows and added rows", () => {
    const cat: ClubPlayer = { id: "p3", name: "Cat", skill: "intermediate" };
    const after: Club = {
      ...club,
      name: "Friday",
      players: [{ ...ana, skill: "advanced" }, cat],
    };
    expect(diffClub(club, after)).toEqual([
      { type: "rename", name: "Friday" },
      { type: "removePlayer", playerId: "p2" },
      { type: "updatePlayer", playerId: "p1", patch: { skill: "advanced" } },
      { type: "addPlayer", player: cat },
    ]);
  });

  it("applying the diff gives the new Club", () => {
    const after: Club = {
      ...club,
      name: "Friday",
      players: [
        { ...ana, name: "Anna" },
        { id: "p3", name: "Cat", skill: "beginner" },
      ],
    };
    const result = diffClub(club, after).reduce(applyClubChange, club);
    expect(result.name).toBe("Friday");
    expect(result.players.map((p) => [p.id, p.name, p.skill])).toEqual([
      ["p1", "Anna", "beginner"],
      ["p3", "Cat", "beginner"],
    ]);
  });
});
