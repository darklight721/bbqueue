import { afterEach, describe, expect, it } from "vite-plus/test";
import { createRng, createSession } from "../domain/engine/index.ts";
import type { Account, ActiveSession, Session } from "../domain/types.ts";
import { eventually } from "../test/eventually.ts";
import { BackendError } from "./backend.ts";
import type { RolesContractWorld } from "./backend.roles.contract.ts";

/** A small Session for a Shared club; `name` tells copies apart. */
export function makeClubSession(name = "Tuesday night", clubId = "c1"): Session {
  return createSession(
    {
      name,
      clubId,
      clubName: "Tuesday",
      pointSystem: 21,
      plannedHours: 2,
      courts: 1,
      players: ["Ana", "Ben", "Cat", "Dan"].map((player) => ({
        name: player,
        skill: "intermediate" as const,
      })),
    },
    { now: 1_700_000_000_000, rng: createRng(3) },
  );
}

/**
 * The Shared Active session (ticket 06, ADR-0007) between three people: Roy (Organizer and Session
 * host), Ana (a Player on the Club) and Ben (not on the Club). Run against the in-memory and local
 * fake versions and, on the emulator, Firebase.
 */
export function runSessionsContract(name: string, createWorld: () => RolesContractWorld) {
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

  /** A person: a device with an Account, watching the Active sessions it may see. */
  async function person(world: RolesContractWorld, accountName: string) {
    const device = world.device();
    const account: Account = await device.backend.createAccount(accountName);
    let latest: ActiveSession[] | null = null;
    stops.push(
      device.backend.observeActiveSessions((report) => {
        latest = report.sessions;
      }),
    );
    await eventually(() => expect(latest).not.toBeNull());
    return {
      ...device,
      account,
      sessions: () => latest ?? [],
      session: (clubId: string) => (latest ?? []).find((s) => s.clubId === clubId),
    };
  }

  /** Roy runs Club c1; Ana is a Player on it; Ben isn't on it. */
  async function setup() {
    const world = createWorld();
    const roy = await person(world, "Roy");
    const ana = await person(world, "Ana");
    const ben = await person(world, "Ben");
    await roy.backend.createSharedClub({
      id: "c1",
      name: "Tuesday",
      players: [{ id: "p-ana", name: "Ana", skill: "beginner" }],
    });
    await roy.backend.linkClubPlayer("c1", "p-ana", ana.account.accountId, "player");
    return { roy, ana, ben };
  }

  describe(`Shared Active session contract: ${name}`, () => {
    it("lets an Organizer start the Club's Active session as its Session host", async () => {
      const { roy, ana, ben } = await setup();
      const session = makeClubSession();

      const started = await roy.backend.startSharedSession("c1", session);

      expect(started).toMatchObject({
        clubId: "c1",
        session,
        hostAccountId: roy.account.accountId,
        hostName: "Roy",
      });
      await eventually(() => expect(roy.session("c1")?.session).toEqual(session));
      await eventually(() => expect(ana.session("c1")).toMatchObject({ session, hostName: "Roy" }));
      expect(ana.session("c1")?.hostAccountId).toBe(roy.account.accountId);
      expect(ana.session("c1")?.updatedAt).toBeGreaterThan(0);
      // Not on the Club: nothing to see.
      expect(ben.sessions()).toEqual([]);
    });

    it("shows a session that is already running to somebody who joins the Club later", async () => {
      const { roy, ben } = await setup();
      const session = makeClubSession();
      await roy.backend.startSharedSession("c1", session);
      await roy.backend.addClubPlayer("c1", { id: "p-ben", name: "Ben", skill: "beginner" });

      await roy.backend.linkClubPlayer("c1", "p-ben", ben.account.accountId, "player");

      await eventually(() => expect(ben.session("c1")?.session).toEqual(session));
    });

    it("stops a second Active session for the same Club", async () => {
      const { roy } = await setup();
      await roy.backend.startSharedSession("c1", makeClubSession("First"));

      const error = await rejection(
        roy.backend.startSharedSession("c1", makeClubSession("Second")),
      );

      expect(error.code).toBe("session-exists");
      await eventually(() => expect(roy.session("c1")?.session.name).toBe("First"));
    });

    it("only lets an Organizer start one", async () => {
      const { ana, ben } = await setup();

      expect((await rejection(ana.backend.startSharedSession("c1", makeClubSession()))).code).toBe(
        "forbidden",
      );
      expect((await rejection(ben.backend.startSharedSession("c1", makeClubSession()))).code).toBe(
        "not-found",
      );
      expect(
        (await rejection(ana.backend.startSharedSession("nope", makeClubSession()))).code,
      ).toBe("not-found");
    });

    it("needs a connection to start", async () => {
      const { roy } = await setup();
      roy.setOnline(false);

      const error = await rejection(roy.backend.startSharedSession("c1", makeClubSession()));

      expect(error.code).toBe("offline");
    });

    it("lets the Session host publish the latest copy, which everybody on the Club sees", async () => {
      const { roy, ana } = await setup();
      await roy.backend.startSharedSession("c1", makeClubSession("Before"));
      await eventually(() => expect(ana.session("c1")).toBeDefined());
      const firstUpdate = ana.session("c1")!.updatedAt;
      await new Promise((resolve) => setTimeout(resolve, 20));

      const next = makeClubSession("After");
      await roy.backend.publishActiveSession("c1", next);

      await eventually(() => expect(ana.session("c1")?.session.name).toBe("After"));
      expect(ana.session("c1")?.session).toEqual(next);
      expect(ana.session("c1")?.updatedAt).toBeGreaterThanOrEqual(firstUpdate);
      // The host stays the host.
      expect(ana.session("c1")?.hostAccountId).toBe(roy.account.accountId);
    });

    it("only lets the Session host publish", async () => {
      const { roy, ana, ben } = await setup();
      await roy.backend.startSharedSession("c1", makeClubSession("Mine"));
      await eventually(() => expect(ana.session("c1")).toBeDefined());
      await eventually(() => expect(roy.session("c1")).toBeDefined());

      expect(
        (await rejection(ana.backend.publishActiveSession("c1", makeClubSession("Hijack")))).code,
      ).toBe("forbidden");
      expect(
        (await rejection(ben.backend.publishActiveSession("c1", makeClubSession("Hijack")))).code,
      ).toBe("not-found");

      expect(roy.session("c1")?.session.name).toBe("Mine");
      expect(ana.session("c1")?.session.name).toBe("Mine");
    });

    it("says not-found when publishing to a Club that has no Active session", async () => {
      const { roy } = await setup();

      expect(
        (await rejection(roy.backend.publishActiveSession("c1", makeClubSession()))).code,
      ).toBe("not-found");
    });

    it("needs a connection to publish, so the caller can send the latest copy later", async () => {
      const { roy, ana } = await setup();
      await roy.backend.startSharedSession("c1", makeClubSession("Before"));
      roy.setOnline(false);

      const error = await rejection(
        roy.backend.publishActiveSession("c1", makeClubSession("Later")),
      );

      expect(error.code).toBe("offline");
      roy.setOnline(true);
      await roy.backend.publishActiveSession("c1", makeClubSession("Later"));
      await eventually(() => expect(ana.session("c1")?.session.name).toBe("Later"));
    });

    it("lets the Session host end it, and everybody sees it go", async () => {
      const { roy, ana } = await setup();
      await roy.backend.startSharedSession("c1", makeClubSession());
      await eventually(() => expect(ana.session("c1")).toBeDefined());

      await roy.backend.endSharedSession("c1");

      await eventually(() => expect(ana.session("c1")).toBeUndefined());
      await eventually(() => expect(roy.session("c1")).toBeUndefined());
      // The Club can have a new one now.
      await roy.backend.startSharedSession("c1", makeClubSession("Next"));
      await eventually(() => expect(ana.session("c1")?.session.name).toBe("Next"));
    });

    it("only lets the Session host end it", async () => {
      const { roy, ana } = await setup();
      await roy.backend.startSharedSession("c1", makeClubSession());
      await eventually(() => expect(ana.session("c1")).toBeDefined());
      await eventually(() => expect(roy.session("c1")).toBeDefined());

      expect((await rejection(ana.backend.endSharedSession("c1"))).code).toBe("forbidden");

      expect(roy.session("c1")).toBeDefined();
      expect(ana.session("c1")).toBeDefined();
    });

    it("ends quietly when there is nothing to end", async () => {
      const { roy } = await setup();

      await roy.backend.endSharedSession("c1");
    });

    it("ends while offline: the host sees it gone at once, everybody else once the connection is back", async () => {
      const { roy, ana } = await setup();
      await roy.backend.startSharedSession("c1", makeClubSession());
      await eventually(() => expect(ana.session("c1")).toBeDefined());

      roy.setOnline(false);
      await roy.backend.endSharedSession("c1");

      await eventually(() => expect(roy.session("c1")).toBeUndefined());
      expect(ana.session("c1")).toBeDefined();

      roy.setOnline(true);
      await eventually(() => expect(ana.session("c1")).toBeUndefined(), 20_000);
    });

    it("stops showing a Club's session to somebody who leaves the Club", async () => {
      const { roy, ana } = await setup();
      await roy.backend.startSharedSession("c1", makeClubSession());
      await eventually(() => expect(ana.session("c1")).toBeDefined());
      await eventually(() => expect(roy.session("c1")).toBeDefined());

      await ana.backend.leaveClub("c1");

      await eventually(() => expect(ana.session("c1")).toBeUndefined());
      expect(roy.session("c1")).toBeDefined();
    });

    describe("taking over", () => {
      /** Ana is an Organizer too, and Roy hosts a running Session that both can see. */
      async function hostedByRoy() {
        const people = await setup();
        await people.roy.backend.setClubPlayerRole("c1", "p-ana", "organizer");
        await people.roy.backend.startSharedSession("c1", makeClubSession("Running"));
        await eventually(() => expect(people.ana.session("c1")).toBeDefined());
        await eventually(() => expect(people.roy.session("c1")).toBeDefined());
        return people;
      }

      it("lets another Organizer take over at once, keeping the Session as the server has it", async () => {
        const { roy, ana } = await hostedByRoy();

        const taken = await ana.backend.takeOverSession("c1");

        expect(taken).toMatchObject({
          clubId: "c1",
          hostAccountId: ana.account.accountId,
          hostName: "Ana",
        });
        expect(taken.session.name).toBe("Running");
        await eventually(() =>
          expect(roy.session("c1")?.hostAccountId).toBe(ana.account.accountId),
        );
        await eventually(() => expect(ana.session("c1")?.hostName).toBe("Ana"));
        expect(roy.session("c1")?.session.name).toBe("Running");
      });

      it("lets the new host publish, and refuses the old host's uploads and end", async () => {
        const { roy, ana } = await hostedByRoy();
        await ana.backend.takeOverSession("c1");

        await ana.backend.publishActiveSession("c1", makeClubSession("Ana's copy"));
        expect(
          (await rejection(roy.backend.publishActiveSession("c1", makeClubSession("Stale")))).code,
        ).toBe("forbidden");
        expect((await rejection(roy.backend.endSharedSession("c1"))).code).toBe("forbidden");

        await eventually(() => expect(roy.session("c1")?.session.name).toBe("Ana's copy"));
        // The old host can take it back, since they are still an Organizer.
        await roy.backend.takeOverSession("c1");
        await eventually(() => expect(ana.session("c1")?.hostName).toBe("Roy"));
      });

      it("lets the old host learn who the host is from the server", async () => {
        const { roy, ana } = await hostedByRoy();
        await ana.backend.takeOverSession("c1");

        const active = await roy.backend.getActiveSession("c1");

        expect(active?.hostAccountId).toBe(ana.account.accountId);
        expect(await ana.backend.getActiveSession("nope")).toBeNull();
      });

      it("is a no-op for the host", async () => {
        const { roy, ana } = await hostedByRoy();

        const same = await roy.backend.takeOverSession("c1");

        expect(same.hostAccountId).toBe(roy.account.accountId);
        await eventually(() => expect(ana.session("c1")?.hostName).toBe("Roy"));
      });

      it("is only for Organizers of the Club", async () => {
        const { roy, ana, ben } = await setup();
        await roy.backend.startSharedSession("c1", makeClubSession());
        await eventually(() => expect(ana.session("c1")).toBeDefined());
        await eventually(() => expect(roy.session("c1")).toBeDefined());

        expect((await rejection(ana.backend.takeOverSession("c1"))).code).toBe("forbidden");
        expect((await rejection(ben.backend.takeOverSession("c1"))).code).toBe("not-found");
        expect(roy.session("c1")?.hostAccountId).toBe(roy.account.accountId);
      });

      it("needs a connection, and a session to take over", async () => {
        const { roy, ana } = await hostedByRoy();
        ana.setOnline(false);
        expect((await rejection(ana.backend.takeOverSession("c1"))).code).toBe("offline");
        expect((await rejection(ana.backend.getActiveSession("c1"))).code).toBe("offline");
        ana.setOnline(true);

        await roy.backend.endSharedSession("c1");
        await eventually(async () => expect(await ana.backend.getActiveSession("c1")).toBeNull());
        expect((await rejection(ana.backend.takeOverSession("c1"))).code).toBe("not-found");
      });
    });
  });
}
