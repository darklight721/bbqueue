import type { Club, Session, SessionSummary } from "../domain/types.ts";

const VERSION = 1;
const CLUBS_KEY = "bq:v1:clubs";
const SESSION_KEY = "bq:v1:session";
const SUMMARY_KEY = "bq:v1:summary";

export const STORAGE_KEYS = { clubs: CLUBS_KEY, session: SESSION_KEY, summary: SUMMARY_KEY };

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

const isSummary: Guard<SessionSummary> = (value): value is SessionSummary =>
  isRecord(value) &&
  typeof value.sessionName === "string" &&
  typeof value.totalMatches === "number" &&
  Array.isArray(value.topWinners);

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

function write(key: string, data: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify({ version: VERSION, data }));
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

/** Older saves have Matches without a Target: they were played to the Session's Point system. */
export function normalizeSession(session: Session): Session {
  if (session.matches.every((match) => match.target === 21 || match.target === 31)) return session;
  return {
    ...session,
    matches: session.matches.map((match) =>
      match.target === 21 || match.target === 31
        ? match
        : { ...match, target: session.pointSystem },
    ),
  };
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

export function loadSummary(): SessionSummary | null {
  return read(SUMMARY_KEY, isSummary);
}

export function saveSummary(summary: SessionSummary): void {
  write(SUMMARY_KEY, summary);
}

export function clearSummary(): void {
  remove(SUMMARY_KEY);
}
