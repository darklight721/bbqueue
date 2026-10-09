import type { Club, EndedSession } from "../../domain/types.ts";
import { buildClubFilterOptions } from "../past-sessions/clubFilter.ts";
import {
  detailsPath,
  originParams,
  parseOrigin,
  validateOrigin,
  type SessionOrigin,
} from "../past-sessions/sessionOrigin.ts";
import { clubStatsPath } from "./paths.ts";

/** URL query param on a Club view: opened from this Ended session's Standings. */
export const FROM_SESSION_PARAM = "session";

/**
 * A Club view opened from an Ended session's Standings. The session's own origin rides along, so
 * Back from the Stats returns to that session, and Back from there to the list it came from.
 */
export function clubStatsFromSessionPath(
  clubId: string,
  clubPlayerId: string,
  sessionId: string,
  origin: SessionOrigin,
): string {
  const params = new URLSearchParams({ [FROM_SESSION_PARAM]: sessionId });
  for (const [key, value] of originParams(origin)) params.set(key, value);
  return `${clubStatsPath(clubId, clubPlayerId)}?${params.toString()}`;
}

/**
 * Back from a Club view: the Ended session it was opened from (while it's still kept), else the
 * Club's Past sessions (a reload or a deep link).
 */
export function clubStatsBackPath(
  search: string,
  clubId: string,
  sessions: readonly EndedSession[],
  clubs: readonly Club[],
): string {
  const sessionId = new URLSearchParams(search).get(FROM_SESSION_PARAM);
  if (sessionId && sessions.some((ended) => ended.id === sessionId)) {
    const origin = validateOrigin(
      parseOrigin(search),
      buildClubFilterOptions(sessions, clubs),
      clubs,
    );
    return detailsPath(sessionId, origin);
  }
  return `/clubs/${encodeURIComponent(clubId)}/sessions`;
}
