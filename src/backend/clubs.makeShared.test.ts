import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createRng, createSession } from "../domain/engine/index.ts";
import type { Club, Session } from "../domain/types.ts";
import {
  getActiveSessions,
  getClubs,
  getLocalClubs,
  getSession,
  getSharedSessions,
  isPublishedCopy,
  resetStoreForTests,
  setAccount,
  setLocalClubs,
  setSession,
  setSharedClubs,
  addEndedSession,
} from "../storage/store.ts";
import { makeClubShared } from "./clubs.ts";
import { createInMemoryBackend, type InMemoryBackend } from "./inMemoryBackend.ts";
import { setBackendForTests, startActiveSessionSync, startSharedClubSync } from "./index.ts";

const garage: Club = {
  id: "c1",
  name: "Garage",
  kind: "local",
  players: [
    { id: "p-ana", name: "Ana", skill: "beginner" },
    { id: "p-roy", name: "Roy S.", skill: "advanced" },
    { id: "p-cat", name: "Cat", skill: "intermediate" },
    { id: "p-dan", name: "Dan", skill: "intermediate" },
  ],
};

let backend: InMemoryBackend;
let stops: (() => void)[] = [];
let running: Session;

beforeEach(async () => {
  localStorage.clear();
  resetStoreForTests();
  backend = createInMemoryBackend();
  setBackendForTests(backend);
  setAccount(await backend.createAccount("Roy Smith"));
  setLocalClubs([garage]);
  running = createSession(
    {
      name: "Tonight",
      clubId: "c1",
      clubName: "Garage",
      pointSystem: 21,
      plannedHours: 1,
      courts: 1,
      players: garage.players.map((p) => ({ name: p.name, skill: p.skill, clubPlayerId: p.id })),
    },
    { now: 1, rng: createRng(1) },
  );
  setSession(running);
  stops = [startSharedClubSync(backend), startActiveSessionSync(backend)];
});

afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  setBackendForTests(null);
  vi.restoreAllMocks();
});

const share = () => makeClubShared(garage, { type: "row", rowId: "p-roy" });

/** Runs `during` after the server has the Club and the Session, before the call resolves. */
function duringConversion(during: () => void) {
  const original = backend.makeSharedClub.bind(backend);
  vi.spyOn(backend, "makeSharedClub").mockImplementation(async (input) => {
    const result = await original(input);
    during();
    return result;
  });
}

describe("Making a club shared while its Session is running", () => {
  it("keeps what was played while the Club was being made, not the copy that was sent", async () => {
    duringConversion(() => setSession({ ...running, name: "Tonight, after a Match" }));

    await share();

    expect(getSession()).toBeNull();
    const [hosted] = getSharedSessions();
    expect(hosted?.session.name).toBe("Tonight, after a Match");
    // Roy's link is still on his Session player.
    expect(hosted?.session.players.find((p) => p.name === "Roy S.")?.accountId).toBe(
      hosted?.hostAccountId,
    );
    // The server doesn't have this copy yet: the host's uploader must send it.
    expect(isPublishedCopy(hosted!.session)).toBe(false);
  });

  it("marks the copy as not uploaded even when nothing changed meanwhile, as an earlier try may have left an older one on the server", async () => {
    await share();

    const [hosted] = getSharedSessions();
    expect(hosted?.session.id).toBe(running.id);
    expect(isPublishedCopy(hosted!.session)).toBe(false);
  });

  it("uploads that latest copy to the server", async () => {
    duringConversion(() => setSession({ ...running, name: "Tonight, after a Match" }));
    await share();

    await vi.waitFor(
      async () => {
        const server = await backend.getActiveSession("c1");
        expect(server?.session.name).toBe("Tonight, after a Match");
      },
      { timeout: 10_000 },
    );
  });

  it("never lists the Session twice while the Club is being made", async () => {
    const seen: number[] = [];
    duringConversion(() => {
      // The server has listed the Club's Session by now; the device's own is still there too.
      seen.push(getActiveSessions().length);
    });

    await share();

    expect(seen).toEqual([1]);
    expect(getActiveSessions()).toHaveLength(1);
    expect(getActiveSessions()[0]?.shared?.clubId).toBe("c1");
  });

  it("ends the Club's copy again when the Session was ended while the Club was being made", async () => {
    const ended = {
      id: running.id,
      name: "Tonight",
      clubId: "c1",
      clubName: "Garage",
      pointSystem: 21 as const,
      startedAt: 1,
      endedAt: 2,
      players: [],
      matches: [],
    };
    duringConversion(() => {
      setSession(null);
      addEndedSession(ended);
    });

    await share();

    expect(getSession()).toBeNull();
    expect(getSharedSessions()).toEqual([]);
    await vi.waitFor(async () => expect(await backend.getActiveSession("c1")).toBeNull());
    expect(getLocalClubs()).toEqual([]);
    expect(getClubs().map((club) => club.kind)).toEqual(["shared"]);
  });
});

describe("The Club is still Local", () => {
  it("doesn't show a Session the server lists for it, next to the device's own", () => {
    setSharedClubs([{ ...garage, kind: "shared" }]);
    expect(getActiveSessions().map((entry) => entry.shared)).toEqual([null]);
  });
});
