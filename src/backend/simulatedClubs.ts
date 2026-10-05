import { accountIdsEqual } from "../domain/accountId.ts";
import {
  applyClubChange,
  creatorPlayer,
  roleInClub,
  type ClubChange,
} from "../domain/clubChanges.ts";
import { canDeleteClub, clubChangeProblem, ownRow } from "../domain/permissions.ts";
import { newId } from "../domain/ids.ts";
import type { Account, Club, ClubPlayer } from "../domain/types.ts";
import { MAX_NAME_LENGTH, normalizeName } from "../domain/validation.ts";
import { BackendError, type Backend, type OnlineSource } from "./backend.ts";

/** A Club player's name must be there and not longer than the Security Rules allow. */
function requireRowName(name: string) {
  if (name.trim() === "" || normalizeName(name).length > MAX_NAME_LENGTH) {
    throw new BackendError("invalid-name");
  }
}

/** A Shared club change that is waiting for the connection. */
export type ClubOp =
  | { type: "create"; club: Club }
  | { type: "delete"; clubId: string }
  | { type: "change"; clubId: string; change: ClubChange };

/** Where the simulated "server" keeps Shared clubs, and the changes still waiting to be sent. */
export interface SimulatedClubsState {
  /** Every Account on the "server", so an Account ID can be looked up. */
  loadAccounts(): Account[];
  /** The device's own Account (what `getAccount` returns) is always found too. */
  loadClubs(): Club[];
  saveClubs(clubs: Club[]): void;
  loadPendingOps(): ClubOp[];
  savePendingOps(ops: ClubOp[]): void;
  /** Calls `listener` when another tab changes the data. Returns a stop function. */
  observeExternalChanges?(listener: () => void): () => void;
}

export type SharedClubsApi = Pick<
  Backend,
  | "observeSharedClubs"
  | "createSharedClub"
  | "renameSharedClub"
  | "deleteSharedClub"
  | "addClubPlayer"
  | "updateClubPlayer"
  | "removeClubPlayer"
  | "lookupAccount"
  | "linkClubPlayer"
  | "setClubPlayerRole"
  | "unlinkClubPlayer"
  | "leaveClub"
>;

/**
 * Backends that share one "server" (two simulated devices in a test) tell each other about
 * changes through this, since they can't hear each other's `storage` events in one page.
 */
const serverListeners = new Set<() => void>();

/** Hears about changes any simulated device makes to the shared "server". */
export function listenToServer(listener: () => void): () => void {
  serverListeners.add(listener);
  return () => void serverListeners.delete(listener);
}

/** Tell every simulated device that the shared "server" changed. */
export function serverChanged(): void {
  for (const listener of [...serverListeners]) listener();
}

function applyOp(clubs: Club[], op: ClubOp): Club[] {
  switch (op.type) {
    case "create":
      return clubs.some((club) => club.id === op.club.id) ? clubs : [...clubs, op.club];
    case "delete":
      return clubs.filter((club) => club.id !== op.clubId);
    case "change":
      return clubs.map((club) => (club.id === op.clubId ? applyClubChange(club, op.change) : club));
  }
}

/**
 * Shared clubs without a server. Online, changes land on the "server" at once. Offline they wait
 * in a queue (like Firestore's write queue): the observer already shows them, and they reach the
 * "server" when the connection is back. The order of the queue means the latest change wins.
 */
export function createSimulatedClubs(
  state: SimulatedClubsState,
  getAccount: () => Account | null,
  online: OnlineSource,
): {
  clubs: SharedClubsApi;
  /** Tell observers the current Account changed, which changes which Clubs are mine. */
  refresh: () => void;
} {
  const listeners = new Set<(clubs: Club[]) => void>();

  /** What this device shows: the server's Clubs with the waiting changes on top, for my Account. */
  function view(): Club[] {
    const account = getAccount();
    if (!account) return [];
    const all = state.loadPendingOps().reduce(applyOp, state.loadClubs());
    return all.filter((club) => roleInClub(club, account.accountId) !== null);
  }

  function emit() {
    const clubs = view();
    for (const listener of [...listeners]) listener(clubs);
  }

  function flush() {
    const pending = state.loadPendingOps();
    if (pending.length === 0 || !online.get()) return;
    state.saveClubs(pending.reduce(applyOp, state.loadClubs()));
    state.savePendingOps([]);
  }

  function send(op: ClubOp) {
    if (online.get()) {
      flush();
      state.saveClubs(applyOp(state.loadClubs(), op));
    } else {
      state.savePendingOps([...state.loadPendingOps(), op]);
    }
    emit();
    serverChanged();
  }

  function findAccount(accountId: string): Account | null {
    const own = getAccount();
    if (own && accountIdsEqual(own.accountId, accountId)) return own;
    return state.loadAccounts().find((a) => accountIdsEqual(a.accountId, accountId)) ?? null;
  }

  function requireOnline() {
    if (!online.get()) throw new BackendError("offline");
  }

  function requireClub(clubId: string): Club {
    const club = view().find((candidate) => candidate.id === clubId);
    if (!club) throw new BackendError("not-found");
    return club;
  }

  function change(
    clubId: string,
    clubChange: ClubChange,
    options: { needsConnection?: boolean } = {},
  ): Promise<void> {
    try {
      if (options.needsConnection) requireOnline();
      const club = requireClub(clubId);
      const problem = clubChangeProblem(club, getAccount()?.accountId, clubChange);
      if (problem) throw new BackendError(problem);
      send({ type: "change", clubId, change: clubChange });
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  }

  online.subscribe((isOnline) => {
    if (!isOnline) return;
    flush();
    emit();
  });
  flush();

  const clubs: SharedClubsApi = {
    observeSharedClubs(listener) {
      listeners.add(listener);
      listener(view());
      const report = () => listener(view());
      const stopServer = listenToServer(report);
      const stopExternal = state.observeExternalChanges?.(report);
      return () => {
        listeners.delete(listener);
        stopServer();
        stopExternal?.();
      };
    },

    createSharedClub(input) {
      const account = getAccount();
      if (!account) return Promise.reject(new BackendError("no-account"));
      const name = normalizeName(input.name);
      if (name === "" || name.length > MAX_NAME_LENGTH) {
        return Promise.reject(new BackendError("invalid-name"));
      }
      const club: Club = {
        id: input.id,
        name,
        kind: "shared",
        players: [creatorPlayer(account, newId()), ...input.players],
      };
      send({ type: "create", club });
      return Promise.resolve(club);
    },

    renameSharedClub(clubId, name) {
      const trimmed = normalizeName(name);
      if (trimmed === "" || trimmed.length > MAX_NAME_LENGTH) {
        return Promise.reject(new BackendError("invalid-name"));
      }
      return change(clubId, { type: "rename", name: trimmed });
    },

    deleteSharedClub(clubId) {
      try {
        const club = requireClub(clubId);
        if (!canDeleteClub(club, getAccount()?.accountId)) throw new BackendError("forbidden");
        send({ type: "delete", clubId });
        return Promise.resolve();
      } catch (error) {
        return Promise.reject(error);
      }
    },

    addClubPlayer(clubId, player) {
      try {
        requireOnline();
        requireRowName(player.name);
        const row = withKnownAccount(player);
        return change(clubId, { type: "addPlayer", player: row }, { needsConnection: true });
      } catch (error) {
        return Promise.reject(error);
      }
    },

    updateClubPlayer(clubId, playerId, patch) {
      try {
        if (patch.name !== undefined) requireRowName(patch.name);
      } catch (error) {
        return Promise.reject(error);
      }
      return change(clubId, { type: "updatePlayer", playerId, patch });
    },

    removeClubPlayer(clubId, playerId) {
      return change(clubId, { type: "removePlayer", playerId });
    },

    lookupAccount(accountId) {
      try {
        requireOnline();
        return Promise.resolve(findAccount(accountId));
      } catch (error) {
        return Promise.reject(error);
      }
    },

    linkClubPlayer(clubId, playerId, accountId, role) {
      try {
        requireOnline();
        const account = findAccount(accountId);
        if (!account) throw new BackendError("unknown-account");
        return change(
          clubId,
          { type: "link", playerId, link: { accountId: account.accountId, role } },
          { needsConnection: true },
        );
      } catch (error) {
        return Promise.reject(error);
      }
    },

    setClubPlayerRole(clubId, playerId, role) {
      return change(clubId, { type: "setRole", playerId, role }, { needsConnection: true });
    },

    unlinkClubPlayer(clubId, playerId) {
      return change(clubId, { type: "unlink", playerId }, { needsConnection: true });
    },

    leaveClub(clubId) {
      try {
        requireOnline();
        const row = ownRow(requireClub(clubId), getAccount()?.accountId);
        if (!row) throw new BackendError("not-found");
        return change(clubId, { type: "unlink", playerId: row.id }, { needsConnection: true });
      } catch (error) {
        return Promise.reject(error);
      }
    },
  };

  /** A row with a link: the Account must exist, and the link uses its own spelling of the ID. */
  function withKnownAccount(player: ClubPlayer): ClubPlayer {
    if (!player.link) return player;
    const account = findAccount(player.link.accountId);
    if (!account) throw new BackendError("unknown-account");
    return { ...player, link: { ...player.link, accountId: account.accountId } };
  }

  return { clubs, refresh: emit };
}
