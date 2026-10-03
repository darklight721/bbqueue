import type { FirebaseOptions } from "firebase/app";
import { browserOnline, type Backend } from "./backend.ts";

/** Firebase config from the `VITE_FIREBASE_*` variables, or null when they aren't set. */
export function firebaseConfigFromEnv(
  env: Record<string, string | undefined>,
): FirebaseOptions | null {
  const apiKey = env.VITE_FIREBASE_API_KEY;
  const projectId = env.VITE_FIREBASE_PROJECT_ID;
  const appId = env.VITE_FIREBASE_APP_ID;
  if (!apiKey || !projectId || !appId) return null;
  return {
    apiKey,
    projectId,
    appId,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || undefined,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || undefined,
  };
}

/**
 * The Firebase backend, loaded on first use so the SDK stays out of the main bundle (and out of
 * builds without a Firebase config altogether).
 */
export function createLazyFirebaseBackend(config: FirebaseOptions): Backend {
  const loaded = import("./firebaseBackend.ts").then((module) =>
    module.createFirebaseBackend(config),
  );
  loaded.catch((error: unknown) => console.error("Failed to load Firebase", error));

  /** Starts an observer once Firebase is loaded; the returned function stops it. */
  function observeWhenLoaded(start: (backend: Backend) => () => void): () => void {
    const stop = loaded.then(start, () => () => {});
    return () => void stop.then((unsubscribe) => unsubscribe());
  }

  return {
    isOnline: () => browserOnline.get(),
    observeOnline: (listener) => browserOnline.subscribe(listener),
    getCurrentAccount: () => loaded.then((backend) => backend.getCurrentAccount()),
    observeCurrentAccount: (listener) =>
      observeWhenLoaded((backend) => backend.observeCurrentAccount(listener)),
    createAccount: (name) => loaded.then((backend) => backend.createAccount(name)),
  };
}
