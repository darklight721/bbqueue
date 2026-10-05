import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createRng, createSession } from "../domain/engine/index.ts";
import type { ActiveSession, Session } from "../domain/types.ts";
import { getFlash, setFlash } from "../storage/flash.ts";
import {
  applyActiveSessionsReport,
  getSharedSessions,
  resetStoreForTests,
  setAccount,
  setHostedSession,
} from "../storage/store.ts";
import { BackendError } from "./backend.ts";
import {
  createInMemoryBackend,
  createInMemoryServer,
  type InMemoryBackend,
} from "./inMemoryBackend.ts";
import { setBackendForTests, startActiveSessionSync } from "./index.ts";
import { endSharedSession, startSharedSession, takeOverSession } from "./sessions.ts";

function makeSession(name = "Thursday"): Session {
  return createSession(
    {
      name,
      clubId: "c1",
      clubName: "Riverside",
      pointSystem: 21,
      plannedHours: 1,
      courts: 1,
      players: ["Ana", "Ben", "Cat", "Dan"].map((player) => ({
        name: player,
        skill: "intermediate" as const,
      })),
    },
    { now: 1, rng: createRng(1) },
  );
}

const server = () => createInMemoryServer();
let host: InMemoryBackend;
let viewer: InMemoryBackend;
let stop: () => void;

/** What the server holds for c1, from the viewer's side. */
function serverCopy(): ActiveSession | undefined {
  let latest: ActiveSession[] = [];
  viewer.observeActiveSessions((report) => (latest = report.sessions))();
  return latest.find((entry) => entry.clubId === "c1");
}

async function setup() {
  const shared = server();
  host = createInMemoryBackend({ server: shared });
  viewer = createInMemoryBackend({ server: shared });
  const roy = await host.createAccount("Roy");
  const ana = await viewer.createAccount("Ana");
  await host.createSharedClub({
    id: "c1",
    name: "Riverside",
    players: [{ id: "p-ana", name: "Ana", skill: "beginner" }],
  });
  await host.linkClubPlayer("c1", "p-ana", ana.accountId, "player");
  setBackendForTests(host);
  setAccount(roy);
  stop = startActiveSessionSync(host);
}

beforeEach(async () => {
  localStorage.clear();
  resetStoreForTests();
  setFlash(null);
  await setup();
});

afterEach(() => {
  stop();
  vi.useRealTimers();
  setBackendForTests(null);
});

describe("Active session sync: the Session host's uploads", () => {
  it("doesn't upload again what the server was just given at Start", async () => {
    const publish = vi.spyOn(host, "publishActiveSession");
    vi.useFakeTimers();

    await startSharedSession("c1", makeSession());
    await vi.advanceTimersByTimeAsync(10_000);

    expect(publish).not.toHaveBeenCalled();
  });

  it("uploads the latest whole Session about a second after changes, as one write", async () => {
    await startSharedSession("c1", makeSession());
    const publish = vi.spyOn(host, "publishActiveSession");
    vi.useFakeTimers();
    const base = getSharedSessions()[0]!.session;

    setHostedSession("c1", { ...base, name: "One" });
    await vi.advanceTimersByTimeAsync(300);
    setHostedSession("c1", { ...base, name: "Two" });
    await vi.advanceTimersByTimeAsync(300);
    setHostedSession("c1", { ...base, name: "Three" });
    expect(publish).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1100);

    expect(publish).toHaveBeenCalledTimes(1);
    expect(serverCopy()?.session.name).toBe("Three");
  });

  it("plays on offline and sends the latest copy once when the connection is back", async () => {
    await startSharedSession("c1", makeSession());
    const publish = vi.spyOn(host, "publishActiveSession");
    vi.useFakeTimers();
    const base = getSharedSessions()[0]!.session;

    host.setOnline(false);
    for (const name of ["a", "b", "c"]) {
      setHostedSession("c1", { ...base, name });
      await vi.advanceTimersByTimeAsync(2000);
    }
    expect(publish).not.toHaveBeenCalled();
    expect(serverCopy()?.session.name).toBe("Thursday");
    // The device keeps the Session it is running.
    expect(getSharedSessions()[0]?.session.name).toBe("c");

    host.setOnline(true);
    await vi.advanceTimersByTimeAsync(100);

    expect(publish).toHaveBeenCalledTimes(1);
    expect(serverCopy()?.session.name).toBe("c");
  });

  it("uploads what the device has changed while the app was closed", async () => {
    await startSharedSession("c1", makeSession());
    stop();
    resetStoreForTests();
    // Changed offline, then the app was reloaded: the saved copy is newer than the server's.
    const base = getSharedSessions()[0]!.session;
    setHostedSession("c1", { ...base, name: "Played offline" });
    resetStoreForTests();
    vi.useFakeTimers();

    stop = startActiveSessionSync(host);
    await vi.advanceTimersByTimeAsync(1500);

    expect(serverCopy()?.session.name).toBe("Played offline");
  });

  it("never lets a report from the server undo the host's own changes", async () => {
    await startSharedSession("c1", makeSession());
    const base = getSharedSessions()[0]!.session;
    host.setOnline(false);
    setHostedSession("c1", { ...base, name: "Mine" });

    host.setOnline(true);
    // The server's older copy is reported back to this device.
    await Promise.resolve();

    expect(getSharedSessions()[0]?.session.name).toBe("Mine");
  });

  it("lets a failed upload fail quietly and tries again, without touching play", async () => {
    await startSharedSession("c1", makeSession());
    const base = getSharedSessions()[0]!.session;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const publish = vi
      .spyOn(host, "publishActiveSession")
      .mockRejectedValueOnce(new BackendError("failed"));
    vi.useFakeTimers();

    setHostedSession("c1", { ...base, name: "Changed" });
    await vi.advanceTimersByTimeAsync(1100);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(getSharedSessions()[0]?.session.name).toBe("Changed");
    await vi.advanceTimersByTimeAsync(2100);

    expect(publish).toHaveBeenCalledTimes(2);
    expect(serverCopy()?.session.name).toBe("Changed");
    warn.mockRestore();
  });

  it("drops the hosted Session with a notice when the server says it is gone", async () => {
    await startSharedSession("c1", makeSession());
    const base = getSharedSessions()[0]!.session;
    // The Club's record disappears (the Club was deleted), unseen by this device.
    await host.endSharedSession("c1");
    vi.useFakeTimers();

    setHostedSession("c1", { ...base, name: "Too late" });
    await vi.advanceTimersByTimeAsync(1100);

    expect(getSharedSessions()).toEqual([]);
    expect(getFlash()).toContain("no longer shared");
  });

  it("stops uploading once the host ends the session, and the end reaches the server", async () => {
    await startSharedSession("c1", makeSession());
    const publish = vi.spyOn(host, "publishActiveSession");
    vi.useFakeTimers();
    const base = getSharedSessions()[0]!.session;
    setHostedSession("c1", { ...base, name: "Last change" });

    endSharedSession("c1");
    await vi.advanceTimersByTimeAsync(5000);

    expect(publish).not.toHaveBeenCalled();
    expect(getSharedSessions()).toEqual([]);
    expect(serverCopy()).toBeUndefined();
  });

  it("drops changes that weren't uploaded yet when somebody else becomes the host", async () => {
    await startSharedSession("c1", makeSession());
    const publish = vi.spyOn(host, "publishActiveSession");
    vi.useFakeTimers();
    const entry = getSharedSessions()[0]!;
    setHostedSession("c1", { ...entry.session, name: "Never uploaded" });

    // The server now says Ana hosts it (somebody took over).
    applyActiveSessionsReport({
      sessions: [{ ...entry, hostAccountId: "ana-2222", hostName: "Ana" }],
      unknown: [],
    });
    await vi.advanceTimersByTimeAsync(5000);

    expect(publish).not.toHaveBeenCalled();
    expect(getSharedSessions()[0]).toMatchObject({ hostName: "Ana" });
    expect(getSharedSessions()[0]?.session.name).toBe("Thursday");
  });
});

describe("Active session sync: losing the host role (take over)", () => {
  async function anaIsOrganizer() {
    await host.setClubPlayerRole("c1", "p-ana", "organizer");
  }

  it("turns the old host read-only and drops their changes when the server refuses an upload", async () => {
    await anaIsOrganizer();
    stop();
    // This device never hears from the observer, so only the refused upload can tell it.
    stop = startActiveSessionSync({ ...host, observeActiveSessions: () => () => {} });
    await startSharedSession("c1", makeSession("Roy's night"));
    const base = getSharedSessions()[0]!.session;
    vi.useFakeTimers();

    await viewer.takeOverSession("c1");
    setHostedSession("c1", { ...base, name: "Played after being replaced" });
    await vi.advanceTimersByTimeAsync(1500);

    const entry = getSharedSessions()[0]!;
    expect(entry.hostName).toBe("Ana");
    expect(entry.session.name).toBe("Roy's night");
    expect(serverCopy()?.session.name).toBe("Roy's night");
    expect(serverCopy()?.hostName).toBe("Ana");
    // And it stays that way: the old host's device doesn't try again.
    const publish = vi.spyOn(host, "publishActiveSession");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(publish).not.toHaveBeenCalled();
  });

  it("drops what was played offline when the host reconnects after somebody took over", async () => {
    await anaIsOrganizer();
    await startSharedSession("c1", makeSession("Roy's night"));
    const base = getSharedSessions()[0]!.session;

    host.setOnline(false);
    setHostedSession("c1", { ...base, name: "Played offline" });
    await viewer.takeOverSession("c1");
    host.setOnline(true);
    await Promise.resolve();

    expect(getSharedSessions()[0]?.hostName).toBe("Ana");
    expect(getSharedSessions()[0]?.session.name).toBe("Roy's night");
    expect(serverCopy()?.session.name).toBe("Roy's night");
  });

  it("makes the new host's device the uploader, starting from the server's copy", async () => {
    await anaIsOrganizer();
    await startSharedSession("c1", makeSession("Roy's night"));

    host.setOnline(true);
    await takeOverSession("c1").catch(() => {});
    // Roy is the host already: taking over is a no-op that leaves his copy alone.
    expect(getSharedSessions()[0]?.hostName).toBe("Roy");
  });
});
