import type { DocumentData } from "firebase/firestore";
import type { Account, AccountLink, ClubPlayer } from "../domain/types.ts";
import { BackendError, type OnlineSource, type Unsubscribe } from "./backend.ts";

/**
 * What the Firebase modules (accounts, Shared clubs, Active sessions) have in common: how they
 * wait for the server, how Firestore errors become Backend errors, and what they know about who
 * is signed in. This and `firebaseBackend.ts` (with its lazy loader) are where Firebase code lives.
 */

/** What the Firebase modules are given by `createFirebaseBackend`. */
export interface FirebaseDeps {
  online: OnlineSource;
  getAccount(): Promise<Account | null>;
  /** The signed-in Firebase user's uid (known once `getAccount` has answered), or null. */
  currentUid(): string | null;
  observeAccount(listener: (account: Account | null) => void): Unsubscribe;
}

/** The signed-in Account and its uid, or `no-account`. */
export async function requireViewer(
  deps: Pick<FirebaseDeps, "getAccount" | "currentUid">,
): Promise<{ account: Account; uid: string }> {
  const account = await deps.getAccount();
  const uid = deps.currentUid();
  if (!account || !uid) throw new BackendError("no-account");
  return { account, uid };
}

/** Listeners that fail are tried again after 250 ms, doubling each time up to this. */
const MAX_RETRY_DELAY_MS = 30_000;
export const retryDelay = (attempt: number) => Math.min(250 * 2 ** attempt, MAX_RETRY_DELAY_MS);

/** How long to wait for the server before treating a write as queued (see {@link settle}). */
export const SETTLE_TIMEOUT_MS = 8_000;
/** How long to wait for the cache before giving up on it. */
export const CACHE_TIMEOUT_MS = 2_000;
/** How long a write may take to reach the server before it counts as not having. */
const CONFIRM_TIMEOUT_MS = 30_000;

export const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/**
 * Online, wait for the server so failures (e.g. Security Rules) reach the caller. Offline the
 * write waits in Firestore's queue and never settles until the connection is back, so don't wait.
 * Online but with a network that is really down (`navigator.onLine` can say true), the write
 * would hang too: after `timeoutMs` it counts as queued and Save carries on.
 */
export async function settle(
  online: OnlineSource,
  write: Promise<unknown>,
  timeoutMs = SETTLE_TIMEOUT_MS,
): Promise<void> {
  if (online.get()) {
    const queued = Symbol("queued");
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        write,
        new Promise<typeof queued>((resolve) => {
          timer = setTimeout(() => resolve(queued), timeoutMs);
        }),
      ]);
      if (result === queued) {
        write.catch((error: unknown) => console.error("Queued write failed", error));
      }
    } catch (error) {
      throw toBackendError(error);
    } finally {
      clearTimeout(timer);
    }
    return;
  }
  write.catch((error: unknown) => console.error("Queued write failed", error));
}

/** Resolves when the server has the write; a network that is really down rejects as `offline`. */
export async function confirmed<T>(write: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      write,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new BackendError("offline")), CONFIRM_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Firestore and Auth errors in the Backend's words. */
export function toBackendError(error: unknown): BackendError {
  if (error instanceof BackendError) return error;
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "permission-denied") {
    return new BackendError("forbidden", undefined, { cause: error });
  }
  if (code === "not-found") return new BackendError("not-found", undefined, { cause: error });
  if (code === "unavailable" || code === "auth/network-request-failed") {
    return new BackendError("offline", undefined, { cause: error });
  }
  return new BackendError("failed", undefined, { cause: error });
}

export const toLink = (link: AccountLink, uid: string) => ({
  accountId: link.accountId,
  uid,
  role: link.role,
});

/** The record for a row. A link is only written with the uid of the Account it points at. */
export function toRecord(player: ClubPlayer, linkUid?: string): DocumentData {
  return {
    name: player.name,
    skill: player.skill,
    ...(player.link && linkUid ? { link: toLink(player.link, linkUid) } : {}),
  };
}
