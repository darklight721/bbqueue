import { describe, expect, it } from "vite-plus/test";
import type { ActiveSession, Session } from "../domain/types.ts";
import { mergeActiveSessions } from "./sharedSessions.ts";

function session(id: string, name = id, clubId: string | null = "c1"): Session {
  return {
    id,
    name,
    clubId,
    clubName: "Tuesday",
    pointSystem: 21,
    plannedHours: 2,
    startedAt: 1,
    players: [],
    courts: [],
    matches: [],
    queues: [],
    streakResetAt: {},
  };
}

function entry(
  clubId: string,
  host: string,
  sessionId = `s-${clubId}`,
  name = "copy",
  updatedAt = 1000,
): ActiveSession {
  return {
    clubId,
    session: session(sessionId, name, clubId),
    hostAccountId: host,
    hostName: host,
    updatedAt,
  };
}

const ROY = "roy-7k3f";
const ANA = "ana-2222";
const none = { unknown: [] as string[] };

describe("mergeActiveSessions", () => {
  it("takes what the server reports for Clubs somebody else hosts", () => {
    const current = [entry("c1", ROY, "s1", "old", 1000)];
    const incoming = entry("c1", ROY, "s1", "new", 2000);

    const merged = mergeActiveSessions({
      current,
      report: { sessions: [incoming], ...none },
      me: ANA,
    });

    expect(merged).toEqual([incoming]);
  });

  it("keeps the Session this device hosts, whatever the server reports for it", () => {
    const mine = entry("c1", ROY, "s1", "my latest, not uploaded yet");
    const stale = entry("c1", ROY, "s1", "what the server has");

    const merged = mergeActiveSessions({
      current: [mine],
      report: { sessions: [stale], ...none },
      me: ROY,
    });

    expect(merged).toHaveLength(1);
    expect(merged[0]).toBe(mine);
  });

  it("takes the server's copy when it hosts a different Session or somebody else hosts it now", () => {
    const mine = entry("c1", ROY, "s1", "mine");
    const replaced = entry("c1", ROY, "s2", "another session");
    const takenOver = entry("c1", ANA, "s1", "ana runs it");

    expect(
      mergeActiveSessions({ current: [mine], report: { sessions: [replaced], ...none }, me: ROY }),
    ).toEqual([replaced]);
    expect(
      mergeActiveSessions({ current: [mine], report: { sessions: [takenOver], ...none }, me: ROY }),
    ).toEqual([takenOver]);
  });

  it("starts hosting a session the server says this Account hosts, when the device has no copy", () => {
    const fromServer = entry("c1", ROY);
    expect(
      mergeActiveSessions({ current: [], report: { sessions: [fromServer], ...none }, me: ROY }),
    ).toEqual([fromServer]);
  });

  it("drops a session that is no longer reported, because it ended or the Club was left", () => {
    const merged = mergeActiveSessions({
      current: [entry("c1", ROY), entry("c2", ROY)],
      report: { sessions: [entry("c2", ROY)], ...none },
      me: ANA,
    });

    expect(merged.map((e) => e.clubId)).toEqual(["c2"]);
  });

  it("never drops the Session this device hosts just because it isn't reported", () => {
    const mine = entry("c1", ROY);

    const merged = mergeActiveSessions({
      current: [mine],
      report: { sessions: [], ...none },
      me: ROY,
    });

    expect(merged).toEqual([mine]);
  });

  it("keeps the cached copy of a Club whose session isn't known yet (offline, fresh start)", () => {
    const cached = entry("c1", ROY);

    const merged = mergeActiveSessions({
      current: [cached],
      report: { sessions: [], unknown: ["c1"] },
      me: ANA,
    });

    expect(merged).toEqual([cached]);
  });

  it("ignores a session this device just ended, until the server stops reporting it", () => {
    const merged = mergeActiveSessions({
      current: [],
      report: { sessions: [entry("c1", ROY, "s1")], ...none },
      me: ROY,
      ended: new Set(["s1"]),
    });

    expect(merged).toEqual([]);
  });

  it("changes nothing without an Account", () => {
    const current = [entry("c1", ROY)];
    expect(mergeActiveSessions({ current, report: { sessions: [], ...none }, me: null })).toEqual(
      current,
    );
  });

  it("recognises the host whatever the capitalisation of the Account ID", () => {
    const mine = entry("c1", ROY.toUpperCase(), "s1", "mine");
    const merged = mergeActiveSessions({
      current: [mine],
      report: { sessions: [entry("c1", ROY, "s1", "server")], ...none },
      me: ROY,
    });
    expect(merged[0]).toBe(mine);
  });

  it("lists sessions in a steady order", () => {
    const merged = mergeActiveSessions({
      current: [],
      report: { sessions: [entry("c2", ROY), entry("c1", ROY)], ...none },
      me: ANA,
    });
    expect(merged.map((e) => e.clubId)).toEqual(["c1", "c2"]);
  });
});
