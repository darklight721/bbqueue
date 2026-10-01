import type { Page } from "@playwright/test";
import type {
  Club,
  ClubPlayer,
  Court,
  Session,
  SessionPlayer,
  SessionSummary,
} from "../src/domain/types.ts";

/** Mirrors `STORAGE_KEYS` in src/storage/storage.ts (kept literal so e2e never imports app runtime code). */
export const STORAGE_KEYS = {
  clubs: "bq:v1:clubs",
  session: "bq:v1:session",
  summary: "bq:v1:summary",
} as const;

export type StorageKey = keyof typeof STORAGE_KEYS;

export interface SeedData {
  clubs?: Club[];
  session?: Session;
  summary?: SessionSummary;
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

export function makeSummary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    sessionName: "Tuesday night",
    totalMatches: 0,
    totalPlayers: 0,
    startedAt: 1_700_000_000_000,
    endedAt: 1_700_007_200_000,
    topWinners: [],
    ...overrides,
  };
}

/**
 * Seed localStorage (in the `{ version: 1, data }` envelope) before any app script runs.
 *
 * The init script re-runs on every full page load, so each key is seeded only once per tab
 * (tracked in sessionStorage). Otherwise a reload would resurrect data the app deliberately cleared.
 */
export async function seedStorage(page: Page, seed: SeedData): Promise<void> {
  const entries = (Object.keys(STORAGE_KEYS) as StorageKey[])
    .filter((name) => seed[name] !== undefined)
    .map((name): [string, string] => [
      STORAGE_KEYS[name],
      JSON.stringify({ version: 1, data: seed[name] }),
    ]);

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
