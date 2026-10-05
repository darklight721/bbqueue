import { afterEach, describe, expect, it } from "vite-plus/test";
import type { Account, Club, ClubPlayer } from "../domain/types.ts";
import { eventually } from "../test/eventually.ts";
import { BackendError, type Backend } from "./backend.ts";

/** One simulated device (one person). Devices from the same world share one server. */
export interface Device {
  backend: Backend;
  setOnline: (online: boolean) => void;
}

export interface RolesContractWorld {
  /** A new device with nothing on it, sharing the world's server. */
  device(): Device;
}

const cat: ClubPlayer = { id: "p-cat", name: "Cat", skill: "beginner" };
const dan: ClubPlayer = { id: "p-dan", name: "Dan", skill: "advanced" };

/**
 * Linking Accounts to Club players, Roles and leaving, between two or three people. Run against
 * the in-memory and local fake versions and, on the emulator, Firebase.
 */
export function runRolesContract(name: string, createWorld: () => RolesContractWorld) {
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

  /** A person: a device with an Account, watching the Shared clubs it is on. */
  async function person(world: RolesContractWorld, accountName: string) {
    const device = world.device();
    const account: Account = await device.backend.createAccount(accountName);
    let latest: Club[] | null = null;
    stops.push(device.backend.observeSharedClubs((clubs) => (latest = clubs)));
    await eventually(() => expect(latest).not.toBeNull());
    return {
      ...device,
      account,
      clubs: () => latest ?? [],
      club: (id: string) => (latest ?? []).find((club) => club.id === id),
      row: (clubId: string, rowId: string) =>
        (latest ?? []).find((club) => club.id === clubId)?.players.find((p) => p.id === rowId),
    };
  }

  /** Roy runs Club c1 with Cat and Dan on the roster; Ana is a new person. */
  async function setup() {
    const world = createWorld();
    const roy = await person(world, "Roy");
    const ana = await person(world, "Ana");
    await roy.backend.createSharedClub({ id: "c1", name: "Tuesday", players: [cat, dan] });
    await eventually(() => expect(roy.club("c1")).toBeDefined());
    return { world, roy, ana };
  }

  describe(`Linking and Roles contract: ${name}`, () => {
    it("finds an Account by its Account ID in any capitalisation, and knows when there is none", async () => {
      const { roy, ana } = await setup();

      expect(await roy.backend.lookupAccount(ana.account.accountId.toUpperCase())).toEqual(
        ana.account,
      );
      expect(await roy.backend.lookupAccount(` ${ana.account.accountId} `)).toEqual(ana.account);
      expect(await roy.backend.lookupAccount("nobody-aaaa")).toBeNull();
    });

    it("needs a connection to look an Account up", async () => {
      const { roy, ana } = await setup();
      roy.setOnline(false);

      expect((await rejection(roy.backend.lookupAccount(ana.account.accountId))).code).toBe(
        "offline",
      );
    });

    it("lets an Organizer link a Club player to an Account, and that Account sees the Club straight away", async () => {
      const { roy, ana } = await setup();
      expect(ana.club("c1")).toBeUndefined();

      await roy.backend.linkClubPlayer("c1", cat.id, ana.account.accountId.toUpperCase(), "player");

      await eventually(() =>
        expect(ana.row("c1", cat.id)?.link).toEqual({
          accountId: ana.account.accountId,
          role: "player",
        }),
      );
      expect(ana.club("c1")?.name).toBe("Tuesday");
      await eventually(() => expect(roy.row("c1", cat.id)?.link?.role).toBe("player"));
    });

    it("rejects an Account ID nobody has", async () => {
      const { roy } = await setup();

      const error = await rejection(
        roy.backend.linkClubPlayer("c1", cat.id, "nobody-aaaa", "player"),
      );

      expect(error.code).toBe("unknown-account");
      expect(roy.row("c1", cat.id)?.link).toBeUndefined();
    });

    it("rejects linking an Account that is already on the roster", async () => {
      const { roy, ana } = await setup();
      await roy.backend.linkClubPlayer("c1", cat.id, ana.account.accountId, "player");

      const error = await rejection(
        roy.backend.linkClubPlayer("c1", dan.id, ana.account.accountId, "player"),
      );

      expect(error.code).toBe("already-linked");
    });

    it("needs a connection to link", async () => {
      const { roy, ana } = await setup();
      roy.setOnline(false);

      const error = await rejection(
        roy.backend.linkClubPlayer("c1", cat.id, ana.account.accountId, "player"),
      );

      expect(error.code).toBe("offline");
    });

    it("lets an Organizer add a Club player that is already linked", async () => {
      const { roy, ana } = await setup();
      const eve: ClubPlayer = {
        id: "p-eve",
        name: "Ana B.",
        skill: "beginner",
        link: { accountId: ana.account.accountId.toUpperCase(), role: "player" },
      };

      await roy.backend.addClubPlayer("c1", eve);

      await eventually(() =>
        expect(ana.row("c1", eve.id)?.link).toEqual({
          accountId: ana.account.accountId,
          role: "player",
        }),
      );
    });

    it("keeps a Player from changing the Club, its roster or Roles", async () => {
      const { roy, ana } = await setup();
      await roy.backend.linkClubPlayer("c1", cat.id, ana.account.accountId, "player");
      await eventually(() => expect(ana.club("c1")).toBeDefined());

      const attempts: [string, () => Promise<unknown>][] = [
        ["rename", () => ana.backend.renameSharedClub("c1", "Mine")],
        ["update a row", () => ana.backend.updateClubPlayer("c1", dan.id, { skill: "beginner" })],
        ["remove a row", () => ana.backend.removeClubPlayer("c1", dan.id)],
        [
          "add a row",
          () => ana.backend.addClubPlayer("c1", { id: "p-x", name: "X", skill: "beginner" }),
        ],
        ["promote", () => ana.backend.setClubPlayerRole("c1", cat.id, "organizer")],
        [
          "link",
          () => ana.backend.linkClubPlayer("c1", dan.id, roy.account.accountId, "organizer"),
        ],
        ["delete the Club", () => ana.backend.deleteSharedClub("c1")],
      ];
      for (const [what, attempt] of attempts) {
        expect([what, (await rejection(attempt())).code]).toEqual([what, "forbidden"]);
      }

      expect(roy.club("c1")?.name).toBe("Tuesday");
      expect(roy.club("c1")?.players.map((p) => p.id)).toContain(dan.id);
    });

    it("lets an Organizer promote and demote", async () => {
      const { roy, ana } = await setup();
      await roy.backend.linkClubPlayer("c1", cat.id, ana.account.accountId, "player");
      await eventually(() => expect(ana.club("c1")).toBeDefined());

      await roy.backend.setClubPlayerRole("c1", cat.id, "organizer");
      await eventually(() => expect(ana.row("c1", cat.id)?.link?.role).toBe("organizer"));
      await ana.backend.renameSharedClub("c1", "Friday");
      await eventually(() => expect(roy.club("c1")?.name).toBe("Friday"));

      await roy.backend.setClubPlayerRole("c1", cat.id, "player");
      await eventually(() => expect(ana.row("c1", cat.id)?.link?.role).toBe("player"));
      expect((await rejection(ana.backend.renameSharedClub("c1", "Again"))).code).toBe("forbidden");
    });

    it("needs a connection to change a Role", async () => {
      const { roy, ana } = await setup();
      await roy.backend.linkClubPlayer("c1", cat.id, ana.account.accountId, "player");
      roy.setOnline(false);

      expect((await rejection(roy.backend.setClubPlayerRole("c1", cat.id, "organizer"))).code).toBe(
        "offline",
      );
    });

    it("never leaves the Club without an Organizer", async () => {
      const { roy } = await setup();
      const royRow = roy
        .club("c1")!
        .players.find((p) => p.link?.accountId === roy.account.accountId)!;

      expect((await rejection(roy.backend.setClubPlayerRole("c1", royRow.id, "player"))).code).toBe(
        "last-organizer",
      );
      expect((await rejection(roy.backend.unlinkClubPlayer("c1", royRow.id))).code).toBe(
        "last-organizer",
      );
      expect((await rejection(roy.backend.removeClubPlayer("c1", royRow.id))).code).toBe(
        "last-organizer",
      );
      expect((await rejection(roy.backend.leaveClub("c1"))).code).toBe("last-organizer");
      expect(roy.row("c1", royRow.id)?.link?.role).toBe("organizer");
    });

    it("lets a Player leave: the Club goes from their list, their row stays, unlinked", async () => {
      const { roy, ana } = await setup();
      await roy.backend.linkClubPlayer("c1", cat.id, ana.account.accountId, "player");
      await eventually(() => expect(ana.club("c1")).toBeDefined());

      await ana.backend.leaveClub("c1");

      await eventually(() => expect(ana.club("c1")).toBeUndefined());
      await eventually(() => expect(roy.row("c1", cat.id)).toEqual(cat));
    });

    it("lets an Organizer leave once another Organizer exists", async () => {
      const { roy, ana } = await setup();
      await roy.backend.linkClubPlayer("c1", cat.id, ana.account.accountId, "organizer");
      await eventually(() => expect(ana.club("c1")).toBeDefined());

      await roy.backend.leaveClub("c1");

      await eventually(() => expect(roy.club("c1")).toBeUndefined());
      await eventually(() =>
        expect(ana.club("c1")?.players.filter((p) => p.link?.role === "organizer")).toHaveLength(1),
      );
    });

    it("needs a connection to leave", async () => {
      const { roy, ana } = await setup();
      await roy.backend.linkClubPlayer("c1", cat.id, ana.account.accountId, "player");
      await eventually(() => expect(ana.club("c1")).toBeDefined());
      ana.setOnline(false);

      expect((await rejection(ana.backend.leaveClub("c1"))).code).toBe("offline");
    });

    it("lets an Organizer unlink an Account: the Club goes from its list, the row stays", async () => {
      const { roy, ana } = await setup();
      await roy.backend.linkClubPlayer("c1", cat.id, ana.account.accountId, "player");
      await eventually(() => expect(ana.club("c1")).toBeDefined());

      await roy.backend.unlinkClubPlayer("c1", cat.id);

      await eventually(() => expect(ana.club("c1")).toBeUndefined());
      await eventually(() => expect(roy.row("c1", cat.id)).toEqual(cat));
    });

    it("lets an Organizer unlink another Organizer: they lose their access, the Club keeps an Organizer", async () => {
      const { roy, ana } = await setup();
      await roy.backend.linkClubPlayer("c1", cat.id, ana.account.accountId, "organizer");
      await eventually(() => expect(ana.club("c1")).toBeDefined());

      await roy.backend.unlinkClubPlayer("c1", cat.id);

      await eventually(() => expect(ana.club("c1")).toBeUndefined());
      await eventually(() => expect(roy.row("c1", cat.id)).toEqual(cat));
      // Firestore refuses (forbidden); the simulated servers know no such Club for her (not-found).
      expect(["forbidden", "not-found"]).toContain(
        (await rejection(ana.backend.renameSharedClub("c1", "Mine"))).code,
      );
      await roy.backend.renameSharedClub("c1", "Still Roy's");
      await eventually(() => expect(roy.club("c1")?.name).toBe("Still Roy's"));
    });

    it("keeps a Player from unlinking another Account", async () => {
      const { world, roy, ana } = await setup();
      const ben = await person(world, "Ben");
      await roy.backend.linkClubPlayer("c1", cat.id, ana.account.accountId, "player");
      await roy.backend.linkClubPlayer("c1", dan.id, ben.account.accountId, "player");
      await eventually(() => expect(ana.club("c1")).toBeDefined());
      await eventually(() => expect(ben.club("c1")).toBeDefined());

      expect((await rejection(ana.backend.unlinkClubPlayer("c1", dan.id))).code).toBe("forbidden");

      expect(roy.row("c1", dan.id)?.link?.accountId).toBe(ben.account.accountId);
      expect(ben.club("c1")).toBeDefined();
    });

    it("lets an Organizer unlink an Account and link it to another row", async () => {
      const { roy, ana } = await setup();
      await roy.backend.linkClubPlayer("c1", cat.id, ana.account.accountId, "player");
      await eventually(() => expect(ana.club("c1")).toBeDefined());

      await roy.backend.unlinkClubPlayer("c1", cat.id);
      await eventually(() => expect(ana.club("c1")).toBeUndefined());
      await roy.backend.linkClubPlayer("c1", dan.id, ana.account.accountId, "player");

      await eventually(() => expect(ana.row("c1", dan.id)?.link?.role).toBe("player"));
      expect(roy.row("c1", cat.id)).toEqual(cat);
    });

    it("takes an Account off the Club when its row is removed", async () => {
      const { roy, ana } = await setup();
      await roy.backend.linkClubPlayer("c1", cat.id, ana.account.accountId, "player");
      await eventually(() => expect(ana.club("c1")).toBeDefined());

      await roy.backend.removeClubPlayer("c1", cat.id);

      await eventually(() => expect(ana.club("c1")).toBeUndefined());
      await eventually(() => expect(roy.row("c1", cat.id)).toBeUndefined());
    });

    it("moves a link from one Account to another: the first leaves the Club, the second joins it", async () => {
      const { world, roy, ana } = await setup();
      const ben = await person(world, "Ben");
      await roy.backend.linkClubPlayer("c1", cat.id, ana.account.accountId, "player");
      await eventually(() => expect(ana.club("c1")).toBeDefined());

      await roy.backend.linkClubPlayer("c1", cat.id, ben.account.accountId, "organizer");

      await eventually(() => expect(ben.row("c1", cat.id)?.link?.role).toBe("organizer"));
      await eventually(() => expect(ana.club("c1")).toBeUndefined());
      expect(roy.row("c1", cat.id)?.link?.accountId).toBe(ben.account.accountId);
    });

    it("only finds an Account by the Account ID it really has", async () => {
      const { roy, ana } = await setup();
      const [slug, suffix] = ana.account.accountId.split("-") as [string, string];

      expect(await roy.backend.lookupAccount(`${slug}-${suffix}x`)).toBeNull();
      expect(await roy.backend.lookupAccount(`x${slug}-${suffix}`)).toBeNull();
      expect(await roy.backend.lookupAccount(ana.account.accountId.toUpperCase())).toEqual(
        ana.account,
      );
    });

    it("shows a Player what an Organizer does, live", async () => {
      const { roy, ana } = await setup();
      await roy.backend.linkClubPlayer("c1", cat.id, ana.account.accountId, "player");
      await eventually(() => expect(ana.club("c1")).toBeDefined());

      await roy.backend.renameSharedClub("c1", "Friday");
      await roy.backend.updateClubPlayer("c1", dan.id, { skill: "beginner" });

      await eventually(() => expect(ana.club("c1")?.name).toBe("Friday"));
      await eventually(() => expect(ana.row("c1", dan.id)?.skill).toBe("beginner"));
    });

    describe("creating a Club with links (ADR-0008)", () => {
      /** Roy and Ana, no Club yet; Ben is a third person. */
      async function three() {
        const world = createWorld();
        const roy = await person(world, "Roy");
        const ana = await person(world, "Ana");
        const ben = await person(world, "Ben");
        return { roy, ana, ben };
      }
      const royRow = (accountId: string, patch: Partial<ClubPlayer> = {}): ClubPlayer => ({
        id: "p-roy",
        name: "Roy B.",
        skill: "advanced",
        link: { accountId, role: "organizer" },
        ...patch,
      });

      it("keeps the creator's own row as given, and links other Accounts as Player and as Organizer in one write", async () => {
        const { roy, ana, ben } = await three();
        const anaRow: ClubPlayer = {
          id: "p-ana",
          name: "Ana",
          skill: "beginner",
          link: { accountId: ana.account.accountId.toUpperCase(), role: "player" },
        };
        const benRow: ClubPlayer = {
          id: "p-ben",
          name: "Ben",
          skill: "intermediate",
          link: { accountId: ben.account.accountId, role: "organizer" },
        };

        const created = await roy.backend.createSharedClub({
          id: "c1",
          name: "Tuesday",
          players: [royRow(roy.account.accountId.toUpperCase()), anaRow, benRow, cat],
        });

        expect(created.players.map((p) => p.id)).toEqual(["p-roy", "p-ana", "p-ben", "p-cat"]);
        expect(created.players[0]).toEqual(royRow(roy.account.accountId));
        expect(created.players[1]?.link).toEqual({
          accountId: ana.account.accountId,
          role: "player",
        });
        for (const person of [roy, ana, ben]) {
          await eventually(() => expect(person.club("c1")?.players).toHaveLength(4));
        }
        expect(ana.row("c1", "p-ana")?.link?.role).toBe("player");
        expect(ben.row("c1", "p-ben")?.link?.role).toBe("organizer");
        expect(ana.row("c1", "p-roy")).toMatchObject({ name: "Roy B.", skill: "advanced" });

        // The lists agree: the linked Organizer may change the Club, the linked Player may not.
        await ben.backend.renameSharedClub("c1", "Friday");
        await eventually(() => expect(roy.club("c1")?.name).toBe("Friday"));
        expect((await rejection(ana.backend.renameSharedClub("c1", "Nope"))).code).toBe(
          "forbidden",
        );
      });

      it("adds the default creator row when none is given", async () => {
        const { roy, ana } = await three();

        const created = await roy.backend.createSharedClub({
          id: "c1",
          name: "Tuesday",
          players: [
            {
              id: "p-ana",
              name: "Ana",
              skill: "beginner",
              link: { accountId: ana.account.accountId, role: "player" },
            },
          ],
        });

        expect(created.players).toHaveLength(2);
        expect(created.players[0]).toMatchObject({
          name: "Roy",
          skill: "intermediate",
          link: { accountId: roy.account.accountId, role: "organizer" },
        });
        await eventually(() => expect(ana.club("c1")).toBeDefined());
      });

      it("rejects an Account ID nobody has, and writes nothing", async () => {
        const { roy, ana } = await three();

        const error = await rejection(
          roy.backend.createSharedClub({
            id: "c1",
            name: "Tuesday",
            players: [
              royRow(roy.account.accountId),
              {
                id: "p-ana",
                name: "Ana",
                skill: "beginner",
                link: { accountId: ana.account.accountId, role: "player" },
              },
              {
                id: "p-ghost",
                name: "Ghost",
                skill: "beginner",
                link: { accountId: "nobody-aaaa", role: "player" },
              },
            ],
          }),
        );

        expect(error.code).toBe("unknown-account");
        await roy.backend.getCurrentAccount();
        expect(roy.club("c1")).toBeUndefined();
        expect(ana.club("c1")).toBeUndefined();
      });

      it("rejects a creator row that isn't an Organizer, and writes nothing", async () => {
        const { roy } = await three();

        const error = await rejection(
          roy.backend.createSharedClub({
            id: "c1",
            name: "Tuesday",
            players: [
              royRow(roy.account.accountId, {
                link: { accountId: roy.account.accountId, role: "player" },
              }),
            ],
          }),
        );

        expect(error.code).toBe("forbidden");
        await roy.backend.getCurrentAccount();
        expect(roy.club("c1")).toBeUndefined();
      });

      it("rejects an Account linked twice, also the creator's own", async () => {
        const { roy, ana } = await three();
        const anaRow = (id: string): ClubPlayer => ({
          id,
          name: id,
          skill: "beginner",
          link: { accountId: ana.account.accountId, role: "player" },
        });

        const twice = await rejection(
          roy.backend.createSharedClub({
            id: "c1",
            name: "Tuesday",
            players: [anaRow("a"), anaRow("b")],
          }),
        );
        const self = await rejection(
          roy.backend.createSharedClub({
            id: "c2",
            name: "Tuesday",
            players: [
              royRow(roy.account.accountId),
              royRow(roy.account.accountId, { id: "p-roy2" }),
            ],
          }),
        );

        expect(twice.code).toBe("already-linked");
        expect(self.code).toBe("already-linked");
        expect(roy.clubs()).toEqual([]);
      });

      it("needs a connection only when it links another Account", async () => {
        const { roy, ana } = await three();
        roy.setOnline(false);

        const error = await rejection(
          roy.backend.createSharedClub({
            id: "c1",
            name: "Tuesday",
            players: [
              {
                id: "p-ana",
                name: "Ana",
                skill: "beginner",
                link: { accountId: ana.account.accountId, role: "player" },
              },
            ],
          }),
        );

        expect(error.code).toBe("offline");
      });
    });
  });
}
