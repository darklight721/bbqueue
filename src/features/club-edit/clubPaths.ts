/** URL query param on the Club page: the Club was just created, so open in Players Edit mode. */
export const JUST_CREATED_PARAM = "new";

/** `/clubs/<clubId>`: the Club page. */
export function clubPath(clubId: string): string {
  return `/clubs/${encodeURIComponent(clubId)}`;
}

/** The Club page of a Club that was just created: Players Edit mode, with an empty row to fill. */
export function newClubPath(clubId: string): string {
  return `${clubPath(clubId)}?${JUST_CREATED_PARAM}=1`;
}
