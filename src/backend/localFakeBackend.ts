import type { Account } from "../domain/types.ts";
import type { Backend, SimulatedBackendOptions } from "./backend.ts";
import { createSimulatedBackend } from "./simulatedBackend.ts";

/** Separate from the app's own `bq:v1:*` keys: this stands in for the server. */
export const FAKE_BACKEND_KEYS = {
  account: "bq:fake:account",
  accountIds: "bq:fake:account-ids",
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
      observeExternalChanges(listener) {
        const onStorage = (event: StorageEvent) => {
          if (event.key === null || event.key === FAKE_BACKEND_KEYS.account) listener();
        };
        window.addEventListener("storage", onStorage);
        return () => window.removeEventListener("storage", onStorage);
      },
    },
    options,
  );
}
