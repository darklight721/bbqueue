import { accountIdsEqual } from "../accountId.ts";
import type { Session, SessionRequest } from "../types.ts";
import type { EngineContext } from "./context.ts";
import { removePlayer, setSittingOut } from "./operations.ts";

export type SkipReason =
  /** The request was made in another Session. */
  | "other-session"
  | "player-not-found"
  /** The Session player isn't the requester's (not linked to their Account at Start). */
  | "not-your-player"
  | "already-left"
  | "already-sitting-out"
  | "not-sitting-out";

export type RequestOutcome =
  | { requestId: string; outcome: "applied" }
  | { requestId: string; outcome: "skipped"; reason: SkipReason }
  /** Can't be applied yet, but may be later: leaving while the player is in a Match. */
  | { requestId: string; outcome: "deferred"; reason: "in-active-match" };

/**
 * The host applies Players' requests in the order they were made (`createdAt`, then the order
 * given), each through the existing engine operations (ADR-0007). A request is skipped when it no
 * longer makes sense: another Session, a Session player that isn't the requester's (checked against
 * the Account copied onto the Session player at Start, which the Security Rules can't see), already
 * Sitting out, already left. Leaving while in a Match is deferred (the host tries again after the
 * Match, since the player can't leave mid-match), and it keeps its place in the order.
 *
 * Returns the new Session and one outcome per request, in the order they were applied.
 */
export function applyRequests(
  session: Session,
  requests: readonly SessionRequest[],
  ctx: EngineContext,
): { session: Session; outcomes: RequestOutcome[] } {
  const ordered = requests
    .map((request, index) => ({ request, index }))
    .sort((a, b) => a.request.createdAt - b.request.createdAt || a.index - b.index)
    .map(({ request }) => request);

  let current = session;
  const outcomes: RequestOutcome[] = [];
  for (const request of ordered) {
    const result = applyOne(current, request, ctx);
    if (result.outcome.outcome === "applied") current = result.session;
    outcomes.push(result.outcome);
  }
  return { session: current, outcomes };
}

function applyOne(
  session: Session,
  request: SessionRequest,
  ctx: EngineContext,
): { session: Session; outcome: RequestOutcome } {
  const skip = (reason: SkipReason): { session: Session; outcome: RequestOutcome } => ({
    session,
    outcome: { requestId: request.id, outcome: "skipped", reason },
  });
  const applied = (next: Session): { session: Session; outcome: RequestOutcome } => ({
    session: next,
    outcome: { requestId: request.id, outcome: "applied" },
  });

  if (request.sessionId !== session.id) return skip("other-session");
  const player = session.players.find((candidate) => candidate.id === request.sessionPlayerId);
  if (!player) return skip("player-not-found");
  if (!player.accountId || !accountIdsEqual(player.accountId, request.accountId)) {
    return skip("not-your-player");
  }
  if (player.removed) return skip("already-left");

  switch (request.kind) {
    case "sit-out": {
      if (player.sittingOut) return skip("already-sitting-out");
      const result = setSittingOut(session, player.id, true, ctx);
      return result.ok ? applied(result.session) : skip("player-not-found");
    }
    case "back-in": {
      if (!player.sittingOut) return skip("not-sitting-out");
      const result = setSittingOut(session, player.id, false, ctx);
      return result.ok ? applied(result.session) : skip("player-not-found");
    }
    case "leave": {
      const result = removePlayer(session, player.id, ctx);
      if (result.ok) return applied(result.session);
      if (result.reason === "player-in-active-match") {
        return {
          session,
          outcome: { requestId: request.id, outcome: "deferred", reason: "in-active-match" },
        };
      }
      return skip("player-not-found");
    }
  }
}
