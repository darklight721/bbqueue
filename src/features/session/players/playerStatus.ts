import type { PlayerStats } from "../../../domain/engine/index.ts";
import type { SessionPlayer } from "../../../domain/types.ts";

export type StatusTone = "on-court" | "in-lineup" | "sitting-out" | "free";

export interface PlayerStatusView {
  label: string;
  tone: StatusTone;
  /** Extra line for "sit out after this match". */
  note: string | null;
}

/** "On court 1", "In lineup · court 2", "Sitting out", "Free". */
export function playerStatus(
  player: SessionPlayer,
  stats: PlayerStats | undefined,
): PlayerStatusView {
  const court = stats?.courtNumber ?? null;
  switch (stats?.status) {
    case "on-court":
      return {
        label: court === null ? "On court" : `On court ${court}`,
        tone: "on-court",
        note: player.sittingOut ? "Sitting out after this match" : null,
      };
    case "in-lineup":
      return {
        label: court === null ? "In lineup" : `In lineup · court ${court}`,
        tone: "in-lineup",
        note: null,
      };
    case "sitting-out":
      return { label: "Sitting out", tone: "sitting-out", note: null };
    default:
      return { label: "Free", tone: "free", note: null };
  }
}

/** Non-removed players, alphabetical (case- and accent-insensitive). */
export function activePlayersByName(players: readonly SessionPlayer[]): SessionPlayer[] {
  return players
    .filter((player) => !player.removed)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/** "12 players · 2 sitting out" (the second part only when someone is sitting out). */
export function playersSummary(players: readonly SessionPlayer[]): string {
  const count = players.length;
  const sitting = players.filter((player) => player.sittingOut).length;
  const base = `${count} ${count === 1 ? "player" : "players"}`;
  return sitting > 0 ? `${base} · ${sitting} sitting out` : base;
}
