import type {
  Account,
  ActiveSession,
  Club,
  ClubPlayer,
  EndedSession,
  Role,
  Session,
  SessionRequest,
  SessionRequestKind,
} from "../domain/types.ts";
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
  /** Only an Organizer may do this (or, for leaving, only the Account itself). */
  | "forbidden"
  /** It would leave the Club without an Organizer. */
  | "last-organizer"
  /** No Account has that Account ID. */
  | "unknown-account"
  /** The Account is already linked to another Club player in this Club. */
  | "already-linked"
  /** The Shared club already has an Active session. */
  | "session-exists"
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

/** What `observeActiveSessions` reports. */
export interface ActiveSessionsReport {
  /** The Active sessions of the Shared clubs the Account is on, as far as they are known. */
  sessions: ActiveSession[];
  /**
   * Shared clubs whose Active session isn't known yet (not heard from the server, nothing
   * cached, e.g. offline after a fresh start). Whatever the device last had for them stays.
   */
  unknown: string[];
}

/** What `observeEndedSessions` reports. */
export interface EndedSessionsReport {
  /** The Ended sessions of the Shared clubs the Account is on: the 50 most recent per Club, as far as known. */
  sessions: EndedSession[];
  /** The Shared clubs the Account is on. Whatever the device has of any other Club can go. */
  clubIds: string[];
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
   * Deletes this device's Account (ticket 11), after the steps that go with it: the Shared clubs in
   * `deleteClubIds` (where this is the only linked Account) are deleted with their rows, Active
   * session, requests and Ended sessions, and this Account's row in each of `unlinkClubIds` is
   * unlinked (the row stays on the roster). Then the Account record goes, and so does the sign-in.
   * The Account ID reservation is never deleted, so the Account ID can't be used again.
   *
   * Checked before anything is changed: each Club to unlink keeps an Organizer, each Club to
   * delete has no other linked Account. Needs a connection. Rejects with `offline`, `no-account`,
   * `last-organizer` or `forbidden`; a failure part-way can be retried with the Clubs that are left.
   * An Active session this Account hosts in a Club that stays is left for another Organizer to take
   * over.
   */
  deleteAccount(input: { deleteClubIds: string[]; unlinkClubIds: string[] }): Promise<void>;
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

  // --- Linking Accounts and Roles (ticket 05) ----------------------------------------------
  //
  // A Club player row can be linked to an Account with a Role. Only an Organizer links, changes
  // Roles or unlinks (and may remove or edit any row); a linked Account may unlink only itself
  // (leave). A Club always keeps at least one Organizer. All of these need a connection and
  // reject with a {@link BackendError} (`forbidden`, `last-organizer`, `already-linked`,
  // `unknown-account`, `not-found`, `offline`). `addClubPlayer` also accepts a row with a link.

  /**
   * The Account with this Account ID (any capitalisation), or null when there is none. Needs a
   * connection; rejects with `offline` otherwise.
   */
  lookupAccount(accountId: string): Promise<Account | null>;
  linkClubPlayer(clubId: string, playerId: string, accountId: string, role: Role): Promise<void>;
  setClubPlayerRole(clubId: string, playerId: string, role: Role): Promise<void>;
  /** Unlink the row from its Account (for instance one that no longer exists). The row stays. */
  unlinkClubPlayer(clubId: string, playerId: string): Promise<void>;
  /** The current Account leaves the Club: its row stays on the roster, no longer linked. */
  leaveClub(clubId: string): Promise<void>;

  // --- Shared Active session (ticket 06, ADR-0007) -------------------------------------------
  //
  // Each Shared club has at most one Active session: the Session host's whole copy of the
  // Session, who the host is, and when it was last uploaded. Only the host changes it (taking
  // over arrives with ticket 07); anyone on the Club reads it. The host's device stays the
  // source of truth and keeps playing offline: `publishActiveSession` sends the latest copy when
  // the device is online, and the app calls it at most once at a time (see `sessionUploader.ts`).

  /**
   * Calls `listener` right away and then on every change with the Active sessions of the Shared
   * clubs the current Account is on. A Club's session disappears from the report when it ends.
   */
  observeActiveSessions(listener: (report: ActiveSessionsReport) => void): Unsubscribe;
  /**
   * Starts the Active session of a Shared club with `session`, recording this Account as the
   * Session host. Needs a connection, because "at most one per Club" is decided on the server.
   * Rejects with `offline`, `no-account`, `not-found` (no such Club), `forbidden` (not an
   * Organizer) or `session-exists`.
   */
  startSharedSession(clubId: string, session: Session): Promise<ActiveSession>;
  /**
   * The Session host uploads the latest copy of the Session. Needs a connection (`offline`
   * otherwise: the caller waits and sends the latest copy later). Rejects with `forbidden` when
   * this Account isn't the Session host and `not-found` when the Club has no Active session.
   */
  publishActiveSession(clubId: string, session: Session): Promise<void>;
  /**
   * The Session host ends the Active session: the record is deleted and everybody else sees it
   * go. Works offline: the delete waits and reaches the server when the connection is back.
   * Rejects with `forbidden` when this Account isn't the Session host.
   *
   * With `ended` (a Session with at least one Ended match, in the slimmed shape of ADR-0005) the
   * Ended session is published to the Club in the same step, so it is never lost with the Active
   * session, also when the device is offline (both wait for the connection together). It is
   * created once by the host and never changed or deleted by anyone.
   */
  endSharedSession(clubId: string, ended?: EndedSession | null): Promise<void>;
  /**
   * Calls `listener` right away and then on every change with the Ended sessions of the Shared
   * clubs the current Account is on: the 50 most recent per Club (rules can't count, so older ones
   * stay on the server but are left out of this listing).
   */
  observeEndedSessions(listener: (report: EndedSessionsReport) => void): Unsubscribe;
  /**
   * An Organizer who isn't the Session host makes themselves the host (ADR-0007), straight away
   * and in a transaction, keeping the Session as the server has it (what the old host never
   * uploaded is lost). Also how a host who left the Club or lost the Organizer Role is replaced.
   * Resolves with the record as it is now; taking over as the host already is is a no-op. Needs a
   * connection. Rejects with `offline`, `no-account`, `not-found` (no such Club or no Active
   * session) or `forbidden` (not an Organizer).
   */
  takeOverSession(clubId: string): Promise<ActiveSession>;
  /**
   * Turns a Local club into a Shared club (ticket 10). `club` is the Shared club to create (see
   * `makeSharedClub` in the domain): the Local club's id, name and rows, with exactly one row
   * linked, to this Account, as Organizer. Its Ended sessions and, when there is one, its Active
   * session (this Account becomes the Session host) go with it. Needs a connection.
   *
   * Nothing on the device changes here: the caller switches the device over once this resolves.
   * Whatever fails leaves the server possibly holding a part of the Club; calling again with the
   * same Club picks up where it stopped (rows and Ended sessions already there are skipped), and
   * `deleteSharedClub` removes it. Rejects with `offline`, `no-account`, `forbidden` (the id is
   * taken by somebody else's Club), `session-exists` or `failed`.
   */
  makeSharedClub(input: {
    club: Club;
    endedSessions: EndedSession[];
    activeSession: Session | null;
  }): Promise<{ club: Club; active: ActiveSession | null }>;
  /**
   * The Active session of a Club as the server has it right now, or null when there is none.
   * Needs a connection (`offline` otherwise). The old host's device uses it to learn who the host
   * is when an upload was refused.
   */
  getActiveSession(clubId: string): Promise<ActiveSession | null>;

  // --- Player requests (ticket 08, ADR-0007) ---------------------------------------------------
  //
  // A Player (or non-host Organizer) on the Club asks, for their own Session player, to switch
  // Sitting out on or off or to leave. The request is a record of its own that waits for the
  // Session host's device, which applies requests in the order they were made and marks each
  // `applied` or `skipped`. Requests belong to the Club's Active session, not to the host, so a
  // new host (take over) finds the pending ones.

  /**
   * Makes a request in the Club's Active session. Needs a connection. Rejects with `offline`,
   * `no-account`, `not-found` (no Active session) or `forbidden` (not on the Club).
   */
  requestSessionChange(
    clubId: string,
    input: { sessionId: string; sessionPlayerId: string; kind: SessionRequestKind },
  ): Promise<SessionRequest>;
  /**
   * Calls `listener` right away and then on every change with the Club's requests, oldest first:
   * `own` is this Account's (what a Player watches to show "Waiting for host"), `all` is everybody's
   * (what the Session host applies; anyone else is refused).
   */
  observeSessionRequests(
    clubId: string,
    scope: "own" | "all",
    listener: (requests: SessionRequest[]) => void,
  ): Unsubscribe;
  /**
   * The Session host marks pending requests as applied or skipped. Needs a connection. Rejects with
   * `offline` or `forbidden` (not the Session host any more). Requests already resolved are left alone.
   */
  resolveSessionRequests(
    clubId: string,
    results: { id: string; status: "applied" | "skipped" }[],
  ): Promise<void>;
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
