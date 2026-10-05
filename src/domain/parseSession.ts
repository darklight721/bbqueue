import { MAX_APPLIED_REQUEST_IDS } from "./engine/requests.ts";
import {
  SKILL_LEVELS,
  type Court,
  type EndedSession,
  type EndedSessionMatch,
  type EndedSessionPlayer,
  type Match,
  type PointSystem,
  type Queue,
  type QueueSlot,
  type Session,
  type SessionPlayer,
  type SkillLevel,
  type Team,
} from "./types.ts";
import { MAX_NAME_LENGTH } from "./validation.ts";

/**
 * Guards for Session data that comes from outside the app: another device's upload (Firestore),
 * or what is in `localStorage`. Both can hold anything (a hostile host, an old version, a half
 * written save), and a Session that isn't shaped right would crash the screens or the engine on
 * every launch. These check every element's type, cut names to their limits, cap how long the
 * lists may be, and copy only the known fields. They return null for data that can't be used,
 * and never throw.
 */

/** The longest Session name kept (the app doesn't limit it, so this is generous). */
export const MAX_SESSION_NAME_LENGTH = 100;
const MAX_ID_LENGTH = 100;
const MAX_PLAYERS = 300;
const MAX_COURTS = 30;
const MAX_QUEUES = 100;
const MAX_MATCHES = 2_000;

type Rec = Record<string, unknown>;

const isRec = (value: unknown): value is Rec =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNum = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isId = (value: unknown): value is string =>
  typeof value === "string" && value.length <= MAX_ID_LENGTH;

const isSkill = (value: unknown): value is SkillLevel =>
  (SKILL_LEVELS as readonly unknown[]).includes(value);

const isPointSystem = (value: unknown): value is PointSystem => value === 21 || value === 31;

/** A string cut to `max` characters, or null when it isn't a string. */
function text(value: unknown, max: number): string | null {
  return typeof value === "string" ? value.slice(0, max) : null;
}

/** Every element parsed, or null when it isn't a list, is too long or has a bad element. */
function list<T>(value: unknown, max: number, parse: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(value) || value.length > max) return null;
  const items: T[] = [];
  for (const item of value) {
    const parsed = parse(item);
    if (parsed === null) return null;
    items.push(parsed);
  }
  return items;
}

function team(value: unknown): Team | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [a, b] = value as unknown[];
  return isId(a) && isId(b) ? [a, b] : null;
}

function teams(value: unknown): [Team, Team] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const first = team(value[0]);
  const second = team(value[1]);
  return first && second ? [first, second] : null;
}

/** `null` is a valid score (no Score); `undefined` too, for the same reason; a bad one is `false`. */
function score(value: unknown): [number, number] | null | false {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value) || value.length !== 2) return false;
  const [a, b] = value as unknown[];
  return isNum(a) && isNum(b) ? [a, b] : false;
}

function sessionPlayer(value: unknown): SessionPlayer | null {
  if (!isRec(value)) return null;
  const name = text(value.name, MAX_NAME_LENGTH);
  if (
    !isId(value.id) ||
    name === null ||
    !isSkill(value.skill) ||
    !isNum(value.joinedAt) ||
    (value.accountId !== undefined && !isId(value.accountId)) ||
    (value.clubPlayerId !== undefined && value.clubPlayerId !== null && !isId(value.clubPlayerId))
  ) {
    return null;
  }
  const player: SessionPlayer = {
    id: value.id,
    name,
    skill: value.skill,
    clubPlayerId: (value.clubPlayerId as string | null | undefined) ?? null,
    sittingOut: value.sittingOut === true,
    removed: value.removed === true,
    joinedAt: value.joinedAt,
  };
  if (typeof value.accountId === "string") player.accountId = value.accountId;
  return player;
}

function slot(value: unknown): QueueSlot | undefined {
  if (value === null) return null;
  return isId(value) ? value : undefined;
}

function queue(value: unknown): Queue | null {
  if (!isRec(value) || !isId(value.id) || !Array.isArray(value.slots) || value.slots.length !== 2) {
    return null;
  }
  const rows: QueueSlot[][] = [];
  for (const row of value.slots as unknown[]) {
    if (!Array.isArray(row) || row.length !== 2) return null;
    const a = slot(row[0]);
    const b = slot(row[1]);
    if (a === undefined || b === undefined) return null;
    rows.push([a, b]);
  }
  return { id: value.id, slots: rows as Queue["slots"] };
}

function court(value: unknown): Court | null {
  if (!isRec(value) || !isId(value.id) || !isNum(value.number)) return null;
  const { lineup, activeMatchId } = value;
  if (activeMatchId !== null && activeMatchId !== undefined && !isId(activeMatchId)) return null;
  let parsedLineup: Court["lineup"] = null;
  if (lineup !== null && lineup !== undefined) {
    if (!isRec(lineup)) return null;
    const lineupTeams = teams(lineup.teams);
    if (!lineupTeams) return null;
    parsedLineup = { teams: lineupTeams };
  }
  return {
    id: value.id,
    number: value.number,
    lineup: parsedLineup,
    activeMatchId: (activeMatchId as string | null | undefined) ?? null,
  };
}

function match(pointSystem: PointSystem): (value: unknown) => Match | null {
  return (value) => {
    if (!isRec(value) || !isId(value.id)) return null;
    const matchTeams = teams(value.teams);
    const matchScore = score(value.score);
    const free = list(value.freeAtStart ?? [], MAX_PLAYERS, (id) => (isId(id) ? id : null));
    if (
      !matchTeams ||
      matchScore === false ||
      !free ||
      !isNum(value.courtNumber) ||
      !isNum(value.startedAt) ||
      (value.number !== null && value.number !== undefined && !isNum(value.number)) ||
      (value.endedAt !== null && value.endedAt !== undefined && !isNum(value.endedAt)) ||
      (value.status !== "active" && value.status !== "ended")
    ) {
      return null;
    }
    return {
      id: value.id,
      number: (value.number as number | null | undefined) ?? null,
      courtNumber: value.courtNumber,
      teams: matchTeams,
      freeAtStart: free,
      startedAt: value.startedAt,
      // Older saves have no Target: the Match was played to the Session's Point system.
      target: isPointSystem(value.target) ? value.target : pointSystem,
      endedAt: (value.endedAt as number | null | undefined) ?? null,
      score: matchScore,
      status: value.status,
    };
  };
}

function streakResets(value: unknown): Record<string, number> | null {
  if (value === undefined) return {};
  if (!isRec(value)) return null;
  const keys = Object.keys(value);
  if (keys.length > MAX_PLAYERS) return null;
  const resets: Record<string, number> = {};
  for (const key of keys) {
    const at = value[key];
    if (!isNum(at) || key.length > MAX_ID_LENGTH) return null;
    if (key !== "__proto__") resets[key] = at;
  }
  return resets;
}

/** A Session as it is saved or uploaded, or null when it can't be used. */
export function parseSession(value: unknown): Session | null {
  if (!isRec(value)) return null;
  const name = text(value.name, MAX_SESSION_NAME_LENGTH);
  if (
    !isId(value.id) ||
    name === null ||
    !isPointSystem(value.pointSystem) ||
    !isNum(value.plannedHours) ||
    !isNum(value.startedAt) ||
    (value.clubId !== null && value.clubId !== undefined && !isId(value.clubId)) ||
    (value.clubName !== null && value.clubName !== undefined && typeof value.clubName !== "string")
  ) {
    return null;
  }
  const players = list(value.players, MAX_PLAYERS, sessionPlayer);
  const courts = list(value.courts, MAX_COURTS, court);
  const matches = list(value.matches, MAX_MATCHES, match(value.pointSystem));
  const queues = list(value.queues, MAX_QUEUES, queue);
  const resets = streakResets(value.streakResetAt);
  const applied =
    value.appliedRequestIds === undefined
      ? undefined
      : list(value.appliedRequestIds, MAX_APPLIED_REQUEST_IDS, (id) => (isId(id) ? id : null));
  if (!players || !courts || !matches || !queues || !resets || applied === null) return null;
  return {
    id: value.id,
    name,
    clubId: (value.clubId as string | null | undefined) ?? null,
    clubName:
      typeof value.clubName === "string" ? value.clubName.slice(0, MAX_SESSION_NAME_LENGTH) : null,
    pointSystem: value.pointSystem,
    plannedHours: value.plannedHours,
    startedAt: value.startedAt,
    players,
    courts,
    matches,
    queues,
    streakResetAt: resets,
    ...(applied ? { appliedRequestIds: applied } : {}),
  };
}

function endedPlayer(value: unknown): EndedSessionPlayer | null {
  if (!isRec(value)) return null;
  const name = text(value.name, MAX_NAME_LENGTH);
  if (!isId(value.id) || name === null || !isSkill(value.skill)) return null;
  return { id: value.id, name, skill: value.skill };
}

function endedMatch(pointSystem: PointSystem): (value: unknown) => EndedSessionMatch | null {
  return (value) => {
    if (!isRec(value)) return null;
    const matchTeams = teams(value.teams);
    const matchScore = score(value.score);
    if (
      !matchTeams ||
      matchScore === false ||
      !isNum(value.number) ||
      !isNum(value.courtNumber) ||
      !isNum(value.startedAt) ||
      !isNum(value.endedAt)
    ) {
      return null;
    }
    return {
      number: value.number,
      courtNumber: value.courtNumber,
      teams: matchTeams,
      target: isPointSystem(value.target) ? value.target : pointSystem,
      startedAt: value.startedAt,
      endedAt: value.endedAt,
      score: matchScore,
    };
  };
}

/** An Ended session as it is saved or published, or null when it can't be used. */
export function parseEndedSession(value: unknown): EndedSession | null {
  if (!isRec(value)) return null;
  const name = text(value.name, MAX_SESSION_NAME_LENGTH);
  if (
    !isId(value.id) ||
    name === null ||
    !isPointSystem(value.pointSystem) ||
    !isNum(value.startedAt) ||
    !isNum(value.endedAt) ||
    (value.clubId !== null && value.clubId !== undefined && !isId(value.clubId)) ||
    (value.clubName !== null && value.clubName !== undefined && typeof value.clubName !== "string")
  ) {
    return null;
  }
  const players = list(value.players, MAX_PLAYERS, endedPlayer);
  const matches = list(value.matches, MAX_MATCHES, endedMatch(value.pointSystem));
  if (!players || !matches) return null;
  return {
    id: value.id,
    name,
    clubId: (value.clubId as string | null | undefined) ?? null,
    clubName:
      typeof value.clubName === "string" ? value.clubName.slice(0, MAX_SESSION_NAME_LENGTH) : null,
    pointSystem: value.pointSystem,
    startedAt: value.startedAt,
    endedAt: value.endedAt,
    players,
    matches,
  };
}
