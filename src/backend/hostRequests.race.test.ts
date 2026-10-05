import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createSession } from "../domain/engine/index.ts";
import { createRng } from "../domain/engine/rng.ts";
import type { Session, SessionRequest } from "../domain/types.ts";
import type { Backend } from "./backend.ts";
import { createHostRequests } from "./hostRequests.ts";

/**
 * The host marks a request `applied` only once an uploaded copy of the Session holds it. These
 * drive `createHostRequests` by hand, with the uploads' order in the test's hands.
 */

const ANA = "ana-2222";

function makeSession(): Session {
  return createSession(
    {
      name: "Thursday",
      clubId: "c1",
      clubName: "Riverside",
      pointSystem: 21,
      plannedHours: 1,
      courts: 1,
      players: [
        { name: "Roy", skill: "intermediate" },
        { name: "Ana", skill: "beginner", accountId: ANA },
        { name: "Cat", skill: "beginner" },
        { name: "Dan", skill: "beginner" },
        { name: "Eve", skill: "beginner" },
      ],
    },
    { now: 1_700_000_000_000, rng: createRng(1) },
  );
}

function setup(start: Session, options: { published?: Set<Session> } = {}) {
  let current = start;
  let report: (requests: SessionRequest[]) => void = () => {};
  const marked: { id: string; status: string }[] = [];
  const backend = {
    isOnline: () => true,
    observeOnline: () => () => {},
    observeSessionRequests: (
      _clubId: string,
      _scope: string,
      listener: (requests: SessionRequest[]) => void,
    ) => {
      report = listener;
      return () => {};
    },
    resolveSessionRequests: (_clubId: string, results: { id: string; status: string }[]) => {
      marked.push(...results);
      return Promise.resolve();
    },
  } as unknown as Backend;
  const handler = createHostRequests({
    backend,
    clubId: "c1",
    getSession: () => current,
    setSession: (next) => {
      current = next;
    },
    isPublished: (session) => options.published?.has(session) ?? false,
  });
  const ask = (id: string, kind: SessionRequest["kind"], session = current): SessionRequest => ({
    id,
    clubId: "c1",
    sessionId: session.id,
    sessionPlayerId: session.players.find((p) => p.name === "Ana")!.id,
    accountId: ANA,
    kind,
    status: "pending",
    createdAt: 1_000,
  });
  return {
    handler,
    marked,
    current: () => current,
    /** The host changes the Session by itself (not a request). */
    change(next: Session) {
      current = next;
      handler.process();
    },
    receive: (...requests: SessionRequest[]) => report(requests),
    ask,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("marking a request applied", () => {
  it("waits for an uploaded copy that holds the request, not just any later copy", async () => {
    const t = setup(makeSession());
    // A plain change (copy A) starts uploading…
    const a = { ...t.current(), name: "Thursday, renamed" };
    t.change(a);
    // …and while it is still on its way, a Player's request is applied (copy B, built on A).
    t.receive(t.ask("r1", "sit-out"));
    const b = t.current();
    expect(b).not.toBe(a);
    expect(b.appliedRequestIds).toEqual(["r1"]);

    // A's upload lands: A doesn't hold the request, so nothing is marked.
    t.handler.uploaded(a);
    await Promise.resolve();
    expect(t.marked).toEqual([]);

    // B's upload lands: now it is.
    t.handler.uploaded(b);
    await Promise.resolve();
    expect(t.marked).toEqual([{ id: "r1", status: "applied" }]);
  });

  it("marks it when a later copy is uploaded instead of the one it was applied to", async () => {
    const t = setup(makeSession());
    t.receive(t.ask("r1", "sit-out"));
    const later = { ...t.current(), name: "Later" };

    t.handler.uploaded(later);
    await Promise.resolve();

    expect(t.marked).toEqual([{ id: "r1", status: "applied" }]);
  });

  it("applies each request once and keeps the order when several come in at once", async () => {
    const t = setup(makeSession());
    t.receive(t.ask("r1", "sit-out"), { ...t.ask("r2", "back-in"), createdAt: 2_000 });
    expect(t.current().appliedRequestIds).toEqual(["r1", "r2"]);
    t.handler.uploaded(t.current());
    await Promise.resolve();
    expect(t.marked).toEqual([
      { id: "r1", status: "applied" },
      { id: "r2", status: "applied" },
    ]);
  });

  it("doesn't call a request skipped when the app starts again with it already in the Session", async () => {
    // After a reload the Session on the device already holds the request (Ana is sitting out),
    // while the server still has it pending. Applying it again would skip it ("already sitting
    // out"), and Ana would be told it was skipped.
    const first = setup(makeSession());
    first.receive(first.ask("r1", "sit-out"));
    const saved = first.current();

    const reloaded = setup(saved);
    reloaded.receive(reloaded.ask("r1", "sit-out", saved));

    expect(reloaded.current()).toBe(saved);
    expect(reloaded.marked).toEqual([]);
    reloaded.handler.uploaded(saved);
    await Promise.resolve();
    expect(reloaded.marked).toEqual([{ id: "r1", status: "applied" }]);
  });

  it("marks a request that a copy from the server already holds, straight away", async () => {
    const first = setup(makeSession());
    first.receive(first.ask("r1", "sit-out"));
    const fromServer = first.current();

    // A new host takes over: its copy is the server's, which holds r1 but r1 is still pending.
    const taken = setup(fromServer, { published: new Set([fromServer]) });
    taken.receive(taken.ask("r1", "sit-out", fromServer));
    await Promise.resolve();

    expect(taken.current()).toBe(fromServer);
    expect(taken.marked).toEqual([{ id: "r1", status: "applied" }]);
  });

  it("still applies, and waits to mark, a request the server's copy doesn't hold", async () => {
    const start = makeSession();
    const taken = setup(start, { published: new Set([start]) });
    taken.receive(taken.ask("r1", "sit-out"));
    await Promise.resolve();

    expect(taken.current().appliedRequestIds).toEqual(["r1"]);
    expect(taken.marked).toEqual([]);
  });
});
