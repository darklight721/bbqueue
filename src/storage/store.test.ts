import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import type { Club, EndedSession, Session } from "../domain/types.ts";
import {
  getAccount,
  getClubs,
  getSession,
  getWelcomeDone,
  addEndedSession,
  getEndedSessions,
  resetStoreForTests,
  setAccount,
  setClubs,
  setSession,
  setWelcomeDone,
  useAccount,
  useClubs,
  useEndedSessions,
  useSession,
  useWelcomeDone,
} from "./store.ts";

const club: Club = { id: "c1", name: "Club", players: [] };

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
  setClubs([]);
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
    act(() => setClubs([club]));
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

describe("session store", () => {
  it("sets, notifies, and clears with null", () => {
    const { result } = renderHook(() => useSession());
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
    const { result } = renderHook(() => useSession());
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
