import type { FirebaseOptions } from "firebase/app";
import { browserOnline, type Backend } from "./backend.ts";
import type { FirebaseBackendOptions } from "./firebaseBackend.ts";

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
export function createLazyFirebaseBackend(
  config: FirebaseOptions,
  options: FirebaseBackendOptions = {},
): Backend {
  const loaded = import("./firebaseBackend.ts").then((module) =>
    module.createFirebaseBackend(config, options),
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
    renameAccount: (name) => loaded.then((backend) => backend.renameAccount(name)),

    // Shared clubs
    observeSharedClubs: (listener) =>
      observeWhenLoaded((backend) => backend.observeSharedClubs(listener)),
    createSharedClub: (input) => loaded.then((backend) => backend.createSharedClub(input)),
    renameSharedClub: (clubId, name) =>
      loaded.then((backend) => backend.renameSharedClub(clubId, name)),
    deleteSharedClub: (clubId) => loaded.then((backend) => backend.deleteSharedClub(clubId)),
    addClubPlayer: (clubId, player) =>
      loaded.then((backend) => backend.addClubPlayer(clubId, player)),
    updateClubPlayer: (clubId, playerId, patch) =>
      loaded.then((backend) => backend.updateClubPlayer(clubId, playerId, patch)),
    removeClubPlayer: (clubId, playerId) =>
      loaded.then((backend) => backend.removeClubPlayer(clubId, playerId)),
    lookupAccount: (accountId) => loaded.then((backend) => backend.lookupAccount(accountId)),
    linkClubPlayer: (clubId, playerId, accountId, role) =>
      loaded.then((backend) => backend.linkClubPlayer(clubId, playerId, accountId, role)),
    setClubPlayerRole: (clubId, playerId, role) =>
      loaded.then((backend) => backend.setClubPlayerRole(clubId, playerId, role)),
    unlinkClubPlayer: (clubId, playerId) =>
      loaded.then((backend) => backend.unlinkClubPlayer(clubId, playerId)),
    leaveClub: (clubId) => loaded.then((backend) => backend.leaveClub(clubId)),

    // Shared Active session
    observeActiveSessions: (listener) =>
      observeWhenLoaded((backend) => backend.observeActiveSessions(listener)),
    startSharedSession: (clubId, session) =>
      loaded.then((backend) => backend.startSharedSession(clubId, session)),
    publishActiveSession: (clubId, session) =>
      loaded.then((backend) => backend.publishActiveSession(clubId, session)),
    endSharedSession: (clubId, ended) =>
      loaded.then((backend) => backend.endSharedSession(clubId, ended)),
    observeEndedSessions: (listener) =>
      observeWhenLoaded((backend) => backend.observeEndedSessions(listener)),
    takeOverSession: (clubId) => loaded.then((backend) => backend.takeOverSession(clubId)),
    getActiveSession: (clubId) => loaded.then((backend) => backend.getActiveSession(clubId)),
    requestSessionChange: (clubId, input) =>
      loaded.then((backend) => backend.requestSessionChange(clubId, input)),
    observeSessionRequests: (clubId, scope, listener) =>
      observeWhenLoaded((backend) => backend.observeSessionRequests(clubId, scope, listener)),
    resolveSessionRequests: (clubId, results) =>
      loaded.then((backend) => backend.resolveSessionRequests(clubId, results)),
  };
}
