import { afterEach, describe, expect, it } from "vite-plus/test";
import type { Account, ActiveSession, Club, EndedSession } from "../domain/types.ts";
import { eventually } from "../test/eventually.ts";
import { BackendError } from "./backend.ts";
import type { RolesContractWorld } from "./backend.roles.contract.ts";
import { makeClubEnded, makeClubSession } from "./backend.sessions.contract.ts";

/**
 * Deleting an Account (ticket 11) on a Backend, between Roy (who deletes his Account) and Ana: the
 * Shared clubs he is the only Account of go, he is unlinked from the others (his row stays), the
 * Account goes, and a Session he hosts is left for somebody else to take over.
 */
export function runDeleteAccountContract(name: string, createWorld: () => RolesContractWorld) {
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
    let clubs: Club[] | null = null;
    let ended: EndedSession[] = [];
    let active: ActiveSession[] = [];
    stops.push(
      device.backend.observeSharedClubs((list) => (clubs = list)),
      device.backend.observeEndedSessions((report) => (ended = report.sessions)),
      device.backend.observeActiveSessions((report) => (active = report.sessions)),
    );
    await eventually(() => expect(clubs).not.toBeNull());
    return {
      ...device,
      account,
      clubs: () => clubs ?? [],
      club: (id: string) => (clubs ?? []).find((c) => c.id === id),
      ended: () => ended,
      active: () => active,
    };
  }

  /**
   * - "solo": only Roy is linked (Cat is a plain row); it has an Ended session.
   * - "duo": Roy and Ana are Organizers; Roy hosts a running Session.
   * - "stuck": Roy is the only Organizer, Ana a Player.
   */
  async function setup() {
    const world = createWorld();
    const roy = await person(world, "Roy");
    const ana = await person(world, "Ana");
    const cat = { id: "p-cat", name: "Cat", skill: "beginner" as const };
    await roy.backend.createSharedClub({ id: "solo", name: "Solo", players: [cat] });
    await roy.backend.createSharedClub({
      id: "duo",
      name: "Duo",
      players: [{ ...cat, id: "d-ana", name: "Ana" }],
    });
    await roy.backend.createSharedClub({
      id: "stuck",
      name: "Stuck",
      players: [{ ...cat, id: "s-ana", name: "Ana" }],
    });
    await roy.backend.linkClubPlayer("duo", "d-ana", ana.account.accountId, "organizer");
    await roy.backend.linkClubPlayer("stuck", "s-ana", ana.account.accountId, "player");

    const night = makeClubSession("Solo night", "solo");
    await roy.backend.startSharedSession("solo", night);
    await roy.backend.endSharedSession("solo", makeClubEnded(night, 1_700_000_000_000));
    await roy.backend.startSharedSession("duo", makeClubSession("Duo night", "duo"));
    await eventually(() => expect(roy.club("stuck")?.players).toHaveLength(2));
    await eventually(() => expect(ana.club("duo")).toBeDefined());
    await eventually(() => expect(ana.active()).toHaveLength(1));
    return { world, roy, ana };
  }

  describe(`Delete Account contract: ${name}`, () => {
    it("deletes the Clubs Roy is the only Account of, unlinks him elsewhere, and the Account goes", async () => {
      const { roy, ana } = await setup();

      await roy.backend.deleteAccount({ deleteClubIds: ["solo"], unlinkClubIds: ["duo"] });

      expect(await roy.backend.getCurrentAccount()).toBeNull();
      // Nobody can find him any more.
      expect(await ana.backend.lookupAccount(roy.account.accountId)).toBeNull();
      // His row in Duo stays on the roster, as a plain Club player, and Ana still sees the Club.
      await eventually(() => {
        const rows = ana.club("duo")?.players ?? [];
        expect(rows).toHaveLength(2);
        expect(rows.filter((row) => row.link).map((row) => row.link?.accountId)).toEqual([
          ana.account.accountId,
        ]);
      });
      // Solo is gone, with its history.
      expect(ana.club("solo")).toBeUndefined();
    });

    it("leaves a Session Roy hosted for another Organizer to take over", async () => {
      const { roy, ana } = await setup();

      await roy.backend.deleteAccount({ deleteClubIds: ["solo"], unlinkClubIds: ["duo"] });

      await eventually(() => expect(ana.active().map((s) => s.clubId)).toEqual(["duo"]));
      const taken = await ana.backend.takeOverSession("duo");
      expect(taken.hostAccountId).toBe(ana.account.accountId);
      await ana.backend.publishActiveSession("duo", makeClubSession("Ana's now", "duo"));
    });

    it("lets a Player who is only a Player delete their Account too", async () => {
      const { ana } = await setup();

      await ana.backend.deleteAccount({ deleteClubIds: [], unlinkClubIds: ["duo", "stuck"] });

      expect(await ana.backend.getCurrentAccount()).toBeNull();
    });

    it("refuses when Roy would leave a Club with no Organizer, before changing anything", async () => {
      const { roy } = await setup();

      const error = await rejection(
        roy.backend.deleteAccount({ deleteClubIds: ["solo"], unlinkClubIds: ["duo", "stuck"] }),
      );

      expect(error.code).toBe("last-organizer");
      expect(await roy.backend.getCurrentAccount()).toEqual(roy.account);
      expect(roy.club("solo")).toBeDefined();
      expect(
        roy.club("duo")?.players.some((row) => row.link?.accountId === roy.account.accountId),
      ).toBe(true);
    });

    it("refuses to delete a Club that has another linked Account, before changing anything", async () => {
      const { roy } = await setup();

      const error = await rejection(
        roy.backend.deleteAccount({ deleteClubIds: ["solo", "duo"], unlinkClubIds: [] }),
      );

      expect(error.code).toBe("forbidden");
      expect(await roy.backend.getCurrentAccount()).toEqual(roy.account);
      expect(roy.club("solo")).toBeDefined();
      expect(roy.club("duo")).toBeDefined();
    });

    it("needs a connection and an Account", async () => {
      const { world, roy } = await setup();
      roy.setOnline(false);

      expect(
        (await rejection(roy.backend.deleteAccount({ deleteClubIds: [], unlinkClubIds: [] }))).code,
      ).toBe("offline");
      expect(await roy.backend.getCurrentAccount()).toEqual(roy.account);

      const stranger = world.device();
      expect(
        (await rejection(stranger.backend.deleteAccount({ deleteClubIds: [], unlinkClubIds: [] })))
          .code,
      ).toBe("no-account");
    });

    it("can be run again for the Clubs that are left after a stop part-way", async () => {
      const { roy } = await setup();
      await roy.backend.deleteSharedClub("solo");

      // Solo is already gone: nothing to do for it.
      await roy.backend.deleteAccount({ deleteClubIds: ["solo"], unlinkClubIds: ["duo"] });

      expect(await roy.backend.getCurrentAccount()).toBeNull();
    });
  });
}
