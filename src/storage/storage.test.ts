import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Club, Session, SessionSummary } from "../domain/types.ts";
import {
  clearSession,
  clearSummary,
  loadClubs,
  loadSession,
  loadSummary,
  saveClubs,
  saveSession,
  saveSummary,
} from "./storage.ts";

const club: Club = {
  id: "c1",
  name: "Club",
  players: [{ id: "p1", name: "Ann", skill: "intermediate" }],
};

const session: Session = {
  id: "s1",
  name: "Tuesday",
  clubId: "c1",
  pointSystem: 21,
  plannedHours: 2,
  startedAt: 1000,
  players: [],
  courts: [],
  matches: [],
  queues: [],
  streakResetAt: {},
};

const summary: SessionSummary = {
  sessionName: "Tuesday",
  totalMatches: 3,
  totalPlayers: 8,
  startedAt: 1000,
  endedAt: 2000,
  topWinners: [{ place: 1, name: "Ann", skill: "advanced", wins: 3, played: 3 }],
};

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("clubs", () => {
  it("is empty when nothing is stored", () => {
    expect(loadClubs()).toEqual([]);
  });

  it("round-trips and wraps data with a version", () => {
    saveClubs([club]);
    expect(loadClubs()).toEqual([club]);
    expect(JSON.parse(localStorage.getItem("bq:v1:clubs")!)).toEqual({ version: 1, data: [club] });
  });

  it("treats corrupt JSON, wrong version and bad shape as absent", () => {
    localStorage.setItem("bq:v1:clubs", "{not json");
    expect(loadClubs()).toEqual([]);
    localStorage.setItem("bq:v1:clubs", JSON.stringify({ version: 2, data: [club] }));
    expect(loadClubs()).toEqual([]);
    localStorage.setItem("bq:v1:clubs", JSON.stringify({ version: 1, data: [{ id: 1 }] }));
    expect(loadClubs()).toEqual([]);
    localStorage.setItem("bq:v1:clubs", JSON.stringify({ version: 1, data: "nope" }));
    expect(loadClubs()).toEqual([]);
    localStorage.setItem("bq:v1:clubs", "null");
    expect(loadClubs()).toEqual([]);
  });
});

describe("session", () => {
  it("is null when nothing is stored", () => {
    expect(loadSession()).toBeNull();
  });

  it("round-trips and clears", () => {
    saveSession(session);
    expect(loadSession()).toEqual(session);
    clearSession();
    expect(loadSession()).toBeNull();
    expect(localStorage.getItem("bq:v1:session")).toBeNull();
  });

  it("treats corrupt JSON, wrong version and bad shape as absent", () => {
    localStorage.setItem("bq:v1:session", "oops");
    expect(loadSession()).toBeNull();
    localStorage.setItem("bq:v1:session", JSON.stringify({ version: 0, data: session }));
    expect(loadSession()).toBeNull();
    localStorage.setItem("bq:v1:session", JSON.stringify({ version: 1, data: { id: "x" } }));
    expect(loadSession()).toBeNull();
  });
});

describe("summary", () => {
  it("is null when nothing is stored", () => {
    expect(loadSummary()).toBeNull();
  });

  it("round-trips and clears", () => {
    saveSummary(summary);
    expect(loadSummary()).toEqual(summary);
    clearSummary();
    expect(loadSummary()).toBeNull();
  });

  it("treats corrupt JSON, wrong version and bad shape as absent", () => {
    localStorage.setItem("bq:v1:summary", "[");
    expect(loadSummary()).toBeNull();
    localStorage.setItem("bq:v1:summary", JSON.stringify({ version: 9, data: summary }));
    expect(loadSummary()).toBeNull();
    localStorage.setItem("bq:v1:summary", JSON.stringify({ version: 1, data: {} }));
    expect(loadSummary()).toBeNull();
  });
});

describe("storage failures", () => {
  it("logs and swallows save errors", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(() => saveClubs([club])).not.toThrow();
    expect(() => saveSession(session)).not.toThrow();
    expect(() => saveSummary(summary)).not.toThrow();
    expect(error).toHaveBeenCalledTimes(3);
  });

  it("swallows read errors", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(loadClubs()).toEqual([]);
    expect(loadSession()).toBeNull();
    expect(loadSummary()).toBeNull();
  });
});
