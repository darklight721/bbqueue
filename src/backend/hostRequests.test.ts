import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createRng, createSession } from "../domain/engine/index.ts";
import type { Account, Session, SessionRequest } from "../domain/types.ts";
import {
  getRequests,
  getSharedSessions,
  resetStoreForTests,
  setAccount,
} from "../storage/store.ts";
import { createHostRequests } from "./hostRequests.ts";
import {
  createInMemoryBackend,
  createInMemoryServer,
  type InMemoryBackend,
} from "./inMemoryBackend.ts";
import { setBackendForTests, startActiveSessionSync } from "./index.ts";
import { startSharedSession } from "./sessions.ts";

let roy: InMemoryBackend; // the host
let ana: InMemoryBackend; // a Player
let cat: InMemoryBackend; // another Organizer
let accounts: Record<"roy" | "ana" | "cat", Account>;
let stop: () => void = () => {};

function makeSession(): Session {
  const named = [
    ["Roy", "roy"],
    ["Ana", "ana"],
    ["Cat", "cat"],
    ["Dan", undefined],
    ["Eve", undefined],
  ] as const;
  return createSession(
    {
      name: "Thursday",
      clubId: "c1",
      clubName: "Riverside",
      pointSystem: 21,
      plannedHours: 1,
      courts: 1,
      players: named.map(([name, who]) => ({
        name,
        skill: "intermediate" as const,
        ...(who ? { accountId: accounts[who].accountId } : {}),
      })),
    },
    { now: Date.now(), rng: createRng(1) },
  );
}

const hosted = () => getSharedSessions()[0]!.session;
const playerNamed = (session: Session, name: string) =>
  session.players.find((player) => player.name === name)!;

async function ask(who: InMemoryBackend, name: string, kind: SessionRequest["kind"]) {
  return who.requestSessionChange("c1", {
    sessionId: hosted().id,
    sessionPlayerId: playerNamed(hosted(), name).id,
    kind,
  });
}

async function statuses(who: InMemoryBackend) {
  let latest: SessionRequest[] = [];
  who.observeSessionRequests("c1", "own", (requests) => (latest = requests))();
  return latest.map((request) => request.status);
}

beforeEach(async () => {
  localStorage.clear();
  resetStoreForTests();
  const server = createInMemoryServer();
  roy = createInMemoryBackend({ server });
  ana = createInMemoryBackend({ server });
  cat = createInMemoryBackend({ server });
  accounts = {
    roy: await roy.createAccount("Roy"),
    ana: await ana.createAccount("Ana"),
    cat: await cat.createAccount("Cat"),
  };
  await roy.createSharedClub({
    id: "c1",
    name: "Riverside",
    players: [
      { id: "p-ana", name: "Ana", skill: "beginner" },
      { id: "p-cat", name: "Cat", skill: "beginner" },
    ],
  });
  await roy.linkClubPlayer("c1", "p-ana", accounts.ana.accountId, "player");
  await roy.linkClubPlayer("c1", "p-cat", accounts.cat.accountId, "organizer");
  setBackendForTests(roy);
  setAccount(accounts.roy);
  stop = startActiveSessionSync(roy);
  await startSharedSession("c1", makeSession());
});

afterEach(() => {
  stop();
  vi.useRealTimers();
  setBackendForTests(null);
});

describe("The Session host applies Players' requests", () => {
  it("applies a request to the host's copy and marks it once the copy has reached the server", async () => {
    vi.useFakeTimers();
    await ask(ana, "Ana", "sit-out");
    await vi.advanceTimersByTimeAsync(10);

    expect(playerNamed(hosted(), "Ana").sittingOut).toBe(true);
    // Not marked yet: the server doesn't have the copy that includes it.
    expect(await statuses(ana)).toEqual(["pending"]);

    await vi.advanceTimersByTimeAsync(1500);

    expect(await statuses(ana)).toEqual(["applied"]);
    let server: Session | undefined;
    ana.observeActiveSessions((report) => (server = report.sessions[0]?.session))();
    expect(playerNamed(server!, "Ana").sittingOut).toBe(true);
  });

  it("applies requests in order, and marks one that no longer makes sense as skipped at once", async () => {
    vi.useFakeTimers();
    await ask(ana, "Ana", "sit-out");
    await ask(ana, "Ana", "sit-out"); // already sitting out by then
    await ask(ana, "Ana", "back-in");
    await vi.advanceTimersByTimeAsync(10);

    expect(playerNamed(hosted(), "Ana").sittingOut).toBe(false);
    expect(await statuses(ana)).toEqual(["pending", "skipped", "pending"]);
    await vi.advanceTimersByTimeAsync(1500);
    expect(await statuses(ana)).toEqual(["applied", "skipped", "applied"]);
  });

  it("skips a request for somebody else's Session player", async () => {
    vi.useFakeTimers();
    await ana.requestSessionChange("c1", {
      sessionId: hosted().id,
      sessionPlayerId: playerNamed(hosted(), "Cat").id,
      kind: "leave",
    });
    await vi.advanceTimersByTimeAsync(10);

    expect(playerNamed(hosted(), "Cat").removed).toBe(false);
    expect(await statuses(ana)).toEqual(["skipped"]);
  });

  it("applies requests made while the host was offline once it is back, then marks them", async () => {
    vi.useFakeTimers();
    roy.setOnline(false);
    await ask(ana, "Ana", "leave");
    await vi.advanceTimersByTimeAsync(5000);
    expect(await statuses(ana)).toEqual(["pending"]);

    roy.setOnline(true);
    await vi.advanceTimersByTimeAsync(2000);

    expect(playerNamed(hosted(), "Ana").removed).toBe(true);
    expect(await statuses(ana)).toEqual(["applied"]);
  });

  it("keeps a leave pending while the player is in a Match, and applies it after", async () => {
    vi.useFakeTimers();
    const { startMatch, endMatch } = await import("../domain/engine/index.ts");
    // Put the Player on court: Roy starts the match.
    const session = hosted();
    const started = startMatch(session, session.courts[0]!.id, {
      now: Date.now(),
      rng: Math.random,
    });
    if (!started.ok) throw new Error(started.reason);
    const { setHostedSession } = await import("../storage/store.ts");
    setHostedSession("c1", started.session);
    const onCourt = started.session.matches[0]!.teams.flat();
    const name = ["Ana", "Cat"].find((n) => onCourt.includes(playerNamed(started.session, n).id));
    if (!name) return;
    const who = name === "Ana" ? ana : cat;

    await ask(who, name, "leave");
    await vi.advanceTimersByTimeAsync(2000);
    expect(playerNamed(hosted(), name).removed).toBe(false);
    expect(await statuses(who)).toEqual(["pending"]);

    const ended = endMatch(hosted(), started.session.matches[0]!.id, null, {
      now: Date.now(),
      rng: Math.random,
    });
    if (!ended.ok) throw new Error(ended.reason);
    setHostedSession("c1", ended.session);
    await vi.advanceTimersByTimeAsync(2000);

    expect(playerNamed(hosted(), name).removed).toBe(true);
    expect(await statuses(who)).toEqual(["applied"]);
  });

  it("shows this Account's own requests to a Player who is only watching", async () => {
    // Ana's device: she watches; the store follows her own requests.
    stop();
    resetStoreForTests();
    setBackendForTests(ana);
    setAccount(accounts.ana);
    stop = startActiveSessionSync(ana);
    vi.useFakeTimers();
    await vi.advanceTimersByTimeAsync(10);
    expect(getSharedSessions()[0]?.hostName).toBe("Roy");
    // This device's store has no Roy-hosted copy of requests; Ana's own appear as she makes them.
    const made = await ana.requestSessionChange("c1", {
      sessionId: hosted().id,
      sessionPlayerId: playerNamed(hosted(), "Ana").id,
      kind: "sit-out",
    });
    await vi.advanceTimersByTimeAsync(10);

    expect(getRequests("c1").map((r) => [r.id, r.status])).toEqual([[made.id, "pending"]]);
  });
});

describe("A new host after a take over", () => {
  it("finds the pending requests and applies them to the server's copy", async () => {
    vi.useFakeTimers();
    // Roy never hears of the request (his device is away), then Cat takes over.
    stop();
    await ask(ana, "Ana", "sit-out");
    await cat.takeOverSession("c1");

    let copy: Session | undefined;
    cat.observeActiveSessions((report) => (copy = report.sessions[0]?.session))();
    let current = copy!;
    const handler = createHostRequests({
      backend: cat,
      clubId: "c1",
      getSession: () => current,
      setSession: (next) => {
        current = next;
      },
    });
    handler.process();

    expect(playerNamed(current, "Ana").sittingOut).toBe(true);
    expect(await statuses(ana)).toEqual(["pending"]);
    handler.uploaded(current);
    await vi.advanceTimersByTimeAsync(10);
    expect(await statuses(ana)).toEqual(["applied"]);
    handler.stop();
  });

  it("is refused once somebody else is the host, and leaves the requests for them", async () => {
    vi.useFakeTimers();
    stop();
    const made = await ask(ana, "Ana", "sit-out");
    let current = hosted();
    const refused = vi.fn();
    const handler = createHostRequests({
      backend: roy,
      clubId: "c1",
      getSession: () => current,
      setSession: (next) => {
        current = next;
      },
      onRefused: refused,
    });
    await cat.takeOverSession("c1");
    handler.process();
    handler.uploaded(current);
    await vi.advanceTimersByTimeAsync(10);

    expect(refused).toHaveBeenCalled();
    expect(await statuses(ana)).toEqual(["pending"]);
    expect(made.status).toBe("pending");
    handler.stop();
  });
});
