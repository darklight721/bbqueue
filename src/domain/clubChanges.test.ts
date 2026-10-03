import { describe, expect, it } from "vite-plus/test";
import {
  applyClubChange,
  creatorPlayer,
  diffClub,
  inSafeOrder,
  roleInClub,
} from "./clubChanges.ts";
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

describe("links and Roles", () => {
  const linked: Club = {
    ...club,
    players: [{ ...ana, link: { accountId: "ana-2222", role: "player" } }, ben],
  };

  it("applies link, setRole and unlink to one row", () => {
    const withBen = applyClubChange(linked, {
      type: "link",
      playerId: "p2",
      link: { accountId: "ben-3333", role: "organizer" },
    });
    expect(withBen.players[1]?.link).toEqual({ accountId: "ben-3333", role: "organizer" });

    const demoted = applyClubChange(withBen, { type: "setRole", playerId: "p2", role: "player" });
    expect(demoted.players[1]?.link?.role).toBe("player");

    const left = applyClubChange(demoted, { type: "unlink", playerId: "p1" });
    expect(left.players[0]).toEqual(ana);
    expect("link" in left.players[0]!).toBe(false);
  });

  it("ignores a Role change on an unlinked row", () => {
    expect(
      applyClubChange(linked, { type: "setRole", playerId: "p2", role: "organizer" }).players[1],
    ).toEqual(ben);
  });

  it("finds links, Role changes and unlinks in a diff", () => {
    const after: Club = {
      ...linked,
      players: [
        { ...ana, link: { accountId: "ana-2222", role: "organizer" } },
        { ...ben, link: { accountId: "ben-3333", role: "player" } },
      ],
    };
    expect(diffClub(linked, after)).toEqual([
      { type: "setRole", playerId: "p1", role: "organizer" },
      { type: "link", playerId: "p2", link: { accountId: "ben-3333", role: "player" } },
    ]);
    expect(diffClub(after, linked)).toEqual([
      { type: "setRole", playerId: "p1", role: "player" },
      { type: "unlink", playerId: "p2" },
    ]);
  });

  it("treats a different Account on the same row as a new link", () => {
    const after: Club = {
      ...linked,
      players: [{ ...ana, link: { accountId: "zed-4444", role: "player" } }, ben],
    };
    expect(diffClub(linked, after)).toEqual([
      { type: "link", playerId: "p1", link: { accountId: "zed-4444", role: "player" } },
    ]);
  });

  it("compares Account IDs ignoring case", () => {
    const after: Club = {
      ...linked,
      players: [{ ...ana, link: { accountId: "ANA-2222", role: "player" } }, ben],
    };
    expect(diffClub(linked, after)).toEqual([]);
  });

  it("an added row keeps its link", () => {
    const cat: ClubPlayer = {
      id: "p3",
      name: "Cat",
      skill: "beginner",
      link: { accountId: "cat-9999", role: "player" },
    };
    expect(diffClub(linked, { ...linked, players: [...linked.players, cat] })).toEqual([
      { type: "addPlayer", player: cat },
    ]);
  });
});

describe("inSafeOrder", () => {
  it("makes Organizers before demoting, unlinking or removing, keeping the order otherwise", () => {
    const changes = inSafeOrder([
      { type: "setRole", playerId: "p1", role: "player" },
      { type: "removePlayer", playerId: "p2" },
      { type: "rename", name: "Friday" },
      { type: "link", playerId: "p3", link: { accountId: "x-aaaa", role: "organizer" } },
      { type: "updatePlayer", playerId: "p4", patch: { skill: "beginner" } },
      { type: "unlink", playerId: "p5" },
    ]);
    expect(changes.map((c) => c.type)).toEqual([
      "link",
      "rename",
      "updatePlayer",
      "setRole",
      "removePlayer",
      "unlink",
    ]);
  });
});
