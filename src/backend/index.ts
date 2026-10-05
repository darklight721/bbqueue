import type { ActiveSession, Session } from "../domain/types.ts";
import { accountIdsEqual } from "../domain/accountId.ts";
import { setFlash } from "../storage/flash.ts";
import {
  applyActiveSessionOf,
  applyEndedSessionsReport,
  applyActiveSessionsReport,
  getAccount,
  getSharedSessions,
  isPublishedCopy,
  observeSharedSessions,
  removeSharedSession,
  setAccount,
  setRequests,
  setSharedClubs,
  setHostedSession,
} from "../storage/store.ts";
import type { Backend } from "./backend.ts";
import { FIREBASE_EMULATOR_CONFIG } from "./firebaseEmulator.ts";
import { createLazyFirebaseBackend, firebaseConfigFromEnv } from "./firebaseBackendLazy.ts";
import { createLocalFakeBackend } from "./localFakeBackend.ts";
import { createHostRequests, type HostRequests } from "./hostRequests.ts";
import { createCoalescingUploader, type Uploader } from "./sessionUploader.ts";

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

/**
 * Keep the Active sessions of Shared clubs in step with the Backend, both ways (ADR-0007). What
 * the server reports lands in the store (and so on the device, for viewing offline). For every
 * Club this Account hosts, the store's copy is uploaded after each change: whole, coalesced, one
 * write at a time, and only while online; and Players' requests are applied to it (see
 * `hostRequests.ts`). For every Club it only watches, this Account's own requests are followed, to
 * show "Waiting for host". Call once at startup; it keeps going whichever screen is open.
 */
export function startActiveSessionSync(maybeBackend: Backend | null = getBackend()): () => void {
  if (!maybeBackend) return () => {};
  const backend: Backend = maybeBackend;
  interface Hosting {
    sessionId: string;
    uploader: Uploader<Session>;
    requests: HostRequests;
    last: Session | null;
  }
  const hosting = new Map<string, Hosting>();
  /** Clubs watched as a Player: this Account's own requests. */
  const watching = new Map<string, { sessionId: string; stop: () => void }>();

  function stopHosting(clubId: string) {
    const host = hosting.get(clubId);
    host?.uploader.stop();
    host?.requests.stop();
    hosting.delete(clubId);
  }

  function stopWatching(clubId: string) {
    watching.get(clubId)?.stop();
    watching.delete(clubId);
  }

  function startHosting(clubId: string, entry: ActiveSession): Hosting {
    const requests = createHostRequests({
      backend,
      clubId,
      getSession: () => getSharedSessions().find((s) => s.clubId === clubId)?.session ?? null,
      setSession: (session) => setHostedSession(clubId, session),
      onRequests: (all) => setRequests(clubId, all),
    });
    const uploader = createCoalescingUploader<Session>({
      send: (session) =>
        backend.publishActiveSession(clubId, session).then(() => requests.uploaded(session)),
      isOnline: () => backend.isOnline(),
      observeOnline: (listener) => backend.observeOnline(listener),
      onError(error) {
        const code = (error as { code?: unknown } | null)?.code;
        // Somebody else hosts it now. The refusal itself is the news: ask the server who, so
        // this device turns read-only and drops its unsent changes at once, without
        // waiting for the observer (which says the same).
        if (code === "forbidden") {
          void backend
            .getActiveSession(clubId)
            .then((active) => applyActiveSessionOf(clubId, active))
            .catch((fetchError: unknown) =>
              console.warn("Couldn't learn who hosts the session", fetchError),
            );
          return "stop";
        }
        // The Club's session is gone from the server (the Club was deleted, or this
        // Account was taken off it): nothing left to upload to.
        if (code === "not-found") {
          removeSharedSession(clubId);
          setFlash(
            `The active session of ${entry.session.clubName ?? "the club"} is no longer shared.`,
          );
          return "stop";
        }
        console.warn("Uploading the session failed, trying again", error);
        return "retry";
      },
    });
    return { sessionId: entry.session.id, uploader, requests, last: null };
  }

  let syncing = false;
  let again = false;
  function syncAll() {
    // Applying requests saves the Session, which calls back in here: finish this pass, then go again.
    if (syncing) {
      again = true;
      return;
    }
    syncing = true;
    try {
      do {
        again = false;
        syncOnce();
      } while (again);
    } finally {
      syncing = false;
    }
  }

  function syncOnce() {
    const me = getAccount()?.accountId;
    const all = getSharedSessions();
    const hosted = me ? all.filter((entry) => accountIdsEqual(entry.hostAccountId, me)) : [];
    for (const clubId of [...hosting.keys()]) {
      if (!hosted.some((entry) => entry.clubId === clubId)) stopHosting(clubId);
    }
    for (const entry of hosted) {
      const { clubId } = entry;
      stopWatching(clubId);
      if (hosting.get(clubId)?.sessionId !== entry.session.id) stopHosting(clubId);
      let host = hosting.get(clubId);
      if (!host) {
        host = startHosting(clubId, entry);
        hosting.set(clubId, host);
      }
      if (host.last !== entry.session) {
        host.last = entry.session;
        // Copies the server is known to have don't need sending.
        if (!isPublishedCopy(entry.session)) host.uploader.push(entry.session);
      }
      host.requests.process();
    }

    // Everything else is watched: follow this Account's own requests, if it has a Session player here.
    const watched = me
      ? all.filter(
          (entry) =>
            !accountIdsEqual(entry.hostAccountId, me) &&
            entry.session.players.some(
              (player) => player.accountId && accountIdsEqual(player.accountId, me),
            ),
        )
      : [];
    for (const clubId of [...watching.keys()]) {
      if (!watched.some((entry) => entry.clubId === clubId)) stopWatching(clubId);
    }
    for (const entry of watched) {
      const { clubId } = entry;
      if (watching.get(clubId)?.sessionId === entry.session.id) continue;
      stopWatching(clubId);
      watching.set(clubId, {
        sessionId: entry.session.id,
        stop: backend.observeSessionRequests(clubId, "own", (requests) =>
          setRequests(clubId, requests),
        ),
      });
    }
  }

  const stopObserving = backend.observeActiveSessions((report) => {
    applyActiveSessionsReport(report);
    syncAll();
  });
  const stopEnded = backend.observeEndedSessions(applyEndedSessionsReport);
  const stopStore = observeSharedSessions(syncAll);
  syncAll();

  return () => {
    stopObserving();
    stopEnded();
    stopStore();
    for (const clubId of [...hosting.keys()]) stopHosting(clubId);
    for (const clubId of [...watching.keys()]) stopWatching(clubId);
  };
}
