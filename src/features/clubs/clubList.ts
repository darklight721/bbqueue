import type { Club } from "../../domain/types.ts";

/** "No players", "1 player", "12 players". */
export function playerCountLabel(count: number): string {
  if (count === 0) return "No players";
  return `${count} ${count === 1 ? "player" : "players"}`;
}

/** Alphabetical, ignoring case and accents. */
export function sortClubs(clubs: readonly Club[]): Club[] {
  return [...clubs].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}
