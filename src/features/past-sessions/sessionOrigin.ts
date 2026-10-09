import type { Club } from "../../domain/types.ts";
import { ACCOUNT_STATS_PATH, clubStatsPath } from "../play-record/paths.ts";
import {
  ALL_CLUBS,
  CLUB_PARAM,
  parseClubFilter,
  pastSessionsPath,
  type ClubFilterOption,
} from "./clubFilter.ts";

/** URL query param on the details page: opened from the club-only list of this Club id. */
export const FROM_CLUB_PARAM = "fromClub";
/** URL query params on the details page: opened from the Stats of this Club player. */
export const STATS_CLUB_PARAM = "statsClub";
export const STATS_PLAYER_PARAM = "statsPlayer";
/** URL query param on the details page: opened from the Account's own Stats. */
export const ACCOUNT_STATS_PARAM = "accountStats";

/** Which list (or Stats page) an Ended session was opened from, kept in the URL so Back can return there. */
export type SessionOrigin =
  | { kind: "all" }
  /** `/sessions?club=<value>` */
  | { kind: "filter"; value: string }
  /** `/clubs/<clubId>/sessions` */
  | { kind: "club"; clubId: string }
  /** `/clubs/<clubId>/players/<clubPlayerId>/stats` */
  | { kind: "playerStats"; clubId: string; clubPlayerId: string }
  /** `/account/stats` */
  | { kind: "accountStats" };

export const ORIGIN_ALL: SessionOrigin = { kind: "all" };

/** Origin for a row of the filtered list (`ALL_CLUBS` = plain list). */
export function filterOrigin(filter: string): SessionOrigin {
  return filter === ALL_CLUBS ? ORIGIN_ALL : { kind: "filter", value: filter };
}

/** Reads the origin from a query string (with or without "?"); unknown shapes are "all". */
export function parseOrigin(search: string): SessionOrigin {
  const params = new URLSearchParams(search);
  const fromClub = params.get(FROM_CLUB_PARAM);
  if (fromClub) return { kind: "club", clubId: fromClub };
  const statsClub = params.get(STATS_CLUB_PARAM);
  const statsPlayer = params.get(STATS_PLAYER_PARAM);
  if (statsClub && statsPlayer) {
    return { kind: "playerStats", clubId: statsClub, clubPlayerId: statsPlayer };
  }
  if (params.get(ACCOUNT_STATS_PARAM) === "1") return { kind: "accountStats" };
  const club = params.get(CLUB_PARAM);
  if (club) return { kind: "filter", value: club };
  return ORIGIN_ALL;
}

/** The origin as query params ("" for all), ready to merge into a details/summary URL. */
export function originParams(origin: SessionOrigin): URLSearchParams {
  const params = new URLSearchParams();
  if (origin.kind === "club") params.set(FROM_CLUB_PARAM, origin.clubId);
  if (origin.kind === "filter") params.set(CLUB_PARAM, origin.value);
  if (origin.kind === "playerStats") {
    params.set(STATS_CLUB_PARAM, origin.clubId);
    params.set(STATS_PLAYER_PARAM, origin.clubPlayerId);
  }
  if (origin.kind === "accountStats") params.set(ACCOUNT_STATS_PARAM, "1");
  return params;
}

function withQuery(path: string, params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

/** `/sessions/<id>` plus the origin. */
export function detailsPath(sessionId: string, origin: SessionOrigin): string {
  return withQuery(`/sessions/${encodeURIComponent(sessionId)}`, originParams(origin));
}

/** `/sessions/<id>/summary?from=details` plus the origin. */
export function summaryPath(sessionId: string, origin: SessionOrigin): string {
  const params = new URLSearchParams({ from: "details" });
  for (const [key, value] of originParams(origin)) params.set(key, value);
  return withQuery(`/sessions/${encodeURIComponent(sessionId)}/summary`, params);
}

/** Where Back from the details goes: only ever one of the known list or Stats paths. */
export function originBackPath(origin: SessionOrigin): string {
  if (origin.kind === "club") return `/clubs/${encodeURIComponent(origin.clubId)}/sessions`;
  if (origin.kind === "playerStats") return clubStatsPath(origin.clubId, origin.clubPlayerId);
  if (origin.kind === "accountStats") return ACCOUNT_STATS_PATH;
  if (origin.kind === "filter") return pastSessionsPath(origin.value);
  return "/sessions";
}

/** Drops an origin that points nowhere (filter value without an option, deleted Club). */
export function validateOrigin(
  origin: SessionOrigin,
  options: readonly ClubFilterOption[],
  clubs: readonly Club[],
): SessionOrigin {
  if (origin.kind === "filter") {
    return parseClubFilter(origin.value, options) === origin.value ? origin : ORIGIN_ALL;
  }
  if (origin.kind === "club") {
    return clubs.some((club) => club.id === origin.clubId) ? origin : ORIGIN_ALL;
  }
  // Stats pages always open (an unknown Club player shows an empty state), so they stay.
  return origin;
}
