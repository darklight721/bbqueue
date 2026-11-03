import { afterEach, describe, expect, it } from "vite-plus/test";
import { isJoinToken } from "../domain/joinLink.ts";
import type { Account, Club, ClubPlayer } from "../domain/types.ts";
import { eventually } from "../test/eventually.ts";
import type { BackendError } from "./backend.ts";
import type { RolesContractWorld } from "./backend.roles.contract.ts";

const cat: ClubPlayer = { id: "p-cat", name: "Cat Lee", skill: "beginner" };
const dan: ClubPlayer = { id: "p-dan", name: "Dan", skill: "advanced" };

/**
 * Join links (ADR-0010): an Organizer shares one, and somebody who isn't on the Club Claims an
 * unlinked Club player by name. Run against the in-memory and local fake versions and, on the
 * emulator, Firebase.
 */
export function runJoinLinkContract(name: string, createWorld: () => RolesContractWorld) {
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

  /**
   * A device watching the Shared clubs its Account is on, with an Account when `accountName` is
   * given.
   */
  async function person(world: RolesContractWorld, accountName?: string) {
    const device = world.device();
    const account: Account | null = accountName
      ? await device.backend.createAccount(accountName)
      : null;
    let latest: Club[] | null = null;
    stops.push(device.backend.observeSharedClubs((clubs) => (latest = clubs)));
    await eventually(() => expect(latest).not.toBeNull());
    return {
      ...device,
      account,
      club: (id: string) => (latest ?? []).find((club) => club.id === id),
      row: (clubId: string, rowId: string) =>
        (latest ?? []).find((club) => club.id === clubId)?.players.find((p) => p.id === rowId),
    };
  }

  /** Roy runs Club c1 ("Tuesday") with Cat Lee and Dan unlinked; Ana has an Account and no Club. */
  async function setup() {
    const world = createWorld();
    const roy = await person(world, "Roy");
    const ana = await person(world, "Ana");
    await roy.backend.createSharedClub({ id: "c1", name: "Tuesday", players: [cat, dan] });
    await eventually(() => expect(roy.club("c1")).toBeDefined());
    return { world, roy, ana };
  }

  describe(`Join link contract: ${name}`, () => {
    it("gives an Organizer one Join link per Club, made on first use and on the Club from then on", async () => {
      const { roy } = await setup();
      expect(roy.club("c1")?.joinToken).toBeUndefined();

      const token = await roy.backend.getJoinLink("c1");

      expect(isJoinToken(token)).toBe(true);
      expect(await roy.backend.getJoinLink("c1")).toBe(token);
      await eventually(() => expect(roy.club("c1")?.joinToken).toBe(token));
    });

    it("needs a connection to make the Join link, but not to get it once made", async () => {
      const { roy } = await setup();
      roy.setOnline(false);
      expect((await rejection(roy.backend.getJoinLink("c1"))).code).toBe("offline");

      roy.setOnline(true);
      const token = await roy.backend.getJoinLink("c1");
      await eventually(() => expect(roy.club("c1")?.joinToken).toBe(token));
      roy.setOnline(false);
      expect(await roy.backend.getJoinLink("c1")).toBe(token);
      expect((await rejection(roy.backend.resetJoinLink("c1"))).code).toBe("offline");
    });

    it("refuses a Player the Join link", async () => {
      const { roy, ana } = await setup();
      await roy.backend.linkClubPlayer("c1", "p-cat", ana.account!.accountId, "player");
      await eventually(() => expect(ana.club("c1")).toBeDefined());

      expect((await rejection(ana.backend.getJoinLink("c1"))).code).toBe("forbidden");
      expect((await rejection(ana.backend.resetJoinLink("c1"))).code).toBe("forbidden");
    });

    it("tells anyone holding the link which Club it is for, also without an Account, following a rename", async () => {
      const { world, roy } = await setup();
      const token = await roy.backend.getJoinLink("c1");
      const stranger = await person(world);

      expect(await stranger.backend.getJoinLinkInfo(token)).toEqual({
        clubId: "c1",
        clubName: "Tuesday",
      });
      await roy.backend.renameSharedClub("c1", "Thursday");
      await eventually(async () =>
        expect(await stranger.backend.getJoinLinkInfo(token)).toEqual({
          clubId: "c1",
          clubName: "Thursday",
        }),
      );
      expect(await stranger.backend.getJoinLinkInfo("AbCdEfGhIjKlMnOpQr_-12")).toBeNull();
    });

    it("finds a Club player by name, ignoring case and extra spaces, and nothing fuzzy", async () => {
      const { world, roy } = await setup();
      const token = await roy.backend.getJoinLink("c1");
      const stranger = await person(world);

      expect(await stranger.backend.findJoinLinkName(token, "  cat   LEE ")).toEqual({
        playerId: "p-cat",
        linked: false,
      });
      expect(await stranger.backend.findJoinLinkName(token, "Roy")).toMatchObject({
        linked: true,
      });
      expect(await stranger.backend.findJoinLinkName(token, "Cat")).toBeNull();
      expect(await stranger.backend.findJoinLinkName(token, "Nobody")).toBeNull();
    });

    it("keeps the names in step with the roster: added, renamed, removed, linked and unlinked", async () => {
      const { roy, ana } = await setup();
      const token = await roy.backend.getJoinLink("c1");
      const find = (who: string) => ana.backend.findJoinLinkName(token, who);

      await roy.backend.addClubPlayer("c1", { id: "p-eve", name: "Eve", skill: "beginner" });
      await roy.backend.updateClubPlayer("c1", "p-dan", { name: "Daniel" });
      await roy.backend.removeClubPlayer("c1", "p-cat");
      await eventually(async () => {
        expect(await find("Eve")).toEqual({ playerId: "p-eve", linked: false });
        expect(await find("Daniel")).toEqual({ playerId: "p-dan", linked: false });
        expect(await find("Dan")).toBeNull();
        expect(await find("Cat Lee")).toBeNull();
      });

      await roy.backend.linkClubPlayer("c1", "p-eve", ana.account!.accountId, "player");
      await eventually(async () => expect(await find("Eve")).toMatchObject({ linked: true }));
      await roy.backend.unlinkClubPlayer("c1", "p-eve");
      await eventually(async () => expect(await find("Eve")).toMatchObject({ linked: false }));
    });

    it("keeps a name when two rows swap names", async () => {
      const { roy, ana } = await setup();
      const token = await roy.backend.getJoinLink("c1");

      await roy.backend.updateClubPlayer("c1", "p-cat", { name: "Dan" });
      await roy.backend.updateClubPlayer("c1", "p-dan", { name: "Cat Lee" });

      await eventually(async () => {
        expect(await ana.backend.findJoinLinkName(token, "Dan")).toMatchObject({
          playerId: "p-cat",
        });
        expect(await ana.backend.findJoinLinkName(token, "Cat Lee")).toMatchObject({
          playerId: "p-dan",
        });
      });
    });

    it("lets somebody who isn't on the Club Claim an unlinked Club player: linked as a Player, nothing else changed", async () => {
      const { roy, ana } = await setup();
      const token = await roy.backend.getJoinLink("c1");

      expect(await ana.backend.claimClubPlayer(token, "cat lee")).toEqual({ clubId: "c1" });

      await eventually(() =>
        expect(ana.row("c1", "p-cat")).toEqual({
          ...cat,
          link: { accountId: ana.account!.accountId, role: "player" },
        }),
      );
      await eventually(() =>
        expect(roy.row("c1", "p-cat")?.link).toEqual({
          accountId: ana.account!.accountId,
          role: "player",
        }),
      );
      expect(await roy.backend.findJoinLinkName(token, "Cat Lee")).toMatchObject({ linked: true });
    });

    it("refuses a Claim of a Club player that is linked already", async () => {
      const { world, roy, ana } = await setup();
      const token = await roy.backend.getJoinLink("c1");
      await ana.backend.claimClubPlayer(token, "Cat Lee");
      const ben = await person(world, "Ben");

      expect((await rejection(ben.backend.claimClubPlayer(token, "Cat Lee"))).code).toBe(
        "already-claimed",
      );
      expect((await rejection(ben.backend.claimClubPlayer(token, "Roy"))).code).toBe(
        "already-claimed",
      );
      expect(ben.club("c1")).toBeUndefined();
    });

    it("refuses a second Claim by somebody on the Club already", async () => {
      const { roy, ana } = await setup();
      const token = await roy.backend.getJoinLink("c1");
      await ana.backend.claimClubPlayer(token, "Cat Lee");

      expect((await rejection(ana.backend.claimClubPlayer(token, "Dan"))).code).toBe(
        "already-linked",
      );
      expect((await rejection(roy.backend.claimClubPlayer(token, "Dan"))).code).toBe(
        "already-linked",
      );
    });

    it("refuses a Claim of a name nobody has, without an Account, or offline", async () => {
      const { world, roy, ana } = await setup();
      const token = await roy.backend.getJoinLink("c1");

      expect((await rejection(ana.backend.claimClubPlayer(token, "Nobody"))).code).toBe(
        "not-found",
      );
      const stranger = await person(world);
      expect((await rejection(stranger.backend.claimClubPlayer(token, "Dan"))).code).toBe(
        "no-account",
      );
      ana.setOnline(false);
      expect((await rejection(ana.backend.claimClubPlayer(token, "Dan"))).code).toBe("offline");
      expect((await rejection(ana.backend.getJoinLinkInfo(token))).code).toBe("offline");
      expect((await rejection(ana.backend.findJoinLinkName(token, "Dan"))).code).toBe("offline");
    });

    it("stops the old link working at once on a reset, and people already linked stay linked", async () => {
      const { world, roy, ana } = await setup();
      const old = await roy.backend.getJoinLink("c1");
      await ana.backend.claimClubPlayer(old, "Cat Lee");

      const fresh = await roy.backend.resetJoinLink("c1");

      expect(fresh).not.toBe(old);
      expect(isJoinToken(fresh)).toBe(true);
      await eventually(() => expect(roy.club("c1")?.joinToken).toBe(fresh));
      const ben = await person(world, "Ben");
      expect(await ben.backend.getJoinLinkInfo(old)).toBeNull();
      expect(await ben.backend.findJoinLinkName(old, "Dan")).toBeNull();
      expect((await rejection(ben.backend.claimClubPlayer(old, "Dan"))).code).toBe("not-found");
      expect(await ben.backend.findJoinLinkName(fresh, "Cat Lee")).toMatchObject({ linked: true });
      expect(await ben.backend.claimClubPlayer(fresh, "Dan")).toEqual({ clubId: "c1" });
      expect(ana.row("c1", "p-cat")?.link?.accountId).toBe(ana.account!.accountId);
    });

    it("marks the name unlinked when the one who Claimed it leaves, so it can be Claimed again", async () => {
      const { world, roy, ana } = await setup();
      const token = await roy.backend.getJoinLink("c1");
      await ana.backend.claimClubPlayer(token, "Cat Lee");
      await eventually(() => expect(ana.club("c1")).toBeDefined());

      await ana.backend.leaveClub("c1");

      await eventually(async () =>
        expect(await roy.backend.findJoinLinkName(token, "Cat Lee")).toMatchObject({
          linked: false,
        }),
      );
      const ben = await person(world, "Ben");
      expect(await ben.backend.claimClubPlayer(token, "Cat Lee")).toEqual({ clubId: "c1" });
    });

    it("stops the link working when the Club is deleted", async () => {
      const { roy, ana } = await setup();
      const token = await roy.backend.getJoinLink("c1");

      await roy.backend.deleteSharedClub("c1");

      await eventually(async () => expect(await ana.backend.getJoinLinkInfo(token)).toBeNull());
      expect(await ana.backend.findJoinLinkName(token, "Dan")).toBeNull();
    });
  });
}
