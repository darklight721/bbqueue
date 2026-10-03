import { initializeApp, type FirebaseOptions } from "firebase/app";
import { connectAuthEmulator, getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";
import {
  connectFirestoreEmulator,
  disableNetwork,
  doc,
  enableNetwork,
  getDoc,
  getDocFromCache,
  getFirestore,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  runTransaction,
  serverTimestamp,
  updateDoc,
  type DocumentSnapshot,
  type Firestore,
} from "firebase/firestore";
import { generateAccountId, normalizeAccountId } from "../domain/accountId.ts";
import { MAX_NAME_LENGTH, normalizeName } from "../domain/validation.ts";
import type { Account } from "../domain/types.ts";
import {
  BackendError,
  MAX_ACCOUNT_ID_ATTEMPTS,
  browserOnline,
  type Backend,
  type OnlineSource,
} from "./backend.ts";
import { FIREBASE_EMULATOR } from "./firebaseEmulator.ts";
import { createFirebaseClubs } from "./firebaseClubs.ts";
import type { SharedClubsApi } from "./simulatedClubs.ts";

/**
 * Firebase version of {@link Backend}: Anonymous Auth + Firestore with the offline cache on.
 *
 * Records:
 * - `accounts/{uid}`: `{ accountId, name, createdAt }`
 * - `accountIds/{normalised Account ID}`: `{ uid }`, the reservation that keeps IDs unique. It is
 *   never deleted, so an Account ID is never given out twice.
 *
 * This is the only module (with `firebaseBackendLazy.ts`) that imports Firebase.
 */
export interface FirebaseBackendOptions {
  random?: () => number;
  /** Talk to the local Firebase emulators (Auth and Firestore) instead of the cloud. */
  emulator?: boolean;
  /** Name for the Firebase app; tests give each simulated device its own. */
  appName?: string;
  /**
   * Where "online" comes from (the browser by default). When given, going offline also cuts
   * Firestore's connection, so tests can see queued writes. Real apps leave it out: Firestore
   * notices the network by itself.
   */
  online?: OnlineSource;
  /** Keep Firestore's cache on disk (default). Node tests have no IndexedDB and turn it off. */
  persistentCache?: boolean;
}

export function createFirebaseBackend(
  config: FirebaseOptions,
  options: FirebaseBackendOptions = {},
): Backend {
  const random = options.random ?? Math.random;
  const online = options.online ?? browserOnline;
  const app = initializeApp(config, options.appName);
  const auth = getAuth(app);
  const db = openFirestore(app, options.persistentCache ?? true);
  if (options.emulator) {
    connectAuthEmulator(auth, FIREBASE_EMULATOR.authUrl, { disableWarnings: true });
    connectFirestoreEmulator(db, FIREBASE_EMULATOR.firestoreHost, FIREBASE_EMULATOR.firestorePort);
  }
  if (options.online) {
    options.online.subscribe((isOnline) => {
      void (isOnline ? enableNetwork(db) : disableNetwork(db));
    });
    if (!options.online.get()) void disableNetwork(db);
  }

  function accountFromSnapshot(snapshot: DocumentSnapshot): Account | null {
    const data = snapshot.data();
    if (!data || typeof data.accountId !== "string" || typeof data.name !== "string") return null;
    return { accountId: data.accountId, name: data.name };
  }

  /** The Account last seen on this device: the answer when the server and the cache can't be read. */
  let lastKnown: Account | null = null;
  /**
   * Signing in comes before the Account is written, so the Account's own listener can hear "there
   * is none" from the server just after it was created here. Don't take that for a deletion.
   */
  let justCreatedUntil = 0;

  const backend: Omit<Backend, keyof SharedClubsApi> = {
    isOnline: () => online.get(),
    observeOnline: (listener) => online.subscribe(listener),

    async getCurrentAccount() {
      await auth.authStateReady();
      const user = auth.currentUser;
      if (!user) return null;
      const ref = doc(db, "accounts", user.uid);
      if (!online.get() && lastKnown) return lastKnown;
      try {
        // Offline, getDoc would wait for a connection that isn't coming; the cache answers at once.
        const snapshot = online.get() ? await getDoc(ref) : await getDocFromCache(ref);
        return (lastKnown = accountFromSnapshot(snapshot) ?? (online.get() ? null : lastKnown));
      } catch {
        // Offline: fall back to whatever the cache has, then to what this session last saw.
        try {
          return (lastKnown = accountFromSnapshot(await getDocFromCache(ref)) ?? lastKnown);
        } catch {
          return lastKnown;
        }
      }
    },

    observeCurrentAccount(listener) {
      let stopDoc = () => {};
      const stopAuth = onAuthStateChanged(auth, (user) => {
        stopDoc();
        stopDoc = () => {};
        if (!user) {
          listener(null);
          return;
        }
        stopDoc = onSnapshot(
          doc(db, "accounts", user.uid),
          (snapshot) => {
            // Offline with nothing cached says "doesn't exist", which is not the same as deleted.
            if (!snapshot.exists() && snapshot.metadata.fromCache) return;
            if (!snapshot.exists() && Date.now() < justCreatedUntil) return;
            lastKnown = accountFromSnapshot(snapshot);
            listener(lastKnown);
          },
          (error) => console.error("Account listener failed", error),
        );
      });
      return () => {
        stopAuth();
        stopDoc();
      };
    },

    async createAccount(name) {
      const trimmed = normalizeName(name);
      if (trimmed === "" || trimmed.length > MAX_NAME_LENGTH)
        throw new BackendError("invalid-name");
      if (!online.get()) throw new BackendError("offline");

      try {
        const user = auth.currentUser ?? (await signInAnonymously(auth)).user;
        for (let attempt = 0; attempt < MAX_ACCOUNT_ID_ATTEMPTS; attempt++) {
          const accountId = generateAccountId(trimmed, random);
          const taken = await reserve(db, user.uid, accountId, trimmed);
          if (!taken) {
            justCreatedUntil = Date.now() + 10_000;
            return (lastKnown = { accountId, name: trimmed });
          }
        }
      } catch (error) {
        throw toBackendError(error);
      }
      throw new BackendError("id-unavailable");
    },

    async renameAccount(name) {
      const trimmed = normalizeName(name);
      if (trimmed === "" || trimmed.length > MAX_NAME_LENGTH)
        throw new BackendError("invalid-name");
      if (!online.get()) throw new BackendError("offline");

      try {
        await auth.authStateReady();
        const user = auth.currentUser;
        if (!user) throw new BackendError("no-account");
        const ref = doc(db, "accounts", user.uid);
        const current = accountFromSnapshot(await getDoc(ref));
        if (!current) throw new BackendError("no-account");
        // Only the name: the Account ID and its reservation never change.
        await updateDoc(ref, { name: trimmed });
        return (lastKnown = { ...current, name: trimmed });
      } catch (error) {
        throw toBackendError(error);
      }
    },
  };

  return {
    ...backend,
    ...createFirebaseClubs(db, {
      online,
      getAccount: () => backend.getCurrentAccount(),
      currentUid: () => auth.currentUser?.uid ?? null,
      observeAccount: (listener) => backend.observeCurrentAccount(listener),
    }),
  };
}

/** Reserves `accountId` and writes the Account in one transaction. Returns true when taken. */
async function reserve(
  db: Firestore,
  uid: string,
  accountId: string,
  name: string,
): Promise<boolean> {
  const reservation = doc(db, "accountIds", normalizeAccountId(accountId));
  const account = doc(db, "accounts", uid);
  return runTransaction(db, async (transaction) => {
    if ((await transaction.get(account)).exists()) throw new BackendError("account-exists");
    if ((await transaction.get(reservation)).exists()) return true;
    transaction.set(reservation, { uid });
    transaction.set(account, { accountId, name, createdAt: serverTimestamp() });
    return false;
  });
}

function toBackendError(error: unknown): BackendError {
  if (error instanceof BackendError) return error;
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "unavailable" || code === "auth/network-request-failed") {
    return new BackendError("offline", undefined, { cause: error });
  }
  return new BackendError("failed", undefined, { cause: error });
}

function openFirestore(app: ReturnType<typeof initializeApp>, persistent: boolean): Firestore {
  if (!persistent) return initializeFirestore(app, {});
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    // Persistence isn't available here (e.g. no IndexedDB): carry on without the offline cache.
    return getFirestore(app);
  }
}
