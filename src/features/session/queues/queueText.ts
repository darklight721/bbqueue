import type { MoveCheck, QueueWarning } from "../../../domain/engine/index.ts";
import type { Queue, SessionPlayer } from "../../../domain/types.ts";

type Lookup = ReadonlyMap<string, SessionPlayer>;

const nameOf = (id: string, players: Lookup) => players.get(id)?.name ?? "Unknown";

/** Badge text for a Queue warning, or null for warnings the card shows elsewhere. */
export function warningLabel(warning: QueueWarning, queue: Queue, players: Lookup): string | null {
  switch (warning.kind) {
    case "unbalanced":
      return "Unbalanced";
    case "third-in-a-row":
      return `3rd in a row: ${nameOf(warning.playerId, players)}`;
    case "repeat-partners": {
      const pair = queue.slots[warning.team].filter((id): id is string => id !== null);
      return `Repeat partners: ${pair.map((id) => nameOf(id, players)).join(" & ")}`;
    }
    case "sitting-out":
      return `Sitting out: ${nameOf(warning.playerId, players)}`;
    case "on-court":
      // Covered by the Move to court reason ("Ana is on court 1").
      return null;
  }
}

/** Why a Queue can't move to a Court, in plain words; null when it can. */
export function moveBlockedReason(check: MoveCheck): string | null {
  if (check.ok) return null;
  switch (check.reason) {
    case "court-busy":
      return "Court in use";
    case "queue-incomplete":
      return "Fill all 4 spots";
    case "player-on-court":
      return `${check.playerName} is on court ${check.courtNumber}`;
    case "player-not-found":
      return "A player has left the session";
  }
}
