import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Club, EndedSession, Session } from "../domain/types.ts";
import {
  MAX_ENDED_SESSIONS,
  clearSession,
  loadClubs,
  loadEndedSessions,
  loadSession,
  saveClubs,
  saveEndedSession,
  saveSession,
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

function endedSession(id: string, endedAt: number): EndedSession {
  return {
    id,
    name: `Session ${id}`,
    clubId: null,
    pointSystem: 21,
    startedAt: endedAt - 1000,
    endedAt,
    players: [{ id: "p1", name: "Ann", skill: "advanced" }],
    matches: [
      {
        number: 1,
        courtNumber: 1,
        teams: [
          ["p1", "p2"],
          ["p3", "p4"],
        ],
        target: 21,
        startedAt: endedAt - 900,
        endedAt: endedAt - 100,
        score: [21, 10],
      },
    ],
  };
}

const ENDED_KEY = "bq:v1:ended-sessions";
const storedIds = () =>
  (JSON.parse(localStorage.getItem(ENDED_KEY)!).data as EndedSession[]).map((e) => e.id);

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

  it("gives Matches saved without a Target the Session's Point system", () => {
    const legacyMatch = {
      id: "m1",
      number: 1,
      courtNumber: 1,
      teams: [
        ["a", "b"],
        ["c", "d"],
      ],
      freeAtStart: [],
      startedAt: 1,
      endedAt: 2,
      score: [21, 10],
      status: "ended",
    };
    const legacy = { ...session, pointSystem: 31, matches: [legacyMatch] };
    localStorage.setItem("bq:v1:session", JSON.stringify({ version: 1, data: legacy }));
    expect(loadSession()?.matches[0]).toMatchObject({ id: "m1", target: 31 });
    const withTarget = { ...legacy, matches: [{ ...legacyMatch, target: 21 }] };
    localStorage.setItem("bq:v1:session", JSON.stringify({ version: 1, data: withTarget }));
    expect(loadSession()?.matches[0]!.target).toBe(21);
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

describe("ended sessions", () => {
  it("is empty when nothing is stored", () => {
    expect(loadEndedSessions()).toEqual([]);
  });

  it("round-trips in the usual envelope, newest first by endedAt", () => {
    const old = endedSession("old", 1000);
    const recent = endedSession("recent", 3000);
    saveEndedSession([], old);
    saveEndedSession([old], recent);
    expect(loadEndedSessions()).toEqual([recent, old]);
    expect(JSON.parse(localStorage.getItem(ENDED_KEY)!)).toEqual({
      version: 1,
      data: [recent, old],
    });
  });

  it("replaces an Ended session with the same id", () => {
    const first = endedSession("a", 1000);
    saveEndedSession([], first);
    const again = { ...first, name: "Renamed" };
    expect(saveEndedSession([first], again)).toEqual([again]);
    expect(storedIds()).toEqual(["a"]);
  });

  it("keeps at most 50, dropping the oldest by endedAt", () => {
    let list: EndedSession[] = [];
    for (let i = 1; i <= MAX_ENDED_SESSIONS; i++) {
      list = saveEndedSession(list, endedSession(`s${i}`, i * 1000));
    }
    expect(list).toHaveLength(50);
    list = saveEndedSession(list, endedSession("newest", 999_000));
    expect(list).toHaveLength(50);
    expect(list[0]!.id).toBe("newest");
    expect(list.some((e) => e.id === "s1")).toBe(false);
    expect(storedIds()).toHaveLength(50);
    expect(storedIds()).not.toContain("s1");
  });

  it("drops the oldest and retries when storage is full", () => {
    const existing = [endedSession("c", 3000), endedSession("b", 2000), endedSession("a", 1000)];
    const attempts: number[] = [];
    vi.spyOn(Storage.prototype, "setItem").mockImplementation((key: string, value: string) => {
      const length = (JSON.parse(value).data as unknown[]).length;
      attempts.push(length);
      if (length > 2) throw new DOMException("full", "QuotaExceededError");
      localStorage[key] = value; // the named setter skips the mocked setItem
    });
    const kept = saveEndedSession(existing, endedSession("d", 4000));
    expect(attempts).toEqual([4, 3, 2]);
    expect(kept.map((e) => e.id)).toEqual(["d", "c"]);
    expect(storedIds()).toEqual(["d", "c"]);
  });

  it("logs and does not throw when even a lone Ended session does not fit", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    const only = endedSession("d", 4000);
    expect(() => saveEndedSession([endedSession("c", 3000)], only)).not.toThrow();
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("removes the old summary key on load", () => {
    localStorage.setItem(
      "bq:v1:summary",
      JSON.stringify({ version: 1, data: { sessionName: "x" } }),
    );
    loadEndedSessions();
    expect(localStorage.getItem("bq:v1:summary")).toBeNull();
  });

  it("treats corrupt JSON, wrong version and bad shape as absent", () => {
    localStorage.setItem(ENDED_KEY, "[");
    expect(loadEndedSessions()).toEqual([]);
    localStorage.setItem(ENDED_KEY, JSON.stringify({ version: 9, data: [] }));
    expect(loadEndedSessions()).toEqual([]);
    localStorage.setItem(ENDED_KEY, JSON.stringify({ version: 1, data: [{ id: 1 }] }));
    expect(loadEndedSessions()).toEqual([]);
    localStorage.setItem(ENDED_KEY, JSON.stringify({ version: 1, data: {} }));
    expect(loadEndedSessions()).toEqual([]);
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
    expect(() => saveEndedSession([], endedSession("a", 1))).not.toThrow();
    expect(error).toHaveBeenCalledTimes(3);
  });

  it("swallows read errors", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(loadClubs()).toEqual([]);
    expect(loadSession()).toBeNull();
    expect(loadEndedSessions()).toEqual([]);
  });
});
