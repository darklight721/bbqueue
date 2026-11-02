/** `/clubs/<clubId>`: the Club page. */
export function clubPath(clubId: string): string {
  return `/clubs/${encodeURIComponent(clubId)}`;
}

/** `/clubs/<clubId>/players`: Edit players, the Club's roster as a form. */
export function editPlayersPath(clubId: string): string {
  return `${clubPath(clubId)}/players`;
}

/** URL query param on Edit players: the Club was just created, so start with an empty row. */
export const JUST_CREATED_PARAM = "new";

/** Edit players for a Club that was just created: an empty row to fill, focused. */
export function newClubPlayersPath(clubId: string): string {
  return `${editPlayersPath(clubId)}?${JUST_CREATED_PARAM}=1`;
}

/**
 * History state of Edit players opened on top of its Club page: leaving goes back through history,
 * so the Club page isn't in it twice. Kept by the browser across a reload.
 */
export const OVER_CLUB_PAGE_STATE = { overClubPage: true } as const;

export function isOverClubPage(state: unknown): boolean {
  return typeof state === "object" && state !== null && "overClubPage" in state;
}

/** How Edit players was left: the Club page focuses its Edit, and announces a save. */
export type FromEditPlayers = "saved" | "back";

let fromEditPlayers: { clubId: string; how: FromEditPlayers } | null = null;

/** Edit players is being left for the Club page. */
export function leavingEditPlayers(clubId: string, how: FromEditPlayers) {
  fromEditPlayers = { clubId, how };
}

/** Once, on opening the Club page: was Edit players just left for it? Not after a reload. */
export function takeFromEditPlayers(clubId: string): FromEditPlayers | null {
  const left = fromEditPlayers;
  fromEditPlayers = null;
  return left?.clubId === clubId ? left.how : null;
}
