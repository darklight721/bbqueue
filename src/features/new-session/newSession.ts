import type { CreateSessionInput, NewPlayerInput } from "../../domain/engine/index.ts";
import type { Club, ClubPlayer, PointSystem, SkillLevel } from "../../domain/types.ts";
import { namesEqual, normalizeName } from "../../domain/validation.ts";

/** Select value for "No club (guests only)". Club ids are UUIDs, so this can't clash. */
export const NO_CLUB = "none";
/** Select value while nothing is chosen (several Clubs exist). */
export const NO_CHOICE = "";

export const COURTS_MIN = 1;
export const HOURS_MIN = 1;
export const HOURS_MAX = 12;
export const HOURS_STEP = 1;
export const MIN_PLAYERS = 4;

export interface Guest {
  id: string;
  name: string;
  skill: SkillLevel;
  saveToClub: boolean;
}

/** e.g. "Thu, 1 Oct 2026" (format depends on the device locale). */
export function defaultSessionName(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

/** One Club → that Club; none → guests only; several → nothing chosen yet. */
export function initialClubChoice(clubs: readonly Club[]): string {
  if (clubs.length === 0) return NO_CLUB;
  if (clubs.length === 1) return clubs[0]!.id;
  return NO_CHOICE;
}

/** Query param naming the Club New session was opened from (`/sessions/new?club=<id>`). */
export const CLUB_PARAM = "club";

/** Path to New session with `clubId` chosen and locked. */
export function newSessionForClubPath(clubId: string): string {
  return `/sessions/new?${new URLSearchParams({ [CLUB_PARAM]: clubId }).toString()}`;
}

/** The Club id from `?club=`, or null when absent or not one of `clubs`. */
export function sessionClubParam(search: string, clubs: readonly Club[]): string | null {
  const id = new URLSearchParams(search).get(CLUB_PARAM);
  if (id === null) return null;
  return clubs.some((candidate) => candidate.id === id) ? id : null;
}

export function byName<T extends { name: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

/** "No players selected", "1 player selected", "8 players selected". */
export function selectedLabel(count: number): string {
  if (count === 0) return "No players selected";
  return `${count} ${count === 1 ? "player" : "players"} selected`;
}

/** Guests whose name matches a player of the chosen Club (possible after switching Club). */
export function clashingGuestIds(guests: readonly Guest[], club: Club | null): Set<string> {
  const clashes = new Set<string>();
  if (!club) return clashes;
  for (const guest of guests) {
    if (club.players.some((player) => namesEqual(player.name, guest.name))) clashes.add(guest.id);
  }
  return clashes;
}

export interface StartPlan {
  /** Clubs to save (Guests marked "Save to club" added), or null when nothing changes. */
  clubs: Club[] | null;
  input: CreateSessionInput;
}

/** Work out what Start saves: the Club roster update and the Session input. */
export function planStart(args: {
  name: string;
  club: Club | null;
  allClubs: readonly Club[];
  checkedIds: ReadonlySet<string>;
  guests: readonly Guest[];
  courts: number;
  hours: number;
  pointSystem: PointSystem;
  newId: () => string;
}): StartPlan {
  const { club, guests } = args;
  const players: NewPlayerInput[] = [];

  if (club) {
    for (const player of byName(club.players)) {
      if (args.checkedIds.has(player.id)) {
        players.push({
          name: player.name,
          skill: player.skill,
          clubPlayerId: player.id,
          // The Account linked at Start stays with the Session player (ADR-0002).
          ...(player.link ? { accountId: player.link.accountId } : {}),
        });
      }
    }
  }

  const added: ClubPlayer[] = [];
  for (const guest of guests) {
    const name = normalizeName(guest.name);
    let clubPlayerId: string | null = null;
    if (club && guest.saveToClub) {
      const taken = [...club.players, ...added].some((player) => namesEqual(player.name, name));
      if (!taken) {
        const saved: ClubPlayer = { id: args.newId(), name, skill: guest.skill };
        added.push(saved);
        clubPlayerId = saved.id;
      }
    }
    players.push({ name, skill: guest.skill, clubPlayerId });
  }

  const clubs =
    club && added.length > 0
      ? args.allClubs.map((existing) =>
          existing.id === club.id
            ? { ...existing, players: [...existing.players, ...added] }
            : existing,
        )
      : null;

  return {
    clubs,
    input: {
      name: normalizeName(args.name),
      clubId: club?.id ?? null,
      clubName: club?.name ?? null,
      pointSystem: args.pointSystem,
      plannedHours: args.hours,
      courts: args.courts,
      players,
    },
  };
}
