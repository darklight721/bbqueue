import { describe, expect, it } from "vite-plus/test";
import {
  canChangeRoles,
  canEditClub,
  canStartSession,
  clubChangeProblem,
  hasOrganizer,
  isSessionHost,
  leaveClubProblem,
  organizerCount,
  ownRow,
} from "./permissions.ts";
import type { ActiveSession, Club, ClubPlayer } from "./types.ts";

const roy: ClubPlayer = {
  id: "p-roy",
  name: "Roy",
  skill: "intermediate",
  link: { accountId: "roy-7k3f", role: "organizer" },
};
const ana: ClubPlayer = {
  id: "p-ana",
  name: "Ana",
  skill: "beginner",
  link: { accountId: "ana-2222", role: "player" },
};
const cat: ClubPlayer = { id: "p-cat", name: "Cat", skill: "advanced" };
const shared: Club = { id: "c1", name: "Tuesday", kind: "shared", players: [roy, ana, cat] };
const local: Club = { id: "c2", name: "Mine", kind: "local", players: [cat] };

describe("what an Account may do", () => {
  it("lets Organizers edit, change Roles, see Account IDs and start Sessions", () => {
    expect(canEditClub(shared, "roy-7k3f")).toBe(true);
    expect(canChangeRoles(shared, "ROY-7K3F")).toBe(true);
    expect(canStartSession(shared, "roy-7k3f")).toBe(true);
  });

  it("keeps Players to a read-only view", () => {
    expect(canEditClub(shared, "ana-2222")).toBe(false);
    expect(canChangeRoles(shared, "ana-2222")).toBe(false);
    expect(canStartSession(shared, "ana-2222")).toBe(false);
  });

  it("gives an Account that isn't on the Club no rights", () => {
    expect(canEditClub(shared, "ben-3333")).toBe(false);
    expect(canEditClub(shared, null)).toBe(false);
  });

  it("lets anyone on the device do anything with a Local club, but no Roles apply", () => {
    expect(canEditClub(local, null)).toBe(true);
    expect(canStartSession(local, "ana-2222")).toBe(true);
    expect(canChangeRoles(local, "roy-7k3f")).toBe(false);
  });
});

describe("own row and Organizer count", () => {
  it("finds the row linked to the Account, ignoring case", () => {
    expect(ownRow(shared, "ANA-2222")).toBe(ana);
    expect(ownRow(shared, "ben-3333")).toBeNull();
    expect(ownRow(shared, null)).toBeNull();
  });

  it("counts Organizers", () => {
    expect(organizerCount(shared)).toBe(1);
    expect(hasOrganizer(shared)).toBe(true);
    expect(hasOrganizer({ ...shared, players: [ana, cat] })).toBe(false);
  });
});

describe("leaving a Club", () => {
  it("is open to Players", () => {
    expect(leaveClubProblem(shared, "ana-2222")).toBeNull();
  });

  it("is open to an Organizer when another Organizer remains", () => {
    const two = {
      ...shared,
      players: [roy, { ...ana, link: { accountId: "ana-2222", role: "organizer" as const } }],
    };
    expect(leaveClubProblem(two, "roy-7k3f")).toBeNull();
  });

  it("is blocked for the last Organizer", () => {
    expect(leaveClubProblem(shared, "roy-7k3f")).toBe("last-organizer");
  });

  it("needs a linked row", () => {
    expect(leaveClubProblem(shared, "ben-3333")).toBe("not-linked");
  });
});

describe("clubChangeProblem", () => {
  const rename = { type: "rename", name: "Friday" } as const;

  it("lets an Organizer make ordinary changes", () => {
    expect(clubChangeProblem(shared, "roy-7k3f", rename)).toBeNull();
    expect(
      clubChangeProblem(shared, "roy-7k3f", {
        type: "updatePlayer",
        playerId: "p-cat",
        patch: { skill: "beginner" },
      }),
    ).toBeNull();
    expect(
      clubChangeProblem(shared, "roy-7k3f", { type: "removePlayer", playerId: "p-cat" }),
    ).toBeNull();
  });

  it("refuses everything from Players and outsiders", () => {
    expect(clubChangeProblem(shared, "ana-2222", rename)).toBe("forbidden");
    expect(clubChangeProblem(shared, "ben-3333", rename)).toBe("forbidden");
    expect(clubChangeProblem(shared, null, rename)).toBe("forbidden");
    expect(
      clubChangeProblem(shared, "ana-2222", {
        type: "setRole",
        playerId: "p-ana",
        role: "organizer",
      }),
    ).toBe("forbidden");
  });

  it("lets a Player unlink only themselves (leave)", () => {
    expect(clubChangeProblem(shared, "ana-2222", { type: "unlink", playerId: "p-ana" })).toBeNull();
    expect(clubChangeProblem(shared, "ana-2222", { type: "unlink", playerId: "p-roy" })).toBe(
      "forbidden",
    );
    expect(clubChangeProblem(shared, "ana-2222", { type: "removePlayer", playerId: "p-ana" })).toBe(
      "forbidden",
    );
  });

  it("never leaves the Club without an Organizer", () => {
    expect(clubChangeProblem(shared, "roy-7k3f", { type: "unlink", playerId: "p-roy" })).toBe(
      "last-organizer",
    );
    expect(clubChangeProblem(shared, "roy-7k3f", { type: "removePlayer", playerId: "p-roy" })).toBe(
      "last-organizer",
    );
    expect(
      clubChangeProblem(shared, "roy-7k3f", { type: "setRole", playerId: "p-roy", role: "player" }),
    ).toBe("last-organizer");
  });

  it("lets an Organizer step down once another Organizer exists", () => {
    const two: Club = {
      ...shared,
      players: [roy, { ...ana, link: { accountId: "ana-2222", role: "organizer" } }],
    };
    expect(
      clubChangeProblem(two, "roy-7k3f", { type: "setRole", playerId: "p-roy", role: "player" }),
    ).toBeNull();
    expect(clubChangeProblem(two, "roy-7k3f", { type: "unlink", playerId: "p-roy" })).toBeNull();
  });

  it("rejects linking an Account that is already on the roster, in any case", () => {
    expect(
      clubChangeProblem(shared, "roy-7k3f", {
        type: "link",
        playerId: "p-cat",
        link: { accountId: "ANA-2222", role: "player" },
      }),
    ).toBe("already-linked");
    expect(
      clubChangeProblem(shared, "roy-7k3f", {
        type: "addPlayer",
        player: {
          id: "p-new",
          name: "New",
          skill: "beginner",
          link: { accountId: "roy-7k3f", role: "player" },
        },
      }),
    ).toBe("already-linked");
  });

  it("lets an Organizer link a free row to a new Account", () => {
    expect(
      clubChangeProblem(shared, "roy-7k3f", {
        type: "link",
        playerId: "p-cat",
        link: { accountId: "cat-9999", role: "player" },
      }),
    ).toBeNull();
  });

  it("says when the Club player is gone", () => {
    expect(clubChangeProblem(shared, "roy-7k3f", { type: "removePlayer", playerId: "nope" })).toBe(
      "not-found",
    );
  });

  it("puts no limits on a Local club", () => {
    expect(clubChangeProblem(local, null, { type: "removePlayer", playerId: "p-cat" })).toBeNull();
  });
});

describe("isSessionHost", () => {
  const shared = { hostAccountId: "roy-7k3f" } as ActiveSession;

  it("is true for whoever holds the device's own Session (Local club or no Club)", () => {
    expect(isSessionHost(null, "roy-7k3f")).toBe(true);
    expect(isSessionHost(null, null)).toBe(true);
  });

  it("is true only for the Session host of a Shared club's Active session, ignoring capitalisation", () => {
    expect(isSessionHost(shared, "roy-7k3f")).toBe(true);
    expect(isSessionHost(shared, "ROY-7K3F")).toBe(true);
    expect(isSessionHost(shared, "ana-2222")).toBe(false);
    expect(isSessionHost(shared, null)).toBe(false);
    expect(isSessionHost(shared, undefined)).toBe(false);
  });
});
