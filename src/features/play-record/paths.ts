/** The signed-in Account's own Stats (Account view). */
export const ACCOUNT_STATS_PATH = "/account/stats";

/** `/clubs/<clubId>/players/<clubPlayerId>/stats`: one Club player's Stats (Club view). */
export function clubStatsPath(clubId: string, clubPlayerId: string): string {
  return `/clubs/${encodeURIComponent(clubId)}/players/${encodeURIComponent(clubPlayerId)}/stats`;
}

/**
 * URL query param on a Club view: opened from the Club page's roster, so Back returns to the Club
 * page. Kept here, not with the other Stats origins, because Session origins need it too.
 */
export const FROM_CLUB_PAGE_PARAM = "clubPage";

/** A Club view opened from the Club page's roster. */
export function clubStatsFromClubPagePath(clubId: string, clubPlayerId: string): string {
  return `${clubStatsPath(clubId, clubPlayerId)}?${FROM_CLUB_PAGE_PARAM}=1`;
}
