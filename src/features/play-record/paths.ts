/** The signed-in Account's own Stats (Account view). */
export const ACCOUNT_STATS_PATH = "/account/stats";

/** `/clubs/<clubId>/players/<clubPlayerId>/stats`: one Club player's Stats (Club view). */
export function clubStatsPath(clubId: string, clubPlayerId: string): string {
  return `/clubs/${encodeURIComponent(clubId)}/players/${encodeURIComponent(clubPlayerId)}/stats`;
}
