import type { Account, Club } from "../domain/types.ts";
import type { Backend, SimulatedBackendOptions } from "./backend.ts";
import type { ClubOp } from "./simulatedClubs.ts";
import { createSimulatedBackend } from "./simulatedBackend.ts";

/** Separate from the app's own `bq:v1:*` keys: this stands in for the server. */
export const FAKE_BACKEND_KEYS = {
  account: "bq:fake:account",
  accountIds: "bq:fake:account-ids",
  /** Shared clubs on the "server": an array of Clubs. */
  clubs: "bq:fake:clubs",
  /** Shared club changes made while offline that haven't reached the "server" yet. */
  pendingClubOps: "bq:fake:pending-club-ops",
} as const;

function readJson<T>(key: string, guard: (value: unknown) => value is T): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return guard(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const isAccount = (value: unknown): value is Account =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as Account).accountId === "string" &&
  typeof (value as Account).name === "string";

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const isRecordArray = (value: unknown): value is Record<string, unknown>[] =>
  Array.isArray(value) && value.every((item) => typeof item === "object" && item !== null);

/** Seeded or stored Clubs may lack `kind` and `players`; on the "server" they are all Shared clubs. */
function toSharedClub(raw: Record<string, unknown>): Club {
  return {
    id: String(raw.id),
    name: String(raw.name),
    kind: "shared",
    players: Array.isArray(raw.players) ? (raw.players as Club["players"]) : [],
  };
}

/**
 * Backend persisted in localStorage, with no server. Used by Playwright e2e and local dev
 * without a Firebase project (`VITE_BACKEND=fake`). "Needs a connection" follows
 * `navigator.onLine`, like the real thing.
 */
export function createLocalFakeBackend(options: SimulatedBackendOptions = {}): Backend {
  return createSimulatedBackend(
    {
      loadAccount: () => readJson(FAKE_BACKEND_KEYS.account, isAccount),
      saveAccount: (account) =>
        localStorage.setItem(FAKE_BACKEND_KEYS.account, JSON.stringify(account)),
      loadReservedIds: () => readJson(FAKE_BACKEND_KEYS.accountIds, isStringArray) ?? [],
      saveReservedIds: (ids) =>
        localStorage.setItem(FAKE_BACKEND_KEYS.accountIds, JSON.stringify(ids)),
      loadClubs: () => (readJson(FAKE_BACKEND_KEYS.clubs, isRecordArray) ?? []).map(toSharedClub),
      saveClubs: (clubs) => localStorage.setItem(FAKE_BACKEND_KEYS.clubs, JSON.stringify(clubs)),
      loadPendingOps: () =>
        (readJson(FAKE_BACKEND_KEYS.pendingClubOps, isRecordArray) ?? []) as ClubOp[],
      savePendingOps: (ops) =>
        localStorage.setItem(FAKE_BACKEND_KEYS.pendingClubOps, JSON.stringify(ops)),
      observeExternalChanges(listener) {
        const keys: (string | null)[] = [null, ...Object.values(FAKE_BACKEND_KEYS)];
        const onStorage = (event: StorageEvent) => {
          if (keys.includes(event.key)) listener();
        };
        window.addEventListener("storage", onStorage);
        return () => window.removeEventListener("storage", onStorage);
      },
    },
    options,
  );
}
