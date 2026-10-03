import type { Account } from "../domain/types.ts";

export type BackendErrorCode =
  /** The action needs a connection and the device is offline. */
  | "offline"
  /** This device already has an Account. */
  | "account-exists"
  /** The name is empty. */
  | "invalid-name"
  /** Every Account ID that was tried was already taken. */
  | "id-unavailable"
  /** The action needs an Account and this device has none. */
  | "no-account"
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
