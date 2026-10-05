import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { ActiveSession, EndedSession, Session } from "../domain/types.ts";
import {
  MAX_SHARED_ENDED_CACHE_CHARS,
  loadEndedSessions,
  loadSession,
  loadSharedEndedSessions,
  loadSharedSessions,
  saveEndedSession,
  saveSession,
  saveSharedEndedSessions,
  saveSharedSessions,
} from "./storage.ts";
import {
  addEndedSession,
  applyEndedSessionsReport,
  getSession,
  getSharedEndedSessions,
  resetStoreForTests,
  setAccount,
  setSession,
  setSharedClubs,
} from "./store.ts";

/**
 * localStorage that holds only `limit` characters, as a device with a nearly full storage does:
 * a write that would pass it throws QuotaExceededError, and nothing changes. It starts with what
 * is stored now.
 */
function limitStorage(limit: number) {
  const items = new Map<string, string>();
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    items.set(key, localStorage.getItem(key)!);
  }
  const used = (except: string) =>
    [...items].reduce(
      (sum, [key, value]) => sum + (key === except ? 0 : key.length + value.length),
      0,
    );
  const limited: Storage = {
    get length() {
      return items.size;
    },
    key: (index) => [...items.keys()][index] ?? null,
    getItem: (key) => items.get(key) ?? null,
    setItem(key, value) {
      if (used(key) + key.length + value.length > limit) {
        throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      }
      items.set(key, value);
    },
    removeItem: (key) => void items.delete(key),
    clear: () => items.clear(),
  };
  vi.stubGlobal("localStorage", limited);
}

const ME = "roy-7k3f";

function session(id: string, padding = 0): Session {
  return {
    id,
    name: "x".repeat(padding) || `Session ${id}`,
    clubId: null,
    clubName: null,
    pointSystem: 21,
    plannedHours: 2,
    startedAt: 1000,
    players: [],
    courts: [],
    matches: [],
    queues: [],
    streakResetAt: {},
  };
}

function ended(
  id: string,
  endedAt: number,
  clubId: string | null = null,
  padding = 0,
): EndedSession {
  return {
    id,
    name: padding ? "y".repeat(padding) : `Ended ${id}`,
    clubId,
    clubName: null,
    pointSystem: 21,
    startedAt: endedAt - 1000,
    endedAt,
    players: [],
    matches: [],
  };
}

const shared = (clubId: string, hostAccountId: string, padding = 0): ActiveSession => ({
  clubId,
  session: session(`s-${clubId}`, padding),
  hostAccountId,
  hostName: "Host",
  updatedAt: 1,
});

beforeEach(() => {
  localStorage.clear();
  resetStoreForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("saving an Active session when storage is nearly full", () => {
  it("saves the device's Session by giving up the cache of Shared clubs' Ended sessions first", () => {
    saveSharedEndedSessions([ended("a", 5, "c1", 3000), ended("b", 4, "c1", 3000)]);
    expect(loadSharedEndedSessions()).toHaveLength(2);
    limitStorage(7_000);

    saveSession(session("mine", 1500), ME);

    expect(loadSession()?.id).toBe("mine");
    expect(loadSharedEndedSessions()).toEqual([]);
  });

  it("then gives up copies of Sessions it only watches, and keeps the one it hosts", () => {
    saveSharedSessions([shared("c1", ME, 100), shared("c2", "ana-2222", 2500)], ME);
    limitStorage(4_000);

    saveSession(session("mine", 1500), ME);

    expect(loadSession()?.id).toBe("mine");
    expect(loadSharedSessions().map((entry) => entry.clubId)).toEqual(["c1"]);
  });

  it("then gives up the oldest of the device's own Ended sessions, one at a time, and keeps the rest", () => {
    saveEndedSession(
      saveEndedSession(
        saveEndedSession([], ended("old", 1, null, 1500)),
        ended("mid", 2, null, 1500),
      ),
      ended("new", 3, null, 1500),
    );
    expect(loadEndedSessions()).toHaveLength(3);
    // Room for the Session and two of the three Ended sessions.
    limitStorage(6_000);

    saveSession(session("mine", 1500), ME);

    expect(loadSession()?.id).toBe("mine");
    expect(loadEndedSessions().map((e) => e.id)).toEqual(["new", "mid"]);
  });

  it("saves a hosted Session in the Shared clubs' Sessions the same way", () => {
    saveSharedEndedSessions([ended("a", 5, "c1", 3000)]);
    saveSharedSessions([shared("c2", "ana-2222", 1500)], ME);
    limitStorage(5_000);

    saveSharedSessions([shared("c1", ME, 1500), shared("c2", "ana-2222", 1500)], ME);

    expect(loadSharedEndedSessions()).toEqual([]);
    expect(loadSharedSessions().map((entry) => entry.clubId)).toEqual(["c1", "c2"]);
  });

  it("when that isn't enough either, drops the watched copies from what it saves and keeps the hosted one", () => {
    saveSharedSessions([shared("c2", "ana-2222", 1500)], ME);
    limitStorage(2_500);

    saveSharedSessions([shared("c1", ME, 1500), shared("c2", "ana-2222", 1500)], ME);

    expect(loadSharedSessions().map((entry) => entry.clubId)).toEqual(["c1"]);
  });

  it("logs, and doesn't throw, when there is nothing left to give up", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    limitStorage(100);

    expect(() => saveSession(session("mine", 1500), ME)).not.toThrow();

    expect(error).toHaveBeenCalled();
    expect(loadSession()).toBeNull();
  });

  it("doesn't touch the Ended sessions or the cache when the Session just fits", () => {
    saveSharedEndedSessions([ended("a", 5, "c1")]);
    saveEndedSession([], ended("mine", 3));

    saveSession(session("mine"), ME);

    expect(loadSharedEndedSessions()).toHaveLength(1);
    expect(loadEndedSessions()).toHaveLength(1);
  });

  it("through the store: a full cache of Shared clubs' Ended sessions doesn't lose the Session", () => {
    setAccount({ accountId: ME, name: "Roy" });
    setSharedClubs([{ id: "c1", name: "Club", kind: "shared", players: [] }]);
    applyEndedSessionsReport({
      clubIds: ["c1"],
      sessions: [ended("a", 5, "c1", 2500), ended("b", 4, "c1", 2500)],
    });
    expect(getSharedEndedSessions()).toHaveLength(2);
    limitStorage(9_000);

    setSession(session("mine", 1500));
    resetStoreForTests();

    expect(getSession()?.id).toBe("mine");
  });
});

describe("the cache of Shared clubs' Ended sessions", () => {
  it("keeps the newest that fit in about 1.5 MB, not whatever fits", () => {
    const big = (id: string, endedAt: number) => ended(id, endedAt, "c1", 100_000);
    const many = Array.from({ length: 30 }, (_, i) => big(`e${i}`, 1000 + i));

    const kept = saveSharedEndedSessions(many);

    expect(kept.length).toBeGreaterThan(10);
    expect(kept.length).toBeLessThan(16);
    expect(JSON.stringify(kept).length).toBeLessThanOrEqual(MAX_SHARED_ENDED_CACHE_CHARS);
    // The newest are the ones kept.
    expect(kept[0]?.id).toBe("e29");
    expect(loadSharedEndedSessions()).toHaveLength(kept.length);
  });

  it("is dropped from the end when storage is full as well", () => {
    limitStorage(2_000);
    const kept = saveSharedEndedSessions([
      ended("a", 3, "c1", 600),
      ended("b", 2, "c1", 600),
      ended("c", 1, "c1", 600),
    ]);
    expect(kept.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("holds nothing for a Session this device ended itself: it is already among the device's own", () => {
    setAccount({ accountId: ME, name: "Roy" });
    addEndedSession(ended("hosted", 9, "c1"));

    applyEndedSessionsReport({
      clubIds: ["c1"],
      sessions: [ended("hosted", 9, "c1"), ended("theirs", 8, "c1")],
    });

    expect(getSharedEndedSessions().map((e) => e.id)).toEqual(["theirs"]);
    expect(loadSharedEndedSessions().map((e) => e.id)).toEqual(["theirs"]);
  });
});
