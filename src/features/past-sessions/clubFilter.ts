import { displayClubName } from "../../domain/clubName.ts";
import type { Club, EndedSession } from "../../domain/types.ts";
import { NO_CLUB } from "../new-session/newSession.ts";

/** Select value (and absent URL param) for "All clubs". */
export const ALL_CLUBS = "";
/** Filter value for Ended sessions that had no Club. */
export const NO_CLUB_FILTER = NO_CLUB;
/** URL query param holding the filter on `/sessions`. */
export const CLUB_PARAM = "club";

export interface ClubFilterOption {
  /** `ALL_CLUBS`, a Club id, or `NO_CLUB_FILTER`. */
  value: string;
  label: string;
}

/** The filter needs at least this many real choices (besides "All clubs") to be worth showing. */
export const MIN_FILTER_CHOICES = 2;

/**
 * Filter options built from the kept Ended sessions: "All clubs", one per Club with sessions
 * (A–Z; deleted Clubs are labelled "<saved name> (deleted)", and left out when no name was
 * saved), then "No club" when some session had none.
 */
export function buildClubFilterOptions(
  sessions: readonly EndedSession[],
  clubs: readonly Club[],
): ClubFilterOption[] {
  const latestByClub = new Map<string, EndedSession>();
  let hasNoClub = false;
  for (const ended of sessions) {
    if (ended.clubId === null) {
      hasNoClub = true;
      continue;
    }
    const latest = latestByClub.get(ended.clubId);
    if (!latest || ended.endedAt > latest.endedAt) latestByClub.set(ended.clubId, ended);
  }

  const clubOptions: ClubFilterOption[] = [];
  for (const [clubId, latest] of latestByClub) {
    const exists = clubs.some((club) => club.id === clubId);
    const name = displayClubName(clubId, latest.clubName, clubs);
    if (name === null) continue;
    clubOptions.push({ value: clubId, label: exists ? name : `${name} (deleted)` });
  }
  clubOptions.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));

  return [
    { value: ALL_CLUBS, label: "All clubs" },
    ...clubOptions,
    ...(hasNoClub ? [{ value: NO_CLUB_FILTER, label: "No club" }] : []),
  ];
}

/** Whether the filter is worth showing: at least two real choices besides "All clubs". */
export function hasClubFilter(options: readonly ClubFilterOption[]): boolean {
  return options.length - 1 >= MIN_FILTER_CHOICES;
}

/** A raw URL value as a known option's value; anything else (missing, unknown) is All. */
export function parseClubFilter(raw: string | null, options: readonly ClubFilterOption[]): string {
  return raw !== null && raw !== ALL_CLUBS && options.some((option) => option.value === raw)
    ? raw
    : ALL_CLUBS;
}

export function filterByClub(sessions: readonly EndedSession[], filter: string): EndedSession[] {
  if (filter === ALL_CLUBS) return [...sessions];
  if (filter === NO_CLUB_FILTER) return sessions.filter((ended) => ended.clubId === null);
  return sessions.filter((ended) => ended.clubId === filter);
}

/** `/sessions` with the filter in the URL (nothing for All). */
export function pastSessionsPath(filter: string): string {
  return filter === ALL_CLUBS
    ? "/sessions"
    : `/sessions?${CLUB_PARAM}=${encodeURIComponent(filter)}`;
}
