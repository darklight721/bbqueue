import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import type { Club, Session, SessionSummary } from "../domain/types.ts";
import {
  getClubs,
  getSession,
  getSummary,
  resetStoreForTests,
  setClubs,
  setSession,
  setSummary,
  useClubs,
  useSession,
  useSummary,
} from "./store.ts";

const club: Club = { id: "c1", name: "Club", players: [] };

const session: Session = {
  id: "s1",
  name: "Tuesday",
  clubId: null,
  pointSystem: 31,
  plannedHours: 1,
  startedAt: 1,
  players: [],
  courts: [],
  matches: [],
  queues: [],
  streakResetAt: {},
};

const summary: SessionSummary = {
  sessionName: "Tuesday",
  totalMatches: 0,
  totalPlayers: 0,
  startedAt: 1,
  endedAt: 2,
  topWinners: [],
};

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
  setSummary(null);
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

describe("summary store", () => {
  it("sets, notifies, and clears with null", () => {
    const { result } = renderHook(() => useSummary());
    expect(result.current).toBeNull();
    act(() => setSummary(summary));
    expect(result.current).toEqual(summary);
    expect(getSummary()).toEqual(summary);
    act(() => setSummary(null));
    expect(result.current).toBeNull();
    expect(localStorage.getItem("bq:v1:summary")).toBeNull();
  });

  it("refreshes on a storage event", () => {
    const { result } = renderHook(() => useSummary());
    localStorage.setItem("bq:v1:summary", envelope(summary));
    act(() => storageEvent("bq:v1:summary"));
    expect(result.current).toEqual(summary);
  });
});
