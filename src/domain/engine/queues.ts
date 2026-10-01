import type { Court, Queue, Session } from "../types.ts";
import { makeId, type EngineContext } from "./context.ts";
import { balanceOf, makeEnv, type Split } from "./select.ts";
import { buildHistory, matchPlayerIds } from "./stats.ts";

export type QueueSlotRef = { team: 0 | 1; slot: 0 | 1 };

export function queuePlayerIds(queue: Queue): string[] {
  return queue.slots.flat().filter((id): id is string => id !== null);
}

/** The Queue's two Teams, or null while it has empty slots. */
export function queueTeams(queue: Queue): Split | null {
  const [[a, b], [c, d]] = queue.slots;
  if (a === null || b === null || c === null || d === null) return null;
  return [
    [a, b],
    [c, d],
  ];
}

export function addQueue(session: Session, ctx: EngineContext): Session {
  const queue: Queue = {
    id: makeId(ctx),
    slots: [
      [null, null],
      [null, null],
    ],
  };
  return { ...session, queues: [...session.queues, queue] };
}

export type RemoveQueueResult =
  | { ok: true; session: Session }
  | { ok: false; reason: "queue-not-found" };

export function removeQueue(session: Session, queueId: string): RemoveQueueResult {
  if (!session.queues.some((queue) => queue.id === queueId)) {
    return { ok: false, reason: "queue-not-found" };
  }
  return {
    ok: true,
    session: { ...session, queues: session.queues.filter((q) => q.id !== queueId) },
  };
}

export type SetQueueSlotResult =
  | { ok: true; session: Session }
  | { ok: false; reason: "queue-not-found" | "player-not-found" | "duplicate-in-queue" };

/** Set (or clear with null) one slot of a Queue. A player may appear once per Queue. */
export function setQueueSlot(
  session: Session,
  queueId: string,
  team: 0 | 1,
  slot: 0 | 1,
  playerId: string | null,
): SetQueueSlotResult {
  const queue = session.queues.find((candidate) => candidate.id === queueId);
  if (!queue) return { ok: false, reason: "queue-not-found" };
  if (playerId !== null) {
    if (!session.players.some((player) => player.id === playerId && !player.removed)) {
      return { ok: false, reason: "player-not-found" };
    }
    const elsewhere = queue.slots.flatMap((pair, t) =>
      pair.map((id, s) => (t === team && s === slot ? null : id)),
    );
    if (elsewhere.includes(playerId)) return { ok: false, reason: "duplicate-in-queue" };
  }
  const slots = queue.slots.map((pair, t) =>
    pair.map((id, s) => (t === team && s === slot ? playerId : id)),
  ) as Queue["slots"];
  return {
    ok: true,
    session: {
      ...session,
      queues: session.queues.map((candidate) =>
        candidate.id === queueId ? { ...candidate, slots } : candidate,
      ),
    },
  };
}

/** Remove a player from every Queue slot they occupy. */
export function clearPlayerFromQueues(session: Session, playerId: string): Session {
  return {
    ...session,
    queues: session.queues.map((queue) => ({
      ...queue,
      slots: queue.slots.map((pair) =>
        pair.map((id) => (id === playerId ? null : id)),
      ) as Queue["slots"],
    })),
  };
}

export type MoveCheck =
  | { ok: true }
  | { ok: false; reason: "court-busy" | "queue-incomplete" }
  | {
      ok: false;
      reason: "player-on-court";
      playerId: string;
      playerName: string;
      courtNumber: number;
    };

/** Whether a Queue can be moved onto a Court right now, and why not. */
export function canMoveQueue(session: Session, queue: Queue, court: Court): MoveCheck {
  if (court.activeMatchId !== null) return { ok: false, reason: "court-busy" };
  if (queueTeams(queue) === null) return { ok: false, reason: "queue-incomplete" };
  for (const match of session.matches) {
    if (match.status !== "active") continue;
    const onCourt = queuePlayerIds(queue).find((id) => matchPlayerIds(match).includes(id));
    if (onCourt === undefined) continue;
    const player = session.players.find((candidate) => candidate.id === onCourt);
    return {
      ok: false,
      reason: "player-on-court",
      playerId: onCourt,
      playerName: player?.name ?? "",
      courtNumber: match.courtNumber,
    };
  }
  return { ok: true };
}

export type QueueWarning =
  | { kind: "unbalanced" }
  | { kind: "third-in-a-row"; playerId: string }
  | { kind: "repeat-partners"; team: 0 | 1 }
  | { kind: "sitting-out"; playerId: string }
  | { kind: "on-court"; playerId: string; courtNumber: number };

/** Non-blocking (except on-court) hints about a Queue. */
export function queueWarnings(session: Session, queue: Queue, now: number): QueueWarning[] {
  const warnings: QueueWarning[] = [];
  const teams = queueTeams(queue);
  const env = makeEnv(session, { now, rng: () => 0 });
  if (teams && balanceOf(env, teams) > 1) warnings.push({ kind: "unbalanced" });

  const history = buildHistory(session, now);
  const ids = queuePlayerIds(queue);
  for (const id of ids) {
    if ((history.byPlayer.get(id)?.streak ?? 0) >= 2)
      warnings.push({ kind: "third-in-a-row", playerId: id });
  }
  queue.slots.forEach((pair, team) => {
    const [a, b] = pair;
    if (a !== null && b !== null && history.partnered(a, b) > 0) {
      warnings.push({ kind: "repeat-partners", team: team as 0 | 1 });
    }
  });
  for (const id of ids) {
    if (session.players.find((player) => player.id === id)?.sittingOut) {
      warnings.push({ kind: "sitting-out", playerId: id });
    }
  }
  for (const match of session.matches) {
    if (match.status !== "active") continue;
    for (const id of ids) {
      if (matchPlayerIds(match).includes(id)) {
        warnings.push({ kind: "on-court", playerId: id, courtNumber: match.courtNumber });
      }
    }
  }
  return warnings;
}
