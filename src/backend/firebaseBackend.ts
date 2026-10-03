import { initializeApp, type FirebaseOptions } from "firebase/app";
import { getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";
import {
  doc,
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
import { normalizeName } from "../domain/validation.ts";
import type { Account } from "../domain/types.ts";
import { BackendError, MAX_ACCOUNT_ID_ATTEMPTS, browserOnline, type Backend } from "./backend.ts";

/**
 * Firebase version of {@link Backend}: Anonymous Auth + Firestore with the offline cache on.
 *
 * Records:
 * - `accounts/{uid}`: `{ accountId, name, createdAt }`
 * - `accountIds/{normalised Account ID}`: `{ uid }`, the reservation that keeps IDs unique
 *
 * This is the only module (with `firebaseBackendLazy.ts`) that imports Firebase.
 */
export function createFirebaseBackend(
  config: FirebaseOptions,
  options: { random?: () => number } = {},
): Backend {
  const random = options.random ?? Math.random;
  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = openFirestore(app);

  function accountFromSnapshot(snapshot: DocumentSnapshot): Account | null {
    const data = snapshot.data();
    if (!data || typeof data.accountId !== "string" || typeof data.name !== "string") return null;
    return { accountId: data.accountId, name: data.name };
  }

  return {
    isOnline: () => browserOnline.get(),
    observeOnline: (listener) => browserOnline.subscribe(listener),

    async getCurrentAccount() {
      await auth.authStateReady();
      const user = auth.currentUser;
      if (!user) return null;
      const ref = doc(db, "accounts", user.uid);
      try {
        return accountFromSnapshot(await getDoc(ref));
      } catch {
        // Offline and not on the server yet: fall back to whatever the cache has.
        try {
          return accountFromSnapshot(await getDocFromCache(ref));
        } catch {
          return null;
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
            listener(accountFromSnapshot(snapshot));
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
      if (trimmed === "") throw new BackendError("invalid-name");
      if (!browserOnline.get()) throw new BackendError("offline");

      try {
        const user = auth.currentUser ?? (await signInAnonymously(auth)).user;
        for (let attempt = 0; attempt < MAX_ACCOUNT_ID_ATTEMPTS; attempt++) {
          const accountId = generateAccountId(trimmed, random);
          const taken = await reserve(db, user.uid, accountId, trimmed);
          if (!taken) return { accountId, name: trimmed };
        }
      } catch (error) {
        throw toBackendError(error);
      }
      throw new BackendError("id-unavailable");
    },

    async renameAccount(name) {
      const trimmed = normalizeName(name);
      if (trimmed === "") throw new BackendError("invalid-name");
      if (!browserOnline.get()) throw new BackendError("offline");

      try {
        await auth.authStateReady();
        const user = auth.currentUser;
        if (!user) throw new BackendError("no-account");
        const ref = doc(db, "accounts", user.uid);
        const current = accountFromSnapshot(await getDoc(ref));
        if (!current) throw new BackendError("no-account");
        // Only the name: the Account ID and its reservation never change.
        await updateDoc(ref, { name: trimmed });
        return { ...current, name: trimmed };
      } catch (error) {
        throw toBackendError(error);
      }
    },
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

function openFirestore(app: ReturnType<typeof initializeApp>): Firestore {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    // Persistence isn't available here (e.g. no IndexedDB): carry on without the offline cache.
    return getFirestore(app);
  }
}
