import { loadSort, saveSort } from "../../../storage/sortPreference.ts";
import type { PlayerSort } from "./playerStatus.ts";

/** Device-wide UI preference; not part of any Session. */
const KEY = "bq:v1:players-sort";
const VALUES: readonly PlayerSort[] = ["name", "plays", "status"];

/** The last chosen Players sort, or "name" when nothing (valid) is saved. */
export function loadPlayerSort(): PlayerSort {
  return loadSort(KEY, VALUES, "name");
}

export function savePlayerSort(sort: PlayerSort): void {
  saveSort(KEY, sort);
}
