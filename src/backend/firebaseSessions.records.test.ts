import { describe, expect, it } from "vite-plus/test";
import { toEndedSession as slim } from "../domain/engine/endedSession.ts";
import { match, player, session } from "../domain/engine/test-utils.ts";
import { toActiveSession, toEndedSession } from "./firebaseSessions.ts";

const T = 1_000_000_000_000;
const night = session({
  players: [player("a"), player("b"), player("c"), player("d")],
  matches: [
    match({
      id: "m1",
      teams: [
        ["a", "b"],
        ["c", "d"],
      ],
      startedAt: T,
      endedAt: T + 1000,
      number: 1,
    }),
  ],
});
const ended = slim(night, T + 2000)!;

const activeRecord = (sessionJson: string, extra: Record<string, unknown> = {}) => ({
  sessionJson,
  hostAccountId: "roy-7k3f",
  hostName: "Roy",
  updatedAt: null,
  ...extra,
});

describe("reading an Active session record from the server", () => {
  it("reads a good record", () => {
    const active = toActiveSession("c1", activeRecord(JSON.stringify(night)));
    expect(active?.clubId).toBe("c1");
    expect(active?.session).toEqual(night);
    expect(active?.hostName).toBe("Roy");
  });

  it.each([
    ["text that isn't JSON", "{nope"],
    ["JSON of the wrong kind", "[1,2]"],
    ["a null Match", JSON.stringify({ ...night, matches: [null] })],
    ["a name that is an object", JSON.stringify({ ...night, name: {} })],
    ["a null player", JSON.stringify({ ...night, players: [null] })],
  ])("ignores a record with %s, without throwing", (_label, json) => {
    expect(() => toActiveSession("c1", activeRecord(json))).not.toThrow();
    expect(toActiveSession("c1", activeRecord(json))).toBeNull();
  });

  it("ignores a record whose host isn't text", () => {
    expect(toActiveSession("c1", activeRecord(JSON.stringify(night), { hostName: {} }))).toBeNull();
    expect(
      toActiveSession("c1", activeRecord(JSON.stringify(night), { sessionJson: 5 })),
    ).toBeNull();
  });
});

describe("reading an Ended session record from the server", () => {
  it("reads a good record, whose Session id is its name", () => {
    const read = toEndedSession("c1", ended.id, { endedJson: JSON.stringify(ended) });
    expect(read).toEqual({ ...ended, clubId: "c1" });
  });

  it("ignores a record whose Session id isn't the record's name (it could replace or hide another)", () => {
    expect(toEndedSession("c1", "another-id", { endedJson: JSON.stringify(ended) })).toBeNull();
  });

  it("takes the Club from where it was published, not from the copy", () => {
    const claimed = { ...ended, clubId: "somebody-elses" };
    expect(toEndedSession("c1", ended.id, { endedJson: JSON.stringify(claimed) })?.clubId).toBe(
      "c1",
    );
  });

  it.each([
    ["text that isn't JSON", "{nope"],
    ["a null Match", JSON.stringify({ ...ended, matches: [null] })],
    ["a name that is an object", JSON.stringify({ ...ended, name: {} })],
    ["players that aren't a list", JSON.stringify({ ...ended, players: 1 })],
  ])("ignores a record with %s, without throwing", (_label, json) => {
    expect(() => toEndedSession("c1", ended.id, { endedJson: json })).not.toThrow();
    expect(toEndedSession("c1", ended.id, { endedJson: json })).toBeNull();
  });

  it("ignores a record without text", () => {
    expect(toEndedSession("c1", ended.id, {})).toBeNull();
    expect(toEndedSession("c1", ended.id, { endedJson: { id: "x" } })).toBeNull();
  });
});
