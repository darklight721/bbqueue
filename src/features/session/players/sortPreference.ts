import type { PlayerSort } from "./playerStatus.ts";

/** Device-wide UI preference; not part of any Session. */
const KEY = "bq:v1:players-sort";
const VALUES: readonly PlayerSort[] = ["name", "plays", "status"];

/** The last chosen Players sort, or "name" when nothing (valid) is saved. */
export function loadPlayerSort(): PlayerSort {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return "name";
    const value: unknown = JSON.parse(raw);
    return VALUES.includes(value as PlayerSort) ? (value as PlayerSort) : "name";
  } catch {
    return "name";
  }
}

export function savePlayerSort(sort: PlayerSort): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(sort));
  } catch {
    // Storage full or blocked: the choice just won't be remembered.
  }
}
