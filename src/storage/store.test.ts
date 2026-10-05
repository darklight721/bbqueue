import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import type { ActiveSession, Club, EndedSession, Session } from "../domain/types.ts";
import {
  applyActiveSessionOf,
  applyEndedSessionsReport,
  addHostedSession,
  applyActiveSessionsReport,
  findActiveSession,
  getActiveSessions,
  getSharedSessions,
  isPublishedCopy,
  removeSharedSession,
  setHostedSession,
  useActiveSessions,
  getAccount,
  getClubs,
  getSharedClubs,
  getSession,
  getWelcomeDone,
  addEndedSession,
  getEndedSessions,
  resetStoreForTests,
  setAccount,
  setLocalClubs,
  setSharedClubs,
  setSession,
  setWelcomeDone,
  useAccount,
  useClubs,
  useEndedSessions,
  useWelcomeDone,
} from "./store.ts";

const club: Club = { id: "c1", name: "Club", kind: "local", players: [] };

const session: Session = {
  id: "s1",
  name: "Tuesday",
  clubId: null,
  clubName: null,
  pointSystem: 31,
  plannedHours: 1,
  startedAt: 1,
  players: [],
  courts: [],
  matches: [],
  queues: [],
  streakResetAt: {},
};

function endedSession(id: string, endedAt: number): EndedSession {
  return {
    id,
    name: `Session ${id}`,
    clubId: null,
    clubName: null,
    pointSystem: 21,
    startedAt: endedAt - 1000,
    endedAt,
    players: [],
    matches: [],
  };
}

function envelope(data: unknown) {
  return JSON.stringify({ version: 1, data });
}

function storageEvent(key: string | null) {
  window.dispatchEvent(new StorageEvent("storage", { key }));
}

beforeEach(() => {
  localStorage.clear();
  resetStoreForTests();
  // Ensure caches are empty for the next read.
  setLocalClubs([]);
  setSession(null);
  localStorage.clear();
  resetStoreForTests();
});

describe("clubs store", () => {
  it("starts empty with a stable reference", () => {
    const { result, rerender } = renderHook(() => useClubs());
    const first = result.current;
    expect(first).toEqual([]);
    rerender();
    expect(result.current).toBe(first);
  });

  it("persists and notifies subscribers on set", () => {
    const { result } = renderHook(() => useClubs());
    act(() => setLocalClubs([club]));
    expect(result.current).toEqual([club]);
    expect(getClubs()).toEqual([club]);
    expect(JSON.parse(localStorage.getItem("bq:v1:clubs")!)).toEqual({ version: 1, data: [club] });
  });

  it("loads from localStorage after a reset", () => {
    localStorage.setItem("bq:v1:clubs", envelope([club]));
    resetStoreForTests();
    expect(getClubs()).toEqual([club]);
  });

  it("refreshes on a storage event from another tab", () => {
    const { result } = renderHook(() => useClubs());
    expect(result.current).toEqual([]);
    localStorage.setItem("bq:v1:clubs", envelope([club]));
    act(() => storageEvent("bq:v1:clubs"));
    expect(result.current).toEqual([club]);
  });

  it("ignores storage events for unrelated keys", () => {
    const { result } = renderHook(() => useClubs());
    const before = result.current;
    localStorage.setItem("bq:v1:clubs", envelope([club]));
    act(() => storageEvent("other"));
    expect(result.current).toBe(before);
  });
});

/** The device's own Session, as a screen sees it. */
const useDeviceSession = () => useActiveSessions().find((entry) => !entry.shared)?.session ?? null;

describe("session store", () => {
  it("sets, notifies, and clears with null", () => {
    const { result } = renderHook(() => useDeviceSession());
    expect(result.current).toBeNull();
    act(() => setSession(session));
    expect(result.current).toEqual(session);
    expect(getSession()).toEqual(session);
    expect(localStorage.getItem("bq:v1:session")).not.toBeNull();
    act(() => setSession(null));
    expect(result.current).toBeNull();
    expect(localStorage.getItem("bq:v1:session")).toBeNull();
  });

  it("refreshes on a storage event, including removal and clear()", () => {
    setSession(session);
    const { result } = renderHook(() => useDeviceSession());
    expect(result.current).toEqual(session);
    localStorage.removeItem("bq:v1:session");
    act(() => storageEvent("bq:v1:session"));
    expect(result.current).toBeNull();

    localStorage.setItem("bq:v1:session", envelope(session));
    act(() => storageEvent(null));
    expect(result.current).toEqual(session);
  });
});

describe("ended sessions store", () => {
  it("starts empty with a stable reference", () => {
    const { result, rerender } = renderHook(() => useEndedSessions());
    const first = result.current;
    expect(first).toEqual([]);
    rerender();
    expect(result.current).toBe(first);
  });

  it("adds newest first, persists and notifies", () => {
    const { result } = renderHook(() => useEndedSessions());
    act(() => addEndedSession(endedSession("a", 1000)));
    act(() => addEndedSession(endedSession("b", 2000)));
    expect(result.current.map((e) => e.id)).toEqual(["b", "a"]);
    expect(getEndedSessions().map((e) => e.id)).toEqual(["b", "a"]);
    expect(JSON.parse(localStorage.getItem("bq:v1:ended-sessions")!).version).toBe(1);
  });

  it("keeps at most 50", () => {
    for (let i = 1; i <= 52; i++) addEndedSession(endedSession(`s${i}`, i * 1000));
    const all = getEndedSessions();
    expect(all).toHaveLength(50);
    expect(all[0]!.id).toBe("s52");
    expect(all.at(-1)!.id).toBe("s3");
  });

  it("loads from localStorage after a reset and drops the old summary key", () => {
    localStorage.setItem("bq:v1:ended-sessions", envelope([endedSession("a", 1)]));
    localStorage.setItem("bq:v1:summary", envelope({ sessionName: "old" }));
    resetStoreForTests();
    expect(getEndedSessions().map((e) => e.id)).toEqual(["a"]);
    expect(localStorage.getItem("bq:v1:summary")).toBeNull();
  });

  it("refreshes on a storage event from another tab", () => {
    const { result } = renderHook(() => useEndedSessions());
    localStorage.setItem("bq:v1:ended-sessions", envelope([endedSession("a", 1)]));
    act(() => storageEvent("bq:v1:ended-sessions"));
    expect(result.current.map((e) => e.id)).toEqual(["a"]);
  });
});

describe("Account and Welcome done", () => {
  it("has no Account and the Welcome screen is not done at first", () => {
    expect(getAccount()).toBeNull();
    expect(getWelcomeDone()).toBe(false);
  });

  it("remembers the Account on the device and notifies subscribers", () => {
    const { result } = renderHook(() => useAccount());
    expect(result.current).toBeNull();

    act(() => setAccount({ accountId: "roy-7k3f", name: "Roy" }));
    expect(result.current).toEqual({ accountId: "roy-7k3f", name: "Roy" });

    resetStoreForTests();
    expect(getAccount()).toEqual({ accountId: "roy-7k3f", name: "Roy" });
  });

  it("clears the Account", () => {
    setAccount({ accountId: "roy-7k3f", name: "Roy" });
    setAccount(null);
    resetStoreForTests();
    expect(getAccount()).toBeNull();
    expect(localStorage.getItem("bq:v1:account")).toBeNull();
  });

  it("doesn't notify when the Account is unchanged", () => {
    setAccount({ accountId: "roy-7k3f", name: "Roy" });
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useAccount();
    });
    const before = renders;
    act(() => setAccount({ accountId: "roy-7k3f", name: "Roy" }));
    expect(renders).toBe(before);
  });

  it("remembers that the Welcome screen is done", () => {
    const { result } = renderHook(() => useWelcomeDone());
    expect(result.current).toBe(false);

    act(() => setWelcomeDone());
    expect(result.current).toBe(true);

    resetStoreForTests();
    expect(getWelcomeDone()).toBe(true);
  });

  it("refreshes on a storage event from another tab", () => {
    const { result } = renderHook(() => useAccount());
    localStorage.setItem("bq:v1:account", envelope({ accountId: "ana-2222", name: "Ana" }));
    act(() => storageEvent("bq:v1:account"));
    expect(result.current).toEqual({ accountId: "ana-2222", name: "Ana" });
  });
});

describe("Local and Shared clubs", () => {
  const shared: Club = { id: "s1", name: "Shared", kind: "shared", players: [] };

  it("shows Local clubs and Shared clubs together", () => {
    const { result } = renderHook(() => useClubs());
    act(() => setLocalClubs([club]));
    act(() => setSharedClubs([shared]));
    expect(result.current.map((c) => c.id)).toEqual(["c1", "s1"]);
  });

  it("keeps Shared clubs on the device and out of the Local clubs", () => {
    setLocalClubs([club]);
    setSharedClubs([shared]);
    resetStoreForTests();
    expect(getSharedClubs()).toEqual([shared]);
    expect(getClubs().map((c) => c.id)).toEqual(["c1", "s1"]);
    expect(JSON.parse(localStorage.getItem("bq:v1:clubs")!).data.map((c: Club) => c.id)).toEqual([
      "c1",
    ]);
  });

  it("gives the same list until something changes", () => {
    setSharedClubs([shared]);
    expect(getClubs()).toBe(getClubs());
  });

  it("doesn't notify for an identical Shared clubs update", () => {
    setSharedClubs([shared]);
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useClubs();
    });
    const before = renders;
    act(() => setSharedClubs([{ ...shared }]));
    expect(renders).toBe(before);
  });

  it("drops Shared clubs when the Backend reports none", () => {
    setSharedClubs([shared]);
    setSharedClubs([]);
    expect(getClubs().map((c) => c.id)).toEqual([]);
  });
});

describe("Active sessions of Shared clubs", () => {
  const shared = (id: string, clubId = "c1", host = "roy-7k3f"): ActiveSession => ({
    clubId,
    session: { ...session, id, clubId, clubName: "Riverside" },
    hostAccountId: host,
    hostName: "Roy",
    updatedAt: 5000,
  });

  beforeEach(() => {
    localStorage.clear();
    resetStoreForTests();
    setAccount({ accountId: "ana-2222", name: "Ana" });
  });

  it("holds the device's own Session next to one Active session per Shared club", () => {
    setSession(session);
    applyActiveSessionsReport({ sessions: [shared("s2", "c1"), shared("s3", "c2")], unknown: [] });

    const entries = getActiveSessions();

    expect(entries.map((e) => [e.session.id, e.shared?.clubId ?? null])).toEqual([
      ["s1", null],
      ["s2", "c1"],
      ["s3", "c2"],
    ]);
    expect(findActiveSession("s2")?.shared?.hostAccountId).toBe("roy-7k3f");
    expect(findActiveSession("nope")).toBeNull();
    // Stable between reads, so React doesn't re-render for nothing.
    expect(getActiveSessions()).toBe(entries);
  });

  it("keeps a Shared club's Session on the device across a reload, for viewing offline", () => {
    applyActiveSessionsReport({ sessions: [shared("s2")], unknown: [] });

    resetStoreForTests();

    expect(getSharedSessions().map((e) => e.session.id)).toEqual(["s2"]);
    expect(getSharedSessions()[0]?.updatedAt).toBe(5000);
  });

  it("drops a session the server no longer reports", () => {
    applyActiveSessionsReport({ sessions: [shared("s2")], unknown: [] });
    applyActiveSessionsReport({ sessions: [], unknown: [] });

    expect(getSharedSessions()).toEqual([]);
  });

  it("runs a hosted Session on the device: changes stay, and a late report doesn't undo them", () => {
    setAccount({ accountId: "roy-7k3f", name: "Roy" });
    addHostedSession(shared("s2"));
    const changed = { ...shared("s2").session, name: "Changed on court" };

    setHostedSession("c1", changed);
    applyActiveSessionsReport({ sessions: [shared("s2")], unknown: [] });

    expect(getSharedSessions()[0]?.session.name).toBe("Changed on court");
    // And it isn't dropped when the server has nothing to say about it yet.
    applyActiveSessionsReport({ sessions: [], unknown: [] });
    expect(getSharedSessions()).toHaveLength(1);
  });

  it("marks copies the server has, so only the host's own changes need uploading", () => {
    setAccount({ accountId: "roy-7k3f", name: "Roy" });
    const started = shared("s2");
    addHostedSession(started);
    expect(isPublishedCopy(started.session)).toBe(true);

    const changed = { ...started.session, name: "Changed" };
    setHostedSession("c1", changed);
    expect(isPublishedCopy(changed)).toBe(false);

    applyActiveSessionsReport({ sessions: [shared("s9", "c2")], unknown: [] });
    expect(isPublishedCopy(getSharedSessions().find((e) => e.clubId === "c2")!.session)).toBe(true);
  });

  it("doesn't bring back a session this device just ended when a late report still lists it", () => {
    setAccount({ accountId: "roy-7k3f", name: "Roy" });
    addHostedSession(shared("s2"));

    removeSharedSession("c1", { endedHere: true });
    applyActiveSessionsReport({ sessions: [shared("s2")], unknown: [] });

    expect(getSharedSessions()).toEqual([]);
  });

  describe("a Session this device ended", () => {
    const endedHereOnDevice = () => localStorage.getItem("bq:v1:ended-here");

    beforeEach(() => {
      setAccount({ accountId: "roy-7k3f", name: "Roy" });
      addHostedSession(shared("s2"));
      removeSharedSession("c1", { endedHere: true });
    });

    it("stays gone after the app is closed and opened again, while the server still lists it", () => {
      expect(endedHereOnDevice()).not.toBeNull();

      // Closed with the delete still on its way; opened again: the server's old copy comes in.
      resetStoreForTests();
      applyActiveSessionsReport({ sessions: [shared("s2")], unknown: [] });

      expect(getSharedSessions()).toEqual([]);
    });

    it("is forgotten once the server reports the Session gone", () => {
      applyActiveSessionsReport({ sessions: [], unknown: [] });

      expect(endedHereOnDevice()).toBeNull();
    });

    it("is not forgotten while the Club's Session isn't known, or the server still lists it", () => {
      applyActiveSessionsReport({ sessions: [], unknown: ["c1"] });
      expect(endedHereOnDevice()).not.toBeNull();

      applyActiveSessionsReport({ sessions: [shared("s2")], unknown: [] });
      expect(endedHereOnDevice()).not.toBeNull();
    });

    it("lets the Club have a new Session once the old one is reported gone", () => {
      applyActiveSessionsReport({ sessions: [], unknown: [] });
      applyActiveSessionsReport({ sessions: [shared("s3")], unknown: [] });

      expect(getSharedSessions().map((entry) => entry.session.id)).toEqual(["s3"]);
    });

    it("is forgotten for the Club the server was asked about, and only for it", () => {
      addHostedSession(shared("s9", "c9"));
      removeSharedSession("c9", { endedHere: true });

      applyActiveSessionOf("c1", null);

      expect(JSON.parse(endedHereOnDevice()!).data).toEqual({ s9: "c9" });
    });

    it("is forgotten when this device starts hosting a Session of that id again", () => {
      addHostedSession(shared("s2"));

      expect(endedHereOnDevice()).toBeNull();
    });
  });

  it("re-renders hooks when either kind of Active session changes", () => {
    const { result } = renderHook(() => useActiveSessions());
    expect(result.current).toEqual([]);

    act(() => setSession(session));
    expect(result.current.map((e) => e.session.id)).toEqual(["s1"]);

    act(() => applyActiveSessionsReport({ sessions: [shared("s2")], unknown: [] }));
    expect(result.current.map((e) => e.session.id)).toEqual(["s1", "s2"]);
  });
});

describe("Ended sessions of Shared clubs", () => {
  const ended = (id: string, clubId: string | null, endedAt: number): EndedSession => ({
    id,
    name: id,
    clubId,
    clubName: null,
    pointSystem: 21,
    startedAt: endedAt - 1000,
    endedAt,
    players: [],
    matches: [],
  });

  beforeEach(() => {
    localStorage.clear();
    resetStoreForTests();
    setSharedClubs([
      { id: "c1", name: "One", kind: "shared", players: [] },
      { id: "c2", name: "Two", kind: "shared", players: [] },
    ]);
  });

  it("shows them with the device's own, newest first, each Session once", () => {
    addEndedSession(ended("mine", null, 2000));
    addEndedSession(ended("hosted", "c1", 3000));
    applyEndedSessionsReport({
      sessions: [
        ended("hosted", "c1", 3000),
        ended("theirs", "c2", 1000),
        ended("later", "c1", 4000),
      ],
      clubIds: ["c1", "c2"],
    });

    expect(getEndedSessions().map((e) => e.id)).toEqual(["later", "hosted", "mine", "theirs"]);
  });

  it("keeps the newest 50 per Club, and what it already had when a report is shorter", () => {
    const many = Array.from({ length: 55 }, (_, i) => ended(`s${i}`, "c1", 1000 + i));
    applyEndedSessionsReport({ sessions: many, clubIds: ["c1"] });
    expect(getEndedSessions()).toHaveLength(50);
    expect(getEndedSessions()[0]?.id).toBe("s54");

    applyEndedSessionsReport({ sessions: [many[54]!], clubIds: ["c1"] });
    expect(getEndedSessions()).toHaveLength(50);
  });

  it("drops a Club's sessions when the Account is no longer on it", () => {
    applyEndedSessionsReport({
      sessions: [ended("a", "c1", 1), ended("b", "c2", 2)],
      clubIds: ["c1", "c2"],
    });

    applyEndedSessionsReport({ sessions: [ended("a", "c1", 1)], clubIds: ["c1"] });

    expect(getEndedSessions().map((e) => e.id)).toEqual(["a"]);
  });

  it("hides a Club's sessions at once when it leaves the Shared clubs, and keeps them across a reload", () => {
    applyEndedSessionsReport({ sessions: [ended("a", "c1", 1)], clubIds: ["c1", "c2"] });
    resetStoreForTests();
    setSharedClubs([{ id: "c1", name: "One", kind: "shared", players: [] }]);
    expect(getEndedSessions().map((e) => e.id)).toEqual(["a"]);

    setSharedClubs([]);
    expect(getEndedSessions()).toEqual([]);
  });

  it("re-renders hooks when the Backend reports", () => {
    const { result } = renderHook(() => useEndedSessions());
    expect(result.current).toEqual([]);

    act(() => applyEndedSessionsReport({ sessions: [ended("a", "c1", 1)], clubIds: ["c1"] }));

    expect(result.current.map((e) => e.id)).toEqual(["a"]);
  });
});
