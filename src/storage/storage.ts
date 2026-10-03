import type { Account, Club, EndedSession, Session } from "../domain/types.ts";

const VERSION = 1;
const CLUBS_KEY = "bq:v1:clubs";
const SESSION_KEY = "bq:v1:session";
const ENDED_SESSIONS_KEY = "bq:v1:ended-sessions";
const ACCOUNT_KEY = "bq:v1:account";
const WELCOME_DONE_KEY = "bq:v1:welcome-done";
/** Replaced by Ended sessions (ADR-0005); removed on load and never written again. */
const LEGACY_SUMMARY_KEY = "bq:v1:summary";

/** Ended sessions kept on device; older ones are dropped (ADR-0005). */
export const MAX_ENDED_SESSIONS = 50;

export const STORAGE_KEYS = {
  clubs: CLUBS_KEY,
  session: SESSION_KEY,
  endedSessions: ENDED_SESSIONS_KEY,
  account: ACCOUNT_KEY,
  welcomeDone: WELCOME_DONE_KEY,
};

type Guard<T> = (value: unknown) => value is T;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isClubs: Guard<Club[]> = (value): value is Club[] =>
  Array.isArray(value) &&
  value.every(
    (club) =>
      isRecord(club) &&
      typeof club.id === "string" &&
      typeof club.name === "string" &&
      Array.isArray(club.players),
  );

const isSession: Guard<Session> = (value): value is Session =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.name === "string" &&
  Array.isArray(value.players) &&
  Array.isArray(value.courts) &&
  Array.isArray(value.matches) &&
  Array.isArray(value.queues);

const isAccount: Guard<Account> = (value): value is Account =>
  isRecord(value) && typeof value.accountId === "string" && typeof value.name === "string";

const isTrue: Guard<true> = (value): value is true => value === true;

const isEndedSessions: Guard<EndedSession[]> = (value): value is EndedSession[] =>
  Array.isArray(value) &&
  value.every(
    (ended) =>
      isRecord(ended) &&
      typeof ended.id === "string" &&
      typeof ended.name === "string" &&
      typeof ended.startedAt === "number" &&
      typeof ended.endedAt === "number" &&
      Array.isArray(ended.players) &&
      Array.isArray(ended.matches),
  );

function read<T>(key: string, guard: Guard<T>): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== VERSION) return null;
    return guard(parsed.data) ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Writes `data`; throws when storage refuses (e.g. quota exceeded). */
function writeOrThrow(key: string, data: unknown): void {
  localStorage.setItem(key, JSON.stringify({ version: VERSION, data }));
}

function write(key: string, data: unknown): void {
  try {
    writeOrThrow(key, data);
  } catch (error) {
    console.error(`Failed to save ${key}`, error);
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error(`Failed to clear ${key}`, error);
  }
}

export function loadClubs(): Club[] {
  return read(CLUBS_KEY, isClubs) ?? [];
}

export function saveClubs(clubs: Club[]): void {
  write(CLUBS_KEY, clubs);
}

/**
 * Older saves have Matches without a Target (they were played to the Session's Point system)
 * and no saved Club name (null).
 */
export function normalizeSession(session: Session): Session {
  const withName: Session =
    typeof session.clubName === "string" || session.clubName === null
      ? session
      : { ...session, clubName: null };
  if (withName.matches.every((match) => match.target === 21 || match.target === 31)) {
    return withName;
  }
  return {
    ...withName,
    matches: withName.matches.map((match) =>
      match.target === 21 || match.target === 31
        ? match
        : { ...match, target: withName.pointSystem },
    ),
  };
}

/** Older Ended sessions have no saved Club name (null). */
export function normalizeEndedSession(ended: EndedSession): EndedSession {
  return typeof ended.clubName === "string" || ended.clubName === null
    ? ended
    : { ...ended, clubName: null };
}

export function loadSession(): Session | null {
  const session = read(SESSION_KEY, isSession);
  return session && normalizeSession(session);
}

export function saveSession(session: Session): void {
  write(SESSION_KEY, session);
}

export function clearSession(): void {
  remove(SESSION_KEY);
}

export function removeLegacySummary(): void {
  remove(LEGACY_SUMMARY_KEY);
}

/** Newest first by `endedAt`. Also drops the old summary key. */
export function loadEndedSessions(): EndedSession[] {
  removeLegacySummary();
  const stored = (read(ENDED_SESSIONS_KEY, isEndedSessions) ?? []).map(normalizeEndedSession);
  return [...stored].sort((a, b) => b.endedAt - a.endedAt);
}

/**
 * Keep `ended` first in `existing`, at most 50 newest. If storage is full, drop the oldest
 * and retry until it fits or only `ended` is left; a final failure is logged, not thrown.
 * Returns the list as kept (newest first).
 */
export function saveEndedSession(
  existing: readonly EndedSession[],
  ended: EndedSession,
): EndedSession[] {
  let list = [ended, ...existing.filter((other) => other.id !== ended.id)]
    .sort((a, b) => b.endedAt - a.endedAt)
    .slice(0, MAX_ENDED_SESSIONS);
  for (;;) {
    try {
      writeOrThrow(ENDED_SESSIONS_KEY, list);
      return list;
    } catch (error) {
      if (list.length <= 1) {
        console.error(`Failed to save ${ENDED_SESSIONS_KEY}`, error);
        return list;
      }
      list = list.slice(0, -1);
    }
  }
}

/** The device's Account as last seen from the Backend, so Home can show it before (or without) the network. */
export function loadAccount(): Account | null {
  return read(ACCOUNT_KEY, isAccount);
}

export function saveAccount(account: Account): void {
  write(ACCOUNT_KEY, account);
}

export function clearAccount(): void {
  remove(ACCOUNT_KEY);
}

/** Whether the Welcome screen is done: the person created an Account or skipped. */
export function loadWelcomeDone(): boolean {
  return read(WELCOME_DONE_KEY, isTrue) === true;
}

export function saveWelcomeDone(): void {
  write(WELCOME_DONE_KEY, true);
}
