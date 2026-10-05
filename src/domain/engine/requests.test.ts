import { describe, expect, it } from "vite-plus/test";
import type { Session, SessionRequest } from "../types.ts";
import { createSession, startMatch } from "./operations.ts";
import { applyRequests } from "./requests.ts";
import { makeCtx } from "./test-utils.ts";

const ACCOUNTS: Record<string, string> = { P1: "ana-2222", P2: "ben-3333", P3: "cat-4444" };

/** Six Session players; P1 to P3 are linked to Accounts, the rest are Guests. */
function create(): Session {
  return createSession(
    {
      name: "S",
      clubId: "c1",
      clubName: "Club",
      pointSystem: 21,
      plannedHours: 2,
      courts: 1,
      players: ["P1", "P2", "P3", "P4", "P5", "P6"].map((name) => ({
        name,
        skill: "intermediate" as const,
        ...(ACCOUNTS[name] ? { accountId: ACCOUNTS[name] } : {}),
      })),
    },
    makeCtx(1),
  );
}

const idOf = (session: Session, name: string) =>
  session.players.find((player) => player.name === name)!.id;
const player = (session: Session, name: string) =>
  session.players.find((candidate) => candidate.name === name)!;

let n = 0;
function request(
  session: Session,
  name: string,
  kind: SessionRequest["kind"],
  overrides: Partial<SessionRequest> = {},
): SessionRequest {
  return {
    id: `r${++n}`,
    clubId: "c1",
    sessionId: session.id,
    sessionPlayerId: idOf(session, name),
    accountId: ACCOUNTS[name] ?? "nobody-0000",
    kind,
    status: "pending",
    createdAt: 1000 + n,
    ...overrides,
  };
}

const ctx = () => makeCtx(2);

describe("applyRequests", () => {
  it("applies Sitting out and Back in for the requester's own Session player", () => {
    const s = create();

    const out = applyRequests(s, [request(s, "P1", "sit-out")], ctx());
    expect(player(out.session, "P1").sittingOut).toBe(true);
    expect(out.outcomes.map((o) => o.outcome)).toEqual(["applied"]);

    const back = applyRequests(out.session, [request(out.session, "P1", "back-in")], ctx());
    expect(player(back.session, "P1").sittingOut).toBe(false);
  });

  it("stops Lineups from picking a player who sits out", () => {
    const s = create();
    const { session } = applyRequests(s, [request(s, "P1", "sit-out")], ctx());
    const lineup = session.courts[0]!.lineup!;
    expect(lineup.teams.flat()).not.toContain(idOf(session, "P1"));
  });

  it("leaving removes the player, keeping their history", () => {
    const s = create();
    const { session, outcomes } = applyRequests(s, [request(s, "P2", "leave")], ctx());
    expect(player(session, "P2").removed).toBe(true);
    expect(outcomes[0]).toMatchObject({ outcome: "applied" });
  });

  it("applies requests in the order they were made, whatever order they arrive in", () => {
    const s = create();
    const later = request(s, "P1", "back-in", { createdAt: 5000 });
    const earlier = request(s, "P1", "sit-out", { createdAt: 4000 });

    const { session, outcomes } = applyRequests(s, [later, earlier], ctx());

    expect(outcomes.map((o) => [o.requestId, o.outcome])).toEqual([
      [earlier.id, "applied"],
      [later.id, "applied"],
    ]);
    expect(player(session, "P1").sittingOut).toBe(false);
  });

  it("keeps the given order for requests made at the same time", () => {
    const s = create();
    const a = request(s, "P1", "sit-out", { createdAt: 4000 });
    const b = request(s, "P1", "back-in", { createdAt: 4000 });
    expect(applyRequests(s, [a, b], ctx()).outcomes.map((o) => o.requestId)).toEqual([a.id, b.id]);
  });

  it("skips what no longer makes sense", () => {
    const s = create();
    const sitting = applyRequests(s, [request(s, "P1", "sit-out")], ctx()).session;
    const left = applyRequests(s, [request(s, "P3", "leave")], ctx()).session;
    const both = {
      ...sitting,
      players: sitting.players.map((p) => (p.name === "P3" ? player(left, "P3") : p)),
    };

    const { session, outcomes } = applyRequests(
      both,
      [
        request(both, "P1", "sit-out"), // already sitting out
        request(both, "P2", "back-in"), // isn't sitting out
        request(both, "P3", "sit-out"), // already left
        request(both, "P3", "leave"), // already left
      ],
      ctx(),
    );

    expect(outcomes).toEqual([
      expect.objectContaining({ outcome: "skipped", reason: "already-sitting-out" }),
      expect.objectContaining({ outcome: "skipped", reason: "not-sitting-out" }),
      expect.objectContaining({ outcome: "skipped", reason: "already-left" }),
      expect.objectContaining({ outcome: "skipped", reason: "already-left" }),
    ]);
    expect(session).toBe(both);
  });

  it("skips a request for somebody else's Session player, a Guest, or a player that isn't there", () => {
    const s = create();

    const { session, outcomes } = applyRequests(
      s,
      [
        request(s, "P1", "sit-out", { accountId: "ben-3333" }), // Ben asking for Ana's player
        request(s, "P4", "sit-out"), // a Guest has no Account
        request(s, "P1", "sit-out", { sessionPlayerId: "nope" }),
        request(s, "P1", "sit-out", { accountId: "ANA-2222" }), // same Account, any capitalisation
      ],
      ctx(),
    );

    expect(outcomes.map((o) => (o.outcome === "skipped" ? o.reason : o.outcome))).toEqual([
      "not-your-player",
      "not-your-player",
      "player-not-found",
      "applied",
    ]);
    expect(player(session, "P4").sittingOut).toBe(false);
  });

  it("skips a request made in another Session", () => {
    const s = create();
    const { outcomes } = applyRequests(
      s,
      [request(s, "P1", "sit-out", { sessionId: "old" })],
      ctx(),
    );
    expect(outcomes[0]).toMatchObject({ outcome: "skipped", reason: "other-session" });
  });

  it("defers leaving while the player is in a Match, and later requests still apply", () => {
    const s = create();
    const started = startMatch(s, s.courts[0]!.id, makeCtx(3));
    if (!started.ok) throw new Error(started.reason);
    const playing = started.session;
    const inMatch = playing.matches[0]!.teams.flat();
    const who = ["P1", "P2", "P3"].find((name) => inMatch.includes(idOf(playing, name)))!;
    const other = ["P1", "P2", "P3"].find((name) => name !== who)!;

    const { session, outcomes } = applyRequests(
      playing,
      [request(playing, who, "leave"), request(playing, other, "sit-out")],
      ctx(),
    );

    expect(outcomes[0]).toMatchObject({ outcome: "deferred", reason: "in-active-match" });
    expect(outcomes[1]).toMatchObject({ outcome: "applied" });
    expect(player(session, who).removed).toBe(false);
  });

  it("lets a player sit out while in a Match: it takes effect after it", () => {
    const s = create();
    const started = startMatch(s, s.courts[0]!.id, makeCtx(3));
    if (!started.ok) throw new Error(started.reason);
    const playing = started.session;
    const who = ["P1", "P2", "P3"].find((name) =>
      playing.matches[0]!.teams.flat().includes(idOf(playing, name)),
    );
    if (!who) return;

    const { session, outcomes } = applyRequests(playing, [request(playing, who, "sit-out")], ctx());

    expect(outcomes[0]).toMatchObject({ outcome: "applied" });
    expect(player(session, who).sittingOut).toBe(true);
  });

  it("doesn't change the Session it was given", () => {
    const s = create();
    const before = JSON.stringify(s);
    applyRequests(s, [request(s, "P1", "sit-out"), request(s, "P2", "leave")], ctx());
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe("applyRequests remembers which requests it applied", () => {
  it("records the id of every applied request in the Session, in order, and nothing for skipped ones", () => {
    const s = create();
    const out = request(s, "P1", "sit-out");
    const other = request(s, "P2", "sit-out", { accountId: "nobody-0000" });
    const back = request(s, "P1", "back-in");

    const result = applyRequests(s, [out, other, back], ctx());

    expect(result.session.appliedRequestIds).toEqual([out.id, back.id]);
  });

  it("doesn't change the original Session", () => {
    const s = create();
    applyRequests(s, [request(s, "P1", "sit-out")], ctx());
    expect(s.appliedRequestIds).toBeUndefined();
  });

  it("doesn't apply a request twice: one whose id is in the Session is reported applied and changes nothing", () => {
    const s = create();
    const out = request(s, "P1", "sit-out");
    const once = applyRequests(s, [out], ctx()).session;

    const again = applyRequests(once, [out], ctx());

    expect(again.session).toBe(once);
    expect(again.outcomes).toEqual([{ requestId: out.id, outcome: "applied" }]);
  });

  it("is not tripped up by a request that would now be skipped: it was applied, not skipped", () => {
    // P1 is already sitting out because of this very request: applying it again would say
    // "already-sitting-out" (a false skip after a reload).
    const s = create();
    const out = request(s, "P1", "sit-out");
    const once = applyRequests(s, [out], ctx()).session;
    expect(player(once, "P1").sittingOut).toBe(true);

    const outcome = applyRequests(once, [out], ctx()).outcomes[0];

    expect(outcome?.outcome).toBe("applied");
  });

  it("remembers at most the newest 200", () => {
    let s = create();
    const ids: string[] = [];
    for (let i = 0; i < 120; i++) {
      for (const kind of ["sit-out", "back-in"] as const) {
        const r = request(s, "P1", kind);
        ids.push(r.id);
        s = applyRequests(s, [r], ctx()).session;
      }
    }
    expect(s.appliedRequestIds).toHaveLength(200);
    expect(s.appliedRequestIds).toEqual(ids.slice(-200));
  });
});
