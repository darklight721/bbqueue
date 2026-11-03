import type { SortOption } from "../../components/SortControl.tsx";
import type { ClubPlayer } from "../../domain/types.ts";
import { loadSort, saveSort } from "../../storage/sortPreference.ts";

export type RosterSort = "name" | "last-played";

export const ROSTER_SORTS: readonly SortOption<RosterSort>[] = [
  { value: "name", label: "Name" },
  { value: "last-played", label: "Last played" },
];

/** Device-wide, for every Club; not the Session page's Players sort (the options differ). */
const KEY = "bq:v1:roster-sort";

/** The last chosen roster sort, or "name" when nothing (valid) is saved. */
export function loadRosterSort(): RosterSort {
  return loadSort(
    KEY,
    ROSTER_SORTS.map((option) => option.value),
    "name",
  );
}

export function saveRosterSort(sort: RosterSort): void {
  saveSort(KEY, sort);
}

function byName(a: ClubPlayer, b: ClubPlayer): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

/**
 * Orders the roster.
 * - name: A→Z.
 * - last-played: most recent Last played first, then name; Club players who never played last, by name.
 */
export function sortRoster(
  players: readonly ClubPlayer[],
  lastPlayed: ReadonlyMap<string, number>,
  sort: RosterSort,
): ClubPlayer[] {
  const list = [...players];
  if (sort === "last-played") {
    const at = (player: ClubPlayer) => lastPlayed.get(player.id) ?? -Infinity;
    return list.sort((a, b) => (at(a) === at(b) ? byName(a, b) : at(b) - at(a)));
  }
  return list.sort(byName);
}
