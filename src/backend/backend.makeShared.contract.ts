import { afterEach, describe, expect, it } from "vite-plus/test";
import { makeSharedClub } from "../domain/makeShared.ts";
import type { Account, ActiveSession, Club, EndedSession } from "../domain/types.ts";
import { eventually } from "../test/eventually.ts";
import { BackendError } from "./backend.ts";
import type { RolesContractWorld } from "./backend.roles.contract.ts";
import { makeClubEnded, makeClubSession } from "./backend.sessions.contract.ts";

const local = (extra: Partial<Club> = {}): Club => ({
  id: "c1",
  name: "Garage",
  kind: "local",
  players: [
    { id: "p-ana", name: "Ana", skill: "beginner" },
    { id: "p-roy", name: "Roy S.", skill: "advanced" },
    { id: "p-cat", name: "Cat", skill: "intermediate" },
  ],
  ...extra,
});

/**
 * Making a Local club shared (ticket 10) on a Backend: the Club, its rows, its Ended sessions and its
 * Active session go to the server in one go, and can be linked and seen as any Shared club.
 */
export function runMakeSharedContract(name: string, createWorld: () => RolesContractWorld) {
  const stops: (() => void)[] = [];
  afterEach(() => {
    for (const stop of stops.splice(0)) stop();
  });

  async function rejection(promise: Promise<unknown>): Promise<BackendError> {
    try {
      await promise;
    } catch (error) {
      return error as BackendError;
    }
    throw new Error("Expected the call to be rejected");
  }

  async function person(world: RolesContractWorld, accountName: string) {
    const device = world.device();
    const account: Account = await device.backend.createAccount(accountName);
    let clubs: Club[] = [];
    let ended: EndedSession[] = [];
    let active: ActiveSession[] = [];
    stops.push(
      device.backend.observeSharedClubs((list) => (clubs = list)),
      device.backend.observeEndedSessions((report) => (ended = report.sessions)),
      device.backend.observeActiveSessions((report) => (active = report.sessions)),
    );
    return {
      ...device,
      account,
      clubs: () => clubs,
      club: (id: string) => clubs.find((c) => c.id === id),
      ended: () => ended,
      active: () => active,
    };
  }

  /** The Shared club to create: Roy is "Roy S." on the roster. */
  function shared(roy: { account: Account }, club = local()) {
    const plan = makeSharedClub(club, { type: "row", rowId: "p-roy" }, roy.account, () => "unused");
    if (!plan.ok) throw new Error(plan.reason);
    return plan.club;
  }

  describe(`Make shared club contract: ${name}`, () => {
    it("creates the Shared club with its roster, the chosen row linked as Organizer, and nothing else linked", async () => {
      const roy = await person(createWorld(), "Roy");
      const club = shared(roy);

      const result = await roy.backend.makeSharedClub({
        club,
        endedSessions: [],
        activeSession: null,
      });

      expect(result).toEqual({ club, active: null });
      await eventually(() => expect(roy.club("c1")?.players).toHaveLength(3));
      const mine = roy.club("c1")!;
      expect(mine.kind).toBe("shared");
      expect(mine.name).toBe("Garage");
      expect(
        mine.players
          .map((p) => [p.id, p.link?.role ?? null])
          .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
      ).toEqual([
        ["p-ana", null],
        ["p-cat", null],
        ["p-roy", "organizer"],
      ]);
    });

    it("lets the new Organizer link another Account afterwards, who then sees the Club", async () => {
      const world = createWorld();
      const roy = await person(world, "Roy");
      const ana = await person(world, "Ana");
      await roy.backend.makeSharedClub({
        club: shared(roy),
        endedSessions: [],
        activeSession: null,
      });
      await eventually(() => expect(roy.club("c1")).toBeDefined());

      await roy.backend.linkClubPlayer("c1", "p-ana", ana.account.accountId, "player");

      await eventually(() => expect(ana.club("c1")?.name).toBe("Garage"));
    });

    it("brings the Club's Ended sessions, which everybody linked to the Club then sees", async () => {
      const world = createWorld();
      const roy = await person(world, "Roy");
      const ana = await person(world, "Ana");
      const sessions = [1, 2, 3].map((n) =>
        makeClubEnded(makeClubSession(`Night ${n}`), 1_700_000_000_000 + n * 1000),
      );
      await roy.backend.makeSharedClub({
        club: shared(roy),
        endedSessions: sessions,
        activeSession: null,
      });
      await roy.backend.linkClubPlayer("c1", "p-ana", ana.account.accountId, "player");

      await eventually(() =>
        expect(
          ana
            .ended()
            .map((e) => e.id)
            .sort(),
        ).toEqual(sessions.map((e) => e.id).sort()),
      );
      expect(ana.ended()[0]?.clubId).toBe("c1");
    });

    it("moves the running Session over with this Account as its Session host", async () => {
      const world = createWorld();
      const roy = await person(world, "Roy");
      const ana = await person(world, "Ana");
      const session = makeClubSession("Running");

      const result = await roy.backend.makeSharedClub({
        club: shared(roy),
        endedSessions: [],
        activeSession: session,
      });

      expect(result.active).toMatchObject({
        clubId: "c1",
        session,
        hostAccountId: roy.account.accountId,
        hostName: "Roy",
      });
      await roy.backend.linkClubPlayer("c1", "p-ana", ana.account.accountId, "player");
      await eventually(() => expect(ana.active()[0]?.session).toEqual(session));
      expect(ana.active()[0]?.hostName).toBe("Roy");
      // He can keep running it.
      await roy.backend.publishActiveSession("c1", makeClubSession("Still running"));
    });

    it("needs a connection and an Account", async () => {
      const world = createWorld();
      const roy = await person(world, "Roy");
      const club = shared(roy);
      roy.setOnline(false);

      expect(
        (
          await rejection(
            roy.backend.makeSharedClub({ club, endedSessions: [], activeSession: null }),
          )
        ).code,
      ).toBe("offline");

      roy.setOnline(true);
      const stranger = world.device();
      expect(
        (
          await rejection(
            stranger.backend.makeSharedClub({ club, endedSessions: [], activeSession: null }),
          )
        ).code,
      ).toBe("no-account");
    });

    it("refuses a Club that isn't one linked Organizer: this Account", async () => {
      const roy = await person(createWorld(), "Roy");
      const club = shared(roy);
      const none: Club = { ...club, players: club.players.map(({ link: _l, ...row }) => row) };
      const two: Club = {
        ...club,
        players: club.players.map((row) =>
          row.id === "p-cat"
            ? { ...row, link: { accountId: "ana-2222", role: "player" as const } }
            : row,
        ),
      };
      const somebodyElse: Club = {
        ...club,
        players: club.players.map((row) =>
          row.link ? { ...row, link: { accountId: "ana-2222", role: "organizer" as const } } : row,
        ),
      };

      for (const bad of [none, two, somebodyElse, { ...club, kind: "local" as const }]) {
        expect(
          (
            await rejection(
              roy.backend.makeSharedClub({ club: bad, endedSessions: [], activeSession: null }),
            )
          ).code,
        ).toBe("failed");
      }
      expect(roy.clubs()).toEqual([]);
    });

    it("carries on from where an earlier try stopped, without duplicating anything", async () => {
      const roy = await person(createWorld(), "Roy");
      const club = shared(roy);
      const sessions = [makeClubEnded(makeClubSession("One"), 1_700_000_001_000)];
      const input = { club, endedSessions: sessions, activeSession: makeClubSession("Running") };

      await roy.backend.makeSharedClub(input);
      await roy.backend.makeSharedClub(input);

      await eventually(() => expect(roy.club("c1")?.players).toHaveLength(3));
      await eventually(() => expect(roy.ended()).toHaveLength(1));
      await eventually(() => expect(roy.active()).toHaveLength(1));
      expect(roy.clubs()).toHaveLength(1);
    });

    it("won't take over a Club somebody else made with that id", async () => {
      const world = createWorld();
      const roy = await person(world, "Roy");
      const ana = await person(world, "Ana");
      await ana.backend.createSharedClub({ id: "c1", name: "Hers", players: [] });
      await eventually(() => expect(ana.club("c1")).toBeDefined());

      const error = await rejection(
        roy.backend.makeSharedClub({ club: shared(roy), endedSessions: [], activeSession: null }),
      );

      expect(error.code).toBe("forbidden");
      expect(roy.clubs()).toEqual([]);
    });

    it("takes a big roster and a long history: more than one batch of each", async () => {
      const world = createWorld();
      const roy = await person(world, "Roy");
      const ana = await person(world, "Ana");
      const rows = Array.from({ length: 450 }, (_, i) => ({
        id: `p-${i}`,
        name: `Player ${i}`,
        skill: "intermediate" as const,
      }));
      const big = local({
        players: [{ id: "p-roy", name: "Roy S.", skill: "advanced" as const }, ...rows],
      });
      const history = Array.from({ length: 450 }, (_, i) =>
        makeClubEnded(makeClubSession(`Night ${i}`), 1_700_000_000_000 + i * 1000),
      );

      await roy.backend.makeSharedClub({
        club: shared(roy, big),
        endedSessions: history,
        activeSession: null,
      });
      await roy.backend.linkClubPlayer("c1", "p-0", ana.account.accountId, "player");

      await eventually(() => expect(ana.club("c1")?.players).toHaveLength(451), 30_000);
      // Everything is kept on the server; the newest 50 are what is listed.
      await eventually(() => expect(ana.ended()).toHaveLength(50), 30_000);
      expect(ana.ended()[0]?.endedAt).toBe(1_700_000_000_000 + 449 * 1000);
    }, 120_000);
  });
}
