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
  return players.filter((player) => !player.removed).sort(byName);
}

export type PlayerSort = "name" | "plays" | "status";

export const PLAYER_SORTS: readonly { value: PlayerSort; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "plays", label: "Plays" },
  { value: "status", label: "Status" },
];

function byName(a: SessionPlayer, b: SessionPlayer): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

const STATUS_ORDER: Record<string, number> = {
  "on-court": 0,
  "in-lineup": 1,
  free: 2,
  "sitting-out": 3,
};

/**
 * Orders players for the list.
 * - name: A→Z.
 * - plays: fewest Ended matches first, then name.
 * - status: On court → In lineup (each by court number) → Free → Sitting out, then name.
 */
export function sortPlayers(
  players: readonly SessionPlayer[],
  stats: ReadonlyMap<string, PlayerStats>,
  sort: PlayerSort,
): SessionPlayer[] {
  const list = [...players];
  if (sort === "plays") {
    const played = (player: SessionPlayer) => stats.get(player.id)?.matchesPlayed ?? 0;
    return list.sort((a, b) => played(a) - played(b) || byName(a, b));
  }
  if (sort === "status") {
    const rank = (player: SessionPlayer) =>
      STATUS_ORDER[stats.get(player.id)?.status ?? "free"] ?? 2;
    const court = (player: SessionPlayer) => stats.get(player.id)?.courtNumber ?? 0;
    return list.sort((a, b) => rank(a) - rank(b) || court(a) - court(b) || byName(a, b));
  }
  return list.sort(byName);
}

/** "12 players · 2 sitting out" (the second part only when someone is sitting out). */
export function playersSummary(players: readonly SessionPlayer[]): string {
  const count = players.length;
  const sitting = players.filter((player) => player.sittingOut).length;
  const base = `${count} ${count === 1 ? "player" : "players"}`;
  return sitting > 0 ? `${base} · ${sitting} sitting out` : base;
}
