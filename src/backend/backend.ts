import type { Account, Club, ClubPlayer } from "../domain/types.ts";
import type { ClubPlayerPatch } from "../domain/clubChanges.ts";

export type BackendErrorCode =
  /** The action needs a connection and the device is offline. */
  | "offline"
  /** This device already has an Account. */
  | "account-exists"
  /** The name is empty. */
  | "invalid-name"
  /** The action needs an Account and this device has none. */
  | "no-account"
  /** The Club or Club player doesn't exist (any more). */
  | "not-found"
  /** Every Account ID that was tried was already taken. */
  | "id-unavailable"
  | "failed";

export class BackendError extends Error {
  readonly code: BackendErrorCode;

  constructor(code: BackendErrorCode, message?: string, options?: ErrorOptions) {
    super(message ?? code, options);
    this.name = "BackendError";
    this.code = code;
  }
}

/** Stops an observer. */
export type Unsubscribe = () => void;

/**
 * The one boundary the app talks to for everything that lives on a server (ADR-0006).
 * UI code only ever sees this interface, never Firebase.
 *
 * Grows with each ticket; today it only covers the device's own Account.
 */
export interface Backend {
  /** Whether the device can reach the server right now (best effort). */
  isOnline(): boolean;
  /** Calls `listener` when going online or offline. */
  observeOnline(listener: (online: boolean) => void): Unsubscribe;

  /** The Account bound to this device, or null. */
  getCurrentAccount(): Promise<Account | null>;
  /** Calls `listener` with the current Account (or null) right away, then on every change. */
  observeCurrentAccount(listener: (account: Account | null) => void): Unsubscribe;
  /**
   * Creates this device's Account: reserves a unique, readable Account ID derived from `name`
   * (trying again when it is taken) and stores the name. Needs a connection.
   * Rejects with a {@link BackendError}.
   */
  createAccount(name: string): Promise<Account>;
  /**
   * Changes the name of this device's Account. The Account ID never changes. Needs a connection.
   * Resolves with the renamed Account; rejects with a {@link BackendError}.
   */
  renameAccount(name: string): Promise<Account>;

  // --- Shared clubs (ADR-0006) -------------------------------------------------------------
  //
  // Each Club player row and the Club name are separate records, so the most recent change to
  // each wins. Changes work offline: they show up in the observer straight away and sync when
  // the connection is back. Adding a row is the exception: it needs a connection.

  /**
   * Calls `listener` with the Shared clubs the current Account is linked to (empty without an
   * Account), right away and then on every change.
   */
  observeSharedClubs(listener: (clubs: Club[]) => void): Unsubscribe;
  /**
   * Creates a Shared club. The creator's Club player row (the Account's name, Intermediate,
   * linked as Organizer) is added first, before `players`. Needs an Account.
   */
  createSharedClub(input: { id: string; name: string; players: ClubPlayer[] }): Promise<Club>;
  renameSharedClub(clubId: string, name: string): Promise<void>;
  /** Deletes the Club and its Club players. Organizer rules arrive with Roles (ticket 05). */
  deleteSharedClub(clubId: string): Promise<void>;
  /** Needs a connection: rejects with `offline` otherwise. */
  addClubPlayer(clubId: string, player: ClubPlayer): Promise<void>;
  updateClubPlayer(clubId: string, playerId: string, patch: ClubPlayerPatch): Promise<void>;
  removeClubPlayer(clubId: string, playerId: string): Promise<void>;
}

/** How many Account IDs to try before giving up. */
export const MAX_ACCOUNT_ID_ATTEMPTS = 10;

export interface OnlineSource {
  get(): boolean;
  subscribe(listener: (online: boolean) => void): Unsubscribe;
}

/** Online state from the browser (`navigator.onLine` plus the online/offline events). */
export const browserOnline: OnlineSource = {
  get: () => (typeof navigator === "undefined" ? true : navigator.onLine),
  subscribe(listener) {
    const goOnline = () => listener(true);
    const goOffline = () => listener(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  },
};

/** Options shared by the in-memory and local fake backends (and handy for tests). */
export interface SimulatedBackendOptions {
  /** Random source for Account IDs. */
  random?: () => number;
  /** Account IDs that are already taken by somebody else. */
  takenAccountIds?: readonly string[];
  /** The device's Account to start with, as if it had been created earlier. */
  account?: Account | null;
  online?: OnlineSource;
}
