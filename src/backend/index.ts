import { setAccount, setSharedClubs } from "../storage/store.ts";
import type { Backend } from "./backend.ts";
import { FIREBASE_EMULATOR_CONFIG } from "./firebaseEmulator.ts";
import { createLazyFirebaseBackend, firebaseConfigFromEnv } from "./firebaseBackendLazy.ts";
import { createLocalFakeBackend } from "./localFakeBackend.ts";

export type { Backend } from "./backend.ts";
export { BackendError } from "./backend.ts";

let selected: { backend: Backend | null } | null = null;

/**
 * The Backend chosen at startup, or null when there is none (Account features are then
 * unavailable and the app behaves as it did before Accounts):
 * - `VITE_BACKEND=fake`: the local fake, persisted in localStorage (e2e, local dev)
 * - `VITE_FIREBASE_EMULATOR=1`: Firebase on the local emulators, no config needed (e2e, local dev)
 * - else Firebase config present (`VITE_FIREBASE_*`): Firebase
 * - else: none
 */
export function getBackend(): Backend | null {
  selected ??= { backend: selectBackend() };
  return selected.backend;
}

function selectBackend(): Backend | null {
  // Read straight off `import.meta.env` so builds without these variables drop the Firebase branch.
  if (import.meta.env.VITE_BACKEND === "fake") return createLocalFakeBackend();
  if (import.meta.env.VITE_FIREBASE_EMULATOR === "1") {
    return createLazyFirebaseBackend(FIREBASE_EMULATOR_CONFIG, { emulator: true });
  }
  if (import.meta.env.VITE_FIREBASE_PROJECT_ID) {
    const config = firebaseConfigFromEnv({
      VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
      VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
      VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      VITE_FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    });
    if (config) return createLazyFirebaseBackend(config);
  }
  return null;
}

/** Test helper: use this Backend (or none) instead of the one chosen from the environment. */
export function setBackendForTests(backend: Backend | null): void {
  selected = { backend };
}

/** Keep the store's current Account in step with the Backend. Call once at startup. */
export function startAccountSync(backend: Backend | null = getBackend()): () => void {
  if (!backend) return () => {};
  return backend.observeCurrentAccount(setAccount);
}

/** Keep the store's Shared clubs in step with the Backend (and so cached on the device). Call once at startup. */
export function startSharedClubSync(backend: Backend | null = getBackend()): () => void {
  if (!backend) return () => {};
  return backend.observeSharedClubs(setSharedClubs);
}
