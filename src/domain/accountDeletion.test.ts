import { describe, expect, it } from "vite-plus/test";
import { planAccountDeletion } from "./accountDeletion.ts";
import type { Club, ClubPlayer, EndedSession } from "./types.ts";

const ME = "roy-7k3f";
const row = (id: string, who?: string, role: "organizer" | "player" = "player"): ClubPlayer => ({
  id,
  name: id,
  skill: "intermediate",
  ...(who ? { link: { accountId: who, role } } : {}),
});
const club = (id: string, players: ClubPlayer[], kind: Club["kind"] = "shared"): Club => ({
  id,
  name: id,
  kind,
  players,
});
const ended = (id: string, clubId: string | null): EndedSession => ({
  id,
  name: id,
  clubId,
  clubName: null,
  pointSystem: 21,
  startedAt: 1,
  endedAt: 2,
  players: [],
  matches: [],
});

const plan = (
  clubs: Club[],
  extra: { endedSessions?: EndedSession[]; hostedClubIds?: string[] } = {},
) =>
  planAccountDeletion({
    accountId: ME,
    clubs,
    endedSessions: extra.endedSessions ?? [],
    hostedClubIds: extra.hostedClubIds ?? [],
  });

describe("planAccountDeletion", () => {
  it("deletes a Shared club where this is the only linked Account, counting its Ended sessions", () => {
    const solo = club("solo", [row("me", ME, "organizer"), row("cat"), row("dan")]);

    const result = plan([solo], {
      endedSessions: [
        ended("a", "solo"),
        ended("b", "solo"),
        ended("c", "other"),
        ended("d", null),
      ],
    });

    expect(result.deleteClubs).toEqual([{ club: solo, endedCount: 2 }]);
    expect(result.blocked).toEqual([]);
    expect(result.unlinkClubs).toEqual([]);
  });

  it("blocks when this is the only Organizer of a Club that has other linked Accounts", () => {
    const stuck = club("stuck", [row("me", ME, "organizer"), row("ana", "ana-2222")]);

    const result = plan([stuck]);

    expect(result.blocked).toEqual([stuck]);
    expect(result.deleteClubs).toEqual([]);
    expect(result.unlinkClubs).toEqual([]);
  });

  it("unlinks where another Organizer remains, or this Account is only a Player", () => {
    const withOrganizer = club("two", [
      row("me", ME, "organizer"),
      row("ana", "ana-2222", "organizer"),
    ]);
    const asPlayer = club("play", [row("me", ME), row("ben", "ben-3333", "organizer")]);

    const result = plan([withOrganizer, asPlayer]);

    expect(result.unlinkClubs).toEqual([withOrganizer, asPlayer]);
    expect(result.blocked).toEqual([]);
  });

  it("one blocking Club blocks the whole deletion, whatever else is there", () => {
    const solo = club("solo", [row("me", ME, "organizer")]);
    const stuck = club("stuck", [row("me", ME, "organizer"), row("ana", "ana-2222")]);

    const result = plan([solo, stuck]);

    expect(result.blocked.map((c) => c.id)).toEqual(["stuck"]);
    expect(result.deleteClubs.map((c) => c.club.id)).toEqual(["solo"]);
  });

  it("says which Clubs that stay have this Account hosting their Active session", () => {
    const two = club("two", [row("me", ME, "organizer"), row("ana", "ana-2222", "organizer")]);
    const other = club("other", [row("me", ME, "organizer"), row("ben", "ben-3333", "organizer")]);

    const result = plan([two, other], { hostedClubIds: ["two"] });

    expect(result.hostedClubs).toEqual([two]);
  });

  it("leaves Local clubs, and Clubs this Account has no row in, out of it", () => {
    const local = club("garage", [row("me")], "local");
    const notMine = club("theirs", [row("ana", "ana-2222", "organizer")]);

    const result = plan([local, notMine]);

    expect(result).toEqual({ blocked: [], deleteClubs: [], unlinkClubs: [], hostedClubs: [] });
  });

  it("recognises the Account whatever the capitalisation of its Account ID", () => {
    const solo = club("solo", [row("me", "ROY-7K3F", "organizer")]);
    expect(plan([solo]).deleteClubs).toHaveLength(1);
  });
});
