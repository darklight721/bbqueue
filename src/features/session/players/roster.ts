import type { Club, ClubPlayer, SessionPlayer } from "../../../domain/types.ts";
import { namesEqual } from "../../../domain/validation.ts";

/** A Club player who can still join the Session from the Add players sheet. */
export interface RosterChoice {
  player: ClubPlayer;
  /** Was in the Session and was Removed (or left): joining brings back their Session player. */
  leftEarlier: boolean;
  /** Another Session player (a Guest) already has this name, so they can't join. */
  nameTaken: boolean;
}

/** The Club's players with no active Session player, by name. */
export function rosterChoices(club: Club, players: readonly SessionPlayer[]): RosterChoice[] {
  const active = players.filter((player) => !player.removed);
  const removed = players.filter((player) => player.removed);
  return club.players
    .filter((player) => !active.some((joined) => joined.clubPlayerId === player.id))
    .map((player) => ({
      player,
      // Same match as the engine: the Club player link, or else the name.
      leftEarlier: removed.some(
        (left) => left.clubPlayerId === player.id || namesEqual(left.name, player.name),
      ),
      nameTaken: active.some((joined) => namesEqual(joined.name, player.name)),
    }))
    .sort((a, b) => a.player.name.localeCompare(b.player.name, undefined, { sensitivity: "base" }));
}

/** "Ana is in Riverside. Pick them above.", for a Guest named like a Club player who can join. */
export function rosterNameMessage(
  name: string,
  club: Club | null,
  choices: readonly RosterChoice[],
): string | null {
  if (!club) return null;
  const match = choices.find((choice) => namesEqual(choice.player.name, name));
  return match ? `${match.player.name} is in ${club.name}. Pick them above.` : null;
}

/** "Add players", "Add 1 player", "Add 3 players". */
export function addPlayersLabel(count: number): string {
  if (count === 0) return "Add players";
  return `Add ${count} ${count === 1 ? "player" : "players"}`;
}

/** "Fay", "Fay and Ben", "Fay, Ben and Cat". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
