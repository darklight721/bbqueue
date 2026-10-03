import type { Page } from "@playwright/test";
import type {
  Account,
  Club,
  ClubPlayer,
  Court,
  EndedSession,
  EndedSessionMatch,
  Match,
  Session,
  SessionPlayer,
  SkillLevel,
} from "../src/domain/types.ts";

/** Mirrors `STORAGE_KEYS` in src/storage/storage.ts (kept literal so e2e never imports app runtime code). */
export const STORAGE_KEYS = {
  clubs: "bq:v1:clubs",
  session: "bq:v1:session",
  endedSessions: "bq:v1:ended-sessions",
  account: "bq:v1:account",
  welcomeDone: "bq:v1:welcome-done",
  installHintDismissed: "bq:v1:install-hint-dismissed",
} as const;

/**
 * Where the local fake Backend (`VITE_BACKEND=fake`, which e2e runs against) keeps its "server"
 * data. Mirrors `FAKE_BACKEND_KEYS` in src/backend/localFakeBackend.ts.
 */
export const FAKE_BACKEND_KEYS = {
  account: "bq:fake:account",
  accountIds: "bq:fake:account-ids",
} as const;

/**
 * Browser storage for a device that has already been through the Welcome screen. Playwright
 * applies it to every test by default (see playwright.config.ts), so specs start on Home. A spec
 * about first launch opts out with `test.use({ storageState: FIRST_LAUNCH_STORAGE_STATE })`.
 */
export function welcomeDoneStorageState(origin: string) {
  return {
    cookies: [],
    origins: [
      {
        origin,
        localStorage: [
          { name: STORAGE_KEYS.welcomeDone, value: JSON.stringify({ version: 1, data: true }) },
        ],
      },
    ],
  };
}

export const FIRST_LAUNCH_STORAGE_STATE = { cookies: [], origins: [] };

export type StorageKey = keyof typeof STORAGE_KEYS;

export interface SeedData {
  /** Seeds the Account in the app and in the fake Backend, as if it had been created on this device. */
  account?: Account;
  clubs?: Club[];
  session?: Session;
  endedSessions?: EndedSession[];
}

let counter = 0;
const nextId = (prefix: string) => `${prefix}-${++counter}`;

export function makeClubPlayer(overrides: Partial<ClubPlayer> = {}): ClubPlayer {
  const id = overrides.id ?? nextId("club-player");
  return { id, name: `Player ${id}`, skill: "intermediate", ...overrides };
}

/** Club with `playerCount` generated players (unique names). */
export function makeClubWithPlayers(
  playerCount: number,
  overrides: Partial<Omit<Club, "players">> = {},
): Club {
  const players = Array.from({ length: playerCount }, () => makeClubPlayer());
  return makeClub({ ...overrides, players });
}

export function makeClub(overrides: Partial<Club> = {}): Club {
  return {
    id: nextId("club"),
    name: "Tuesday Club",
    players: [],
    ...overrides,
  };
}

export function makeSessionPlayer(overrides: Partial<SessionPlayer> = {}): SessionPlayer {
  const id = overrides.id ?? nextId("player");
  return {
    id,
    name: `Player ${id}`,
    skill: "intermediate",
    clubPlayerId: null,
    sittingOut: false,
    removed: false,
    joinedAt: 1_700_000_000_000,
    ...overrides,
  };
}

export function makeCourt(number: number, overrides: Partial<Court> = {}): Court {
  return { id: nextId("court"), number, lineup: null, activeMatchId: null, ...overrides };
}

export function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: nextId("session"),
    name: "Tuesday night",
    clubId: null,
    clubName: null,
    pointSystem: 21,
    plannedHours: 2,
    startedAt: 1_700_000_000_000,
    players: [],
    courts: [makeCourt(1)],
    matches: [],
    queues: [],
    streakResetAt: {},
    ...overrides,
  };
}

export function makeEndedSession(overrides: Partial<EndedSession> = {}): EndedSession {
  return {
    id: nextId("ended"),
    name: "Tuesday night",
    clubId: null,
    clubName: null,
    pointSystem: 21,
    startedAt: 1_700_000_000_000,
    endedAt: 1_700_007_200_000,
    players: [],
    matches: [],
    ...overrides,
  };
}

type Pair = [string, string];

/**
 * Ended session built from named matches. Player ids are the names; players are the names that
 * appear in a match (plus `extraPlayers`, for tests that only need a player count).
 */
export function makeEndedSessionFromMatches(
  rows: { a: Pair; b: Pair; score: [number, number] | null; court?: number }[],
  overrides: Partial<EndedSession> & { skills?: Record<string, SkillLevel> } = {},
): EndedSession {
  const { skills = {}, ...rest } = overrides;
  const startedAt = rest.startedAt ?? 1_700_000_000_000;
  const matches: EndedSessionMatch[] = rows.map((row, index) => ({
    number: index + 1,
    courtNumber: row.court ?? 1,
    teams: [row.a, row.b],
    target: 21,
    startedAt: startedAt + index * 15 * 60_000,
    endedAt: startedAt + index * 15 * 60_000 + 10 * 60_000,
    score: row.score,
  }));
  const names = [...new Set(rows.flatMap((row) => [...row.a, ...row.b]))];
  return makeEndedSession({
    players: names.map((name) => ({ id: name, name, skill: skills[name] ?? "intermediate" })),
    matches,
    ...rest,
  });
}

/**
 * Seed localStorage (in the `{ version: 1, data }` envelope) before any app script runs.
 *
 * The init script re-runs on every full page load, so each key is seeded only once per tab
 * (tracked in sessionStorage). Otherwise a reload would resurrect data the app deliberately cleared.
 */
export async function seedStorage(page: Page, seed: SeedData): Promise<void> {
  const entries = (Object.keys(seed) as (keyof SeedData)[])
    .filter((name) => seed[name] !== undefined)
    .map((name): [string, string] => [
      STORAGE_KEYS[name],
      JSON.stringify({ version: 1, data: seed[name] }),
    ]);
  if (seed.account) {
    entries.push(
      [FAKE_BACKEND_KEYS.account, JSON.stringify(seed.account)],
      [FAKE_BACKEND_KEYS.accountIds, JSON.stringify([seed.account.accountId.toLowerCase()])],
    );
  }

  await page.addInitScript((items: [string, string][]) => {
    for (const [key, value] of items) {
      const marker = `e2e-seeded:${key}`;
      if (sessionStorage.getItem(marker) === null) {
        localStorage.setItem(key, value);
        sessionStorage.setItem(marker, "1");
      }
    }
  }, entries);
}

/** Read a raw stored value (parsed JSON envelope) or null if absent. */
export async function readStored(page: Page, name: StorageKey): Promise<unknown> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  }, STORAGE_KEYS[name]);
}

/** Like `readStored` but unwraps the `{ version, data }` envelope; returns null if absent. */
export async function readStoredData<T>(page: Page, name: StorageKey): Promise<T | null> {
  const envelope = (await readStored(page, name)) as { data: T } | null;
  return envelope === null ? null : envelope.data;
}

/**
 * Session mid-match: Court 1 is Busy (p1+p2 vs p3+p4, started at `startedAt`),
 * Court 2 is Idle holding a Lineup (p5+p6 vs p7+p8). Player names default to Ana…Hal.
 */
export function makeMidMatchSession(options: {
  startedAt: number;
  names?: string[];
  overrides?: Partial<Session>;
}): Session {
  const names = options.names ?? ["Ana", "Ben", "Cat", "Dan", "Eve", "Fay", "Gus", "Hal"];
  const players = names.map((name) => makeSessionPlayer({ name }));
  const ids = players.map((player) => player.id);
  const [a, b, c, d, e, f, g, h] = ids as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const match: Match = {
    id: nextId("match"),
    number: null,
    courtNumber: 1,
    teams: [
      [a, b],
      [c, d],
    ],
    freeAtStart: [e, f, g, h],
    startedAt: options.startedAt,
    target: 21,
    endedAt: null,
    score: null,
    status: "active",
  };
  return makeSession({
    name: "Mid match",
    players,
    matches: [match],
    courts: [
      makeCourt(1, { activeMatchId: match.id }),
      makeCourt(2, {
        lineup: {
          teams: [
            [e, f],
            [g, h],
          ],
        },
      }),
    ],
    ...options.overrides,
  });
}

/** The Account the fake Backend holds for this device (what the "server" knows), or null. */
export async function readFakeAccount(page: Page): Promise<Account | null> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as Account);
  }, FAKE_BACKEND_KEYS.account);
}
