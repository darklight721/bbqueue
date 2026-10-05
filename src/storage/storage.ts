import { parseEndedSession, parseSession } from "../domain/parseSession.ts";
import type {
  Account,
  ActiveSession,
  Club,
  ClubKind,
  ClubPlayer,
  EndedSession,
  Session,
} from "../domain/types.ts";

const VERSION = 1;
const CLUBS_KEY = "bq:v1:clubs";
const SESSION_KEY = "bq:v1:session";
const ENDED_SESSIONS_KEY = "bq:v1:ended-sessions";
const SHARED_CLUBS_KEY = "bq:v1:shared-clubs";
const SHARED_SESSIONS_KEY = "bq:v1:shared-sessions";
const SHARED_ENDED_SESSIONS_KEY = "bq:v1:shared-ended-sessions";
const ACCOUNT_KEY = "bq:v1:account";
const WELCOME_DONE_KEY = "bq:v1:welcome-done";
const INSTALL_HINT_DISMISSED_KEY = "bq:v1:install-hint-dismissed";
/** Replaced by Ended sessions (ADR-0005); removed on load and never written again. */
const LEGACY_SUMMARY_KEY = "bq:v1:summary";

/** Ended sessions kept on device; older ones are dropped (ADR-0005). */
export const MAX_ENDED_SESSIONS = 50;

export const STORAGE_KEYS = {
  clubs: CLUBS_KEY,
  sharedClubs: SHARED_CLUBS_KEY,
  sharedSessions: SHARED_SESSIONS_KEY,
  sharedEndedSessions: SHARED_ENDED_SESSIONS_KEY,
  session: SESSION_KEY,
  endedSessions: ENDED_SESSIONS_KEY,
  account: ACCOUNT_KEY,
  welcomeDone: WELCOME_DONE_KEY,
  installHintDismissed: INSTALL_HINT_DISMISSED_KEY,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** What a stored value is turned into, or null when it can't be used (never throws). */
type Parse<T> = (value: unknown) => T | null;

const parseClubs: Parse<Club[]> = (value) =>
  Array.isArray(value) &&
  value.every(
    (club) =>
      isRecord(club) &&
      typeof club.id === "string" &&
      typeof club.name === "string" &&
      Array.isArray(club.players) &&
      club.players.every(
        (player) =>
          isRecord(player) && typeof player.id === "string" && typeof player.name === "string",
      ),
  )
    ? (value as Club[])
    : null;

/** The entries that can be used; one bad entry doesn't take the rest with it. */
function parseEach<T>(parseOne: Parse<T>): Parse<T[]> {
  return (value) => {
    if (!Array.isArray(value)) return null;
    return value.flatMap((entry: unknown) => {
      const parsed = parseOne(entry);
      return parsed === null ? [] : [parsed];
    });
  };
}

const parseSharedSession: Parse<ActiveSession> = (entry) => {
  if (
    !isRecord(entry) ||
    typeof entry.clubId !== "string" ||
    typeof entry.hostAccountId !== "string" ||
    typeof entry.hostName !== "string" ||
    typeof entry.updatedAt !== "number"
  ) {
    return null;
  }
  const session = parseSession(entry.session);
  return session
    ? {
        clubId: entry.clubId,
        session,
        hostAccountId: entry.hostAccountId,
        hostName: entry.hostName,
        updatedAt: entry.updatedAt,
      }
    : null;
};

const parseAccount: Parse<Account> = (value) =>
  isRecord(value) && typeof value.accountId === "string" && typeof value.name === "string"
    ? { accountId: value.accountId, name: value.name }
    : null;

const parseTrue: Parse<true> = (value) => (value === true ? true : null);

function read<T>(key: string, parse: Parse<T>): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== VERSION) return null;
    return parse(parsed.data);
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

/** A stored Club player: keeps a valid Account link, drops anything else. */
function normalizeClubPlayer(player: ClubPlayer): ClubPlayer {
  const { link, ...rest } = player;
  const valid =
    isRecord(link) &&
    typeof link.accountId === "string" &&
    (link.role === "organizer" || link.role === "player");
  return valid ? { ...rest, link: { accountId: link.accountId, role: link.role } } : rest;
}

/** Clubs saved before Shared clubs have no `kind`; they are Local clubs. */
export function normalizeClub(club: Club, kind: ClubKind = "local"): Club {
  return { ...club, kind, players: club.players.map(normalizeClubPlayer) };
}

/** Local clubs: the ones that exist only on this device. */
export function loadClubs(): Club[] {
  return (read(CLUBS_KEY, parseClubs) ?? []).map((club) => normalizeClub(club, "local"));
}

export function saveClubs(clubs: Club[]): void {
  write(
    CLUBS_KEY,
    clubs.filter((club) => club.kind === "local"),
  );
}

/** Shared clubs as last received from the Backend, so they show offline after a reload. */
export function loadSharedClubs(): Club[] {
  return (read(SHARED_CLUBS_KEY, parseClubs) ?? []).map((club) => normalizeClub(club, "shared"));
}

export function saveSharedClubs(clubs: Club[]): void {
  write(
    SHARED_CLUBS_KEY,
    clubs.filter((club) => club.kind === "shared"),
  );
}

export function loadSession(): Session | null {
  // `parseSession` also fills in what older saves lack: a Match's Target and the Club's name.
  return read(SESSION_KEY, parseSession);
}

export function saveSession(session: Session): void {
  write(SESSION_KEY, session);
}

export function clearSession(): void {
  remove(SESSION_KEY);
}

/**
 * The Active sessions of Shared clubs as last received from the Backend, so viewers see the last
 * copy after a reload while offline, and a host keeps the Session it runs on this device.
 */
export function loadSharedSessions(): ActiveSession[] {
  return read(SHARED_SESSIONS_KEY, parseEach(parseSharedSession)) ?? [];
}

export function saveSharedSessions(sessions: ActiveSession[]): void {
  write(SHARED_SESSIONS_KEY, sessions);
}

/**
 * Removes everything the device cached about Shared clubs (`bq:v1:shared-*`): the Clubs, their
 * Active sessions and their Ended sessions. The server still has them; they come back on the next
 * start. Used when something cached makes the app fail.
 */
export function clearSharedStorage(): void {
  remove(SHARED_CLUBS_KEY);
  remove(SHARED_SESSIONS_KEY);
  remove(SHARED_ENDED_SESSIONS_KEY);
}

export function removeLegacySummary(): void {
  remove(LEGACY_SUMMARY_KEY);
}

/** Newest first by `endedAt`. Also drops the old summary key. */
export function loadEndedSessions(): EndedSession[] {
  removeLegacySummary();
  const stored = read(ENDED_SESSIONS_KEY, parseEach(parseEndedSession)) ?? [];
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

/**
 * Ended sessions of Shared clubs as last received from the Backend, so they can be looked at offline
 * after a reload. Newest first. If storage is full, the oldest are dropped until it fits (a final
 * failure is logged, not thrown); returns what was kept.
 */
export function loadSharedEndedSessions(): EndedSession[] {
  const stored = read(SHARED_ENDED_SESSIONS_KEY, parseEach(parseEndedSession)) ?? [];
  return [...stored].sort((a, b) => b.endedAt - a.endedAt);
}

export function saveSharedEndedSessions(sessions: readonly EndedSession[]): EndedSession[] {
  let list = [...sessions];
  for (;;) {
    try {
      writeOrThrow(SHARED_ENDED_SESSIONS_KEY, list);
      return list;
    } catch (error) {
      if (list.length === 0) {
        console.error(`Failed to save ${SHARED_ENDED_SESSIONS_KEY}`, error);
        return list;
      }
      list = list.slice(0, -1);
    }
  }
}

/** The device's Account as last seen from the Backend, so Home can show it before (or without) the network. */
export function loadAccount(): Account | null {
  return read(ACCOUNT_KEY, parseAccount);
}

export function saveAccount(account: Account): void {
  write(ACCOUNT_KEY, account);
}

export function clearAccount(): void {
  remove(ACCOUNT_KEY);
}

/** Whether the Welcome screen is done: the person created an Account or skipped. */
export function loadWelcomeDone(): boolean {
  return read(WELCOME_DONE_KEY, parseTrue) === true;
}

export function saveWelcomeDone(): void {
  write(WELCOME_DONE_KEY, true);
}

/** Whether the "Add to Home Screen" hint on Account settings was dismissed on this device. */
export function loadInstallHintDismissed(): boolean {
  return read(INSTALL_HINT_DISMISSED_KEY, parseTrue) === true;
}

export function saveInstallHintDismissed(): void {
  write(INSTALL_HINT_DISMISSED_KEY, true);
}
