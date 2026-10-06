import { afterEach, describe, expect, it } from "vite-plus/test";
import { createRng, createSession } from "../domain/engine/index.ts";
import type {
  Account,
  ActiveSession,
  EndedSession,
  Session,
  SessionRequest,
} from "../domain/types.ts";
import { eventually } from "../test/eventually.ts";
import { BackendError, type Backend } from "./backend.ts";
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

/** A slimmed Ended session of Club c1 with one Ended match; `endedAt` tells them apart and orders them. */
export function makeClubEnded(session: Session, endedAt: number): EndedSession {
  const [a, b, c, d] = session.players;
  return {
    id: session.id,
    name: session.name,
    clubId: session.clubId,
    clubName: session.clubName,
    pointSystem: 21,
    startedAt: endedAt - 3_600_000,
    endedAt,
    players: [a!, b!, c!, d!].map((p) => ({ id: p.id, name: p.name, skill: p.skill })),
    matches: [
      {
        number: 1,
        courtNumber: 1,
        teams: [
          [a!.id, b!.id],
          [c!.id, d!.id],
        ],
        target: 21,
        startedAt: endedAt - 1_800_000,
        endedAt: endedAt - 900_000,
        score: [21, 15],
      },
    ],
  };
}

/**
 * The Shared Active session (ADR-0007) between three people: Roy (Organizer and Session
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

    describe("Players' requests", () => {
      const watch = (
        who: { backend: { observeSessionRequests: Backend["observeSessionRequests"] } },
        scope: "own" | "all",
      ) => {
        let latest: SessionRequest[] | null = null;
        stops.push(
          who.backend.observeSessionRequests("c1", scope, (requests) => {
            latest = requests;
          }),
        );
        return () => latest ?? [];
      };
      const ask = (
        who: { backend: Backend },
        kind: "sit-out" | "back-in" | "leave" = "sit-out",
        sessionPlayerId = "sp-1",
      ) => who.backend.requestSessionChange("c1", { sessionId: "s-1", sessionPlayerId, kind });

      /** Roy hosts; Ana (a Player) and Ben (a Player, added later) are on the Club. */
      async function running() {
        const people = await setup();
        await people.roy.backend.addClubPlayer("c1", {
          id: "p-ben",
          name: "Ben",
          skill: "beginner",
        });
        await people.roy.backend.linkClubPlayer(
          "c1",
          "p-ben",
          people.ben.account.accountId,
          "player",
        );
        await people.roy.backend.startSharedSession("c1", makeClubSession());
        await eventually(() => expect(people.ana.session("c1")).toBeDefined());
        await eventually(() => expect(people.ben.session("c1")).toBeDefined());
        return people;
      }

      it("lets a Player make a request, which they and the host see, pending", async () => {
        const { roy, ana } = await running();
        const mine = watch(ana, "own");
        const hosts = watch(roy, "all");

        const made = await ask(ana, "sit-out", "sp-ana");

        expect(made).toMatchObject({
          clubId: "c1",
          sessionId: "s-1",
          sessionPlayerId: "sp-ana",
          accountId: ana.account.accountId,
          kind: "sit-out",
          status: "pending",
        });
        await eventually(() => expect(mine().map((r) => r.id)).toEqual([made.id]));
        await eventually(() => expect(hosts().map((r) => r.id)).toEqual([made.id]));
        expect(hosts()[0]?.createdAt).toBeGreaterThan(0);
      });

      it("keeps requests in the order they were made, and keeps one Player's from another's", async () => {
        const { roy, ana, ben } = await running();
        const hosts = watch(roy, "all");
        const anas = watch(ana, "own");
        const bens = watch(ben, "own");

        const first = await ask(ana, "sit-out", "sp-ana");
        const second = await ask(ben, "leave", "sp-ben");
        const third = await ask(ana, "back-in", "sp-ana");

        await eventually(() =>
          expect(hosts().map((r) => r.id)).toEqual([first.id, second.id, third.id]),
        );
        await eventually(() => expect(anas().map((r) => r.id)).toEqual([first.id, third.id]));
        await eventually(() => expect(bens().map((r) => r.id)).toEqual([second.id]));
      });

      it("shows everybody's requests to the Session host only", async () => {
        const { roy, ana, ben } = await running();
        const benAll = watch(ben, "all");
        const anaAll = watch(ana, "all");
        const hosts = watch(roy, "all");

        await ask(ana, "sit-out", "sp-ana");
        await ask(ben, "sit-out", "sp-ben");

        await eventually(() => expect(hosts()).toHaveLength(2));
        // Somebody else's "all" is refused: nothing of other people's is ever reported to them (the
        // server version may show their own, still waiting in the device's cache, until it refuses).
        await new Promise((resolve) => setTimeout(resolve, 300));
        expect(benAll().filter((r) => r.accountId !== ben.account.accountId)).toEqual([]);
        expect(anaAll().filter((r) => r.accountId !== ana.account.accountId)).toEqual([]);
      });

      it("only takes requests from people on the Club, and only while the Club has a session", async () => {
        const { roy, ben } = await setup();
        expect((await rejection(ask(roy))).code).toBe("not-found");

        await roy.backend.startSharedSession("c1", makeClubSession());
        expect((await rejection(ask(ben))).code).toBe("forbidden");
      });

      it("needs a connection", async () => {
        const { ana } = await running();
        ana.setOnline(false);
        expect((await rejection(ask(ana))).code).toBe("offline");
      });

      it("lets only the Session host mark requests, and the Player sees how it went", async () => {
        const { roy, ana } = await running();
        const mine = watch(ana, "own");
        const applied = await ask(ana, "sit-out", "sp-ana");
        const skipped = await ask(ana, "sit-out", "sp-ana");
        await eventually(() => expect(mine()).toHaveLength(2));

        expect(
          (
            await rejection(
              ana.backend.resolveSessionRequests("c1", [{ id: applied.id, status: "applied" }]),
            )
          ).code,
        ).toBe("forbidden");
        await roy.backend.resolveSessionRequests("c1", [
          { id: applied.id, status: "applied" },
          { id: skipped.id, status: "skipped" },
        ]);

        await eventually(() =>
          expect(mine().map((r) => [r.id, r.status])).toEqual([
            [applied.id, "applied"],
            [skipped.id, "skipped"],
          ]),
        );
      });

      it("needs a connection to mark requests", async () => {
        const { roy, ana } = await running();
        const made = await ask(ana, "leave", "sp-ana");
        roy.setOnline(false);

        const error = await rejection(
          roy.backend.resolveSessionRequests("c1", [{ id: made.id, status: "applied" }]),
        );

        expect(error.code).toBe("offline");
      });

      it("keeps pending requests for a new host when somebody takes over", async () => {
        const { roy, ana, ben } = await running();
        await roy.backend.setClubPlayerRole("c1", "p-ana", "organizer");
        const made = await ask(ben, "sit-out", "sp-ben");

        await ana.backend.takeOverSession("c1");

        const newHosts = watch(ana, "all");
        await eventually(() =>
          expect(newHosts().map((r) => [r.id, r.status])).toEqual([[made.id, "pending"]]),
        );
        // And the old host can no longer mark them.
        expect(
          (
            await rejection(
              roy.backend.resolveSessionRequests("c1", [{ id: made.id, status: "applied" }]),
            )
          ).code,
        ).toBe("forbidden");
        await ana.backend.resolveSessionRequests("c1", [{ id: made.id, status: "applied" }]);
        const bens = watch(ben, "own");
        await eventually(() => expect(bens()[0]?.status).toBe("applied"));
      });

      it("clears the requests when the host ends the session", async () => {
        const { roy, ana } = await running();
        const mine = watch(ana, "own");
        // The host's device follows everybody's requests, as the app does, so it knows which to clear.
        const all = watch(roy, "all");
        await ask(ana, "sit-out", "sp-ana");
        await eventually(() => expect(mine()).toHaveLength(1));
        await eventually(() => expect(all()).toHaveLength(1));

        await roy.backend.endSharedSession("c1");

        await eventually(() => expect(mine()).toEqual([]));
      });
    });

    describe("Ended sessions of a Shared club", () => {
      const watchEnded = (who: { backend: Backend }) => {
        let latest: { sessions: EndedSession[]; clubIds: string[]; unknown?: string[] } | null =
          null;
        stops.push(
          who.backend.observeEndedSessions((report) => {
            latest = report;
          }),
        );
        return () => latest ?? { sessions: [], clubIds: [], unknown: [] };
      };

      it("publishes the Ended session to the Club when the host ends the Session, for everybody on it", async () => {
        const { roy, ana, ben } = await setup();
        const annaWatches = watchEnded(ana);
        const royWatches = watchEnded(roy);
        const benWatches = watchEnded(ben);
        const session = makeClubSession();
        await roy.backend.startSharedSession("c1", session);
        await eventually(() => expect(ana.session("c1")).toBeDefined());
        const ended = makeClubEnded(session, 1_700_000_000_000);

        await roy.backend.endSharedSession("c1", ended);

        await eventually(() => expect(annaWatches().sessions).toEqual([ended]));
        await eventually(() => expect(royWatches().sessions).toEqual([ended]));
        expect(annaWatches().clubIds).toEqual(["c1"]);
        await eventually(() => expect(ana.session("c1")).toBeUndefined());
        // Not on the Club: nothing.
        expect(benWatches().sessions).toEqual([]);
        expect(benWatches().clubIds).toEqual([]);
      });

      it("publishes nothing when the Session had no Ended match, and still clears the Active session", async () => {
        const { roy, ana } = await setup();
        const watches = watchEnded(ana);
        await roy.backend.startSharedSession("c1", makeClubSession());
        await eventually(() => expect(ana.session("c1")).toBeDefined());

        await roy.backend.endSharedSession("c1", null);

        await eventually(() => expect(ana.session("c1")).toBeUndefined());
        expect(watches().sessions).toEqual([]);
      });

      it("only lets the host publish", async () => {
        const { roy, ana } = await setup();
        const session = makeClubSession();
        await roy.backend.startSharedSession("c1", session);
        await eventually(() => expect(ana.session("c1")).toBeDefined());
        await eventually(() => expect(roy.session("c1")).toBeDefined());

        const error = await rejection(
          ana.backend.endSharedSession("c1", makeClubEnded(session, 1_700_000_000_000)),
        );

        expect(error.code).toBe("forbidden");
        expect(watchEnded(ana)().sessions).toEqual([]);
      });

      it("only takes an Ended session that is the Session being ended", async () => {
        const { roy, ana } = await setup();
        const watches = watchEnded(ana);
        const session = makeClubSession();
        await roy.backend.startSharedSession("c1", session);
        await eventually(() => expect(roy.session("c1")).toBeDefined());
        const other = makeClubEnded(makeClubSession("Another night"), 1_700_000_000_000);

        const error = await rejection(roy.backend.endSharedSession("c1", other));

        expect(error.code).toBe("forbidden");
        expect(watches().sessions).toEqual([]);
        // The Session is still running, and ends properly with its own Ended session.
        await eventually(() => expect(roy.session("c1")).toBeDefined());
        await roy.backend.endSharedSession("c1", makeClubEnded(session, 1_700_000_000_000));
        await eventually(() => expect(watches().sessions).toHaveLength(1));
      });

      it("deletes a Club's Ended sessions with the Club, even with others on it: its id can't be used to read them", async () => {
        const { roy, ana, ben } = await setup();
        const annaWatches = watchEnded(ana);
        const session = makeClubSession();
        await roy.backend.startSharedSession("c1", session);
        await roy.backend.endSharedSession("c1", makeClubEnded(session, 1_700_000_000_000));
        await eventually(() => expect(annaWatches().sessions).toHaveLength(1));

        await roy.backend.deleteSharedClub("c1");
        await eventually(() => expect(annaWatches().clubIds).toEqual([]));

        // Ben takes the same id.
        const benWatches = watchEnded(ben);
        await ben.backend.createSharedClub({ id: "c1", name: "Mine", players: [] });
        await eventually(() => expect(benWatches().clubIds).toEqual(["c1"]));
        expect(benWatches().sessions).toEqual([]);
      });

      it("when the host ends offline, the Ended session and the end wait together and land when it is back", async () => {
        const { roy, ana } = await setup();
        const watches = watchEnded(ana);
        const session = makeClubSession();
        await roy.backend.startSharedSession("c1", session);
        await eventually(() => expect(ana.session("c1")).toBeDefined());
        await eventually(() => expect(roy.session("c1")).toBeDefined());
        const ended = makeClubEnded(session, 1_700_000_000_000);

        roy.setOnline(false);
        await roy.backend.endSharedSession("c1", ended);
        await new Promise((resolve) => setTimeout(resolve, 200));
        expect(watches().sessions).toEqual([]);
        expect(ana.session("c1")).toBeDefined();

        roy.setOnline(true);
        await eventually(() => expect(watches().sessions).toEqual([ended]), 20_000);
        await eventually(() => expect(ana.session("c1")).toBeUndefined(), 20_000);
      });

      it("lists the newest first, 50 at most per Club", async () => {
        const { roy, ana } = await setup();
        const watches = watchEnded(ana);
        const ids: string[] = [];
        for (let i = 0; i < 51; i++) {
          const session = makeClubSession(`Night ${i}`);
          await roy.backend.startSharedSession("c1", session);
          await roy.backend.endSharedSession(
            "c1",
            makeClubEnded(session, 1_700_000_000_000 + i * 1000),
          );
          ids.push(session.id);
        }

        // Once the newest is in, the oldest has dropped out of the 50.
        await eventually(() => {
          const listed = watches().sessions;
          expect(listed.map((s) => s.id)).toContain(ids[50]);
          expect(listed).toHaveLength(50);
          expect(listed.map((s) => s.id)).not.toContain(ids[0]);
          expect(listed.map((s) => s.endedAt)).toEqual(
            [...listed.map((s) => s.endedAt)].sort((a, b) => b - a),
          );
        }, 30_000);
      }, 120_000);

      it("stops listing a Club's Ended sessions to somebody who leaves it", async () => {
        const { roy, ana } = await setup();
        const watches = watchEnded(ana);
        const session = makeClubSession();
        await roy.backend.startSharedSession("c1", session);
        await roy.backend.endSharedSession("c1", makeClubEnded(session, 1_700_000_000_000));
        await eventually(() => expect(watches().sessions).toHaveLength(1));

        await ana.backend.leaveClub("c1");

        await eventually(() => expect(watches().clubIds).toEqual([]));
        expect(watches().sessions).toEqual([]);
      });

      describe("deleting one", () => {
        async function withEnded() {
          const world = await setup();
          const session = makeClubSession();
          await world.roy.backend.startSharedSession("c1", session);
          const ended = makeClubEnded(session, 1_700_000_000_000);
          await world.roy.backend.endSharedSession("c1", ended);
          const annaWatches = watchEnded(world.ana);
          const royWatches = watchEnded(world.roy);
          await eventually(() => expect(annaWatches().sessions).toEqual([ended]));
          await eventually(() => expect(royWatches().sessions).toEqual([ended]));
          return { ...world, ended, annaWatches, royWatches };
        }

        it("lets an Organizer delete it, and everybody on the Club sees it go", async () => {
          const { roy, ended, annaWatches, royWatches } = await withEnded();

          await roy.backend.deleteEndedSession("c1", ended.id);

          await eventually(() => expect(annaWatches().sessions).toEqual([]));
          await eventually(() => expect(royWatches().sessions).toEqual([]));
          // The Club itself is untouched.
          expect(annaWatches().clubIds).toEqual(["c1"]);
        });

        it("only deletes the one asked for", async () => {
          const { roy, ended, annaWatches } = await withEnded();
          const later = makeClubSession("Later night");
          await roy.backend.startSharedSession("c1", later);
          const laterEnded = makeClubEnded(later, 1_700_000_100_000);
          await roy.backend.endSharedSession("c1", laterEnded);
          await eventually(() => expect(annaWatches().sessions).toHaveLength(2));

          await roy.backend.deleteEndedSession("c1", ended.id);

          await eventually(() => expect(annaWatches().sessions).toEqual([laterEnded]));
        });

        it("refuses a Player, and the Ended session stays", async () => {
          const { ana, ended, annaWatches } = await withEnded();

          const error = await rejection(ana.backend.deleteEndedSession("c1", ended.id));

          expect(error.code).toBe("forbidden");
          await new Promise((resolve) => setTimeout(resolve, 200));
          expect(annaWatches().sessions).toEqual([ended]);
        });

        it("treats somebody who isn't on the Club as having no such Club", async () => {
          const { ben, ended, annaWatches } = await withEnded();

          const error = await rejection(ben.backend.deleteEndedSession("c1", ended.id));

          expect(error.code).toBe("not-found");
          expect(annaWatches().sessions).toEqual([ended]);
        });

        it("needs a connection", async () => {
          const { roy, ended, annaWatches } = await withEnded();
          roy.setOnline(false);

          const error = await rejection(roy.backend.deleteEndedSession("c1", ended.id));

          expect(error.code).toBe("offline");
          expect(annaWatches().sessions).toEqual([ended]);
        });

        it("resolves for one that is already gone", async () => {
          const { roy, ended, annaWatches } = await withEnded();
          await roy.backend.deleteEndedSession("c1", ended.id);
          await eventually(() => expect(annaWatches().sessions).toEqual([]));

          await expect(roy.backend.deleteEndedSession("c1", ended.id)).resolves.toBeUndefined();
        });
      });
    });
  });
}
