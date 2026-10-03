import {
  applyClubChange,
  creatorPlayer,
  roleInClub,
  type ClubChange,
} from "../domain/clubChanges.ts";
import { newId } from "../domain/ids.ts";
import type { Account, Club } from "../domain/types.ts";
import { normalizeName } from "../domain/validation.ts";
import { BackendError, type Backend, type OnlineSource } from "./backend.ts";

/** A Shared club change that is waiting for the connection. */
export type ClubOp =
  | { type: "create"; club: Club }
  | { type: "delete"; clubId: string }
  | { type: "change"; clubId: string; change: ClubChange };

/** Where the simulated "server" keeps Shared clubs, and the changes still waiting to be sent. */
export interface SimulatedClubsState {
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
>;

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
  }

  function requireClub(clubId: string): Club {
    const club = view().find((candidate) => candidate.id === clubId);
    if (!club) throw new BackendError("not-found");
    return club;
  }

  function change(clubId: string, clubChange: ClubChange): Promise<void> {
    try {
      requireClub(clubId);
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
      const stopExternal = state.observeExternalChanges?.(() => listener(view()));
      return () => {
        listeners.delete(listener);
        stopExternal?.();
      };
    },

    createSharedClub(input) {
      const account = getAccount();
      if (!account) return Promise.reject(new BackendError("no-account"));
      const name = normalizeName(input.name);
      if (name === "") return Promise.reject(new BackendError("invalid-name"));
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
      if (trimmed === "") return Promise.reject(new BackendError("invalid-name"));
      return change(clubId, { type: "rename", name: trimmed });
    },

    deleteSharedClub(clubId) {
      try {
        requireClub(clubId);
        send({ type: "delete", clubId });
        return Promise.resolve();
      } catch (error) {
        return Promise.reject(error);
      }
    },

    addClubPlayer(clubId, player) {
      if (!online.get()) return Promise.reject(new BackendError("offline"));
      return change(clubId, { type: "addPlayer", player });
    },

    updateClubPlayer(clubId, playerId, patch) {
      return change(clubId, { type: "updatePlayer", playerId, patch });
    },

    removeClubPlayer(clubId, playerId) {
      return change(clubId, { type: "removePlayer", playerId });
    },
  };

  return { clubs, refresh: emit };
}
