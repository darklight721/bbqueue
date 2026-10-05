import { accountIdsEqual } from "../domain/accountId.ts";
import { roleInClub } from "../domain/clubChanges.ts";
import type { Account, ActiveSession } from "../domain/types.ts";
import { BackendError, type Backend, type OnlineSource } from "./backend.ts";
import { listenToServer, serverChanged, type SimulatedClubsState } from "./simulatedClubs.ts";

/** Where the simulated "server" keeps Active sessions, and the ends still waiting for the connection. */
export interface SimulatedSessionsState extends Pick<
  SimulatedClubsState,
  "loadClubs" | "observeExternalChanges"
> {
  /** One record per Shared club that has an Active session. */
  loadActiveSessions(): ActiveSession[];
  saveActiveSessions(sessions: ActiveSession[]): void;
  /** Clubs whose Active session this device ended while offline; the delete is still queued. */
  loadPendingSessionEnds(): string[];
  savePendingSessionEnds(clubIds: string[]): void;
}

export type ActiveSessionsApi = Pick<
  Backend,
  | "observeActiveSessions"
  | "startSharedSession"
  | "publishActiveSession"
  | "endSharedSession"
  | "takeOverSession"
  | "getActiveSession"
>;

/**
 * Active sessions without a server, following the same rules as `firestore.rules`: an Organizer
 * starts one when the Club has none, only the Session host publishes to it or ends it, and
 * anyone on the Club reads it. Ending offline waits in a queue (like Firestore's write queue):
 * this device already sees the session gone, and the "server" does once the connection is back.
 */
export function createSimulatedSessions(
  state: SimulatedSessionsState,
  getAccount: () => Account | null,
  online: OnlineSource,
): ActiveSessionsApi {
  const mine = (accountId: string | null | undefined, session: ActiveSession) =>
    !!accountId && accountIdsEqual(session.hostAccountId, accountId);

  function flush() {
    const pending = state.loadPendingSessionEnds();
    if (pending.length === 0 || !online.get()) return;
    const account = getAccount();
    state.saveActiveSessions(
      state
        .loadActiveSessions()
        .filter((s) => !(pending.includes(s.clubId) && mine(account?.accountId, s))),
    );
    state.savePendingSessionEnds([]);
    serverChanged();
  }

  /** The Active sessions this device shows: the Clubs I'm on, minus the ends still waiting. */
  function view(): ActiveSession[] {
    const account = getAccount();
    if (!account) return [];
    const clubs = state.loadClubs();
    const pending = state.loadPendingSessionEnds();
    return state
      .loadActiveSessions()
      .filter(
        (s) =>
          !pending.includes(s.clubId) &&
          clubs.some(
            (club) => club.id === s.clubId && roleInClub(club, account.accountId) !== null,
          ),
      );
  }

  /** The session record of a Club on the "server" (host rules apply to it, not just the view). */
  const record = (clubId: string) => state.loadActiveSessions().find((s) => s.clubId === clubId);

  online.subscribe((isOnline) => {
    if (isOnline) flush();
  });
  flush();

  return {
    observeActiveSessions(listener) {
      const report = () => listener({ sessions: view(), unknown: [] });
      report();
      const stopServer = listenToServer(report);
      const stopExternal = state.observeExternalChanges?.(report);
      const stopOnline = online.subscribe(() => report());
      return () => {
        stopServer();
        stopExternal?.();
        stopOnline();
      };
    },

    startSharedSession(clubId, session) {
      try {
        if (!online.get()) throw new BackendError("offline");
        const account = getAccount();
        if (!account) throw new BackendError("no-account");
        const club = state.loadClubs().find((candidate) => candidate.id === clubId);
        const role = club ? roleInClub(club, account.accountId) : null;
        if (!club || role === null) throw new BackendError("not-found");
        if (role !== "organizer") throw new BackendError("forbidden");
        if (record(clubId)) throw new BackendError("session-exists");
        const active: ActiveSession = {
          clubId,
          session,
          hostAccountId: account.accountId,
          hostName: account.name,
          updatedAt: Date.now(),
        };
        state.saveActiveSessions([...state.loadActiveSessions(), active]);
        serverChanged();
        return Promise.resolve(active);
      } catch (error) {
        return Promise.reject(error);
      }
    },

    publishActiveSession(clubId, session) {
      try {
        if (!online.get()) throw new BackendError("offline");
        const account = getAccount();
        if (!account) throw new BackendError("no-account");
        const current = view().find((s) => s.clubId === clubId);
        if (!current) throw new BackendError("not-found");
        if (!mine(account.accountId, current)) throw new BackendError("forbidden");
        state.saveActiveSessions(
          state
            .loadActiveSessions()
            .map((s) => (s.clubId === clubId ? { ...s, session, updatedAt: Date.now() } : s)),
        );
        serverChanged();
        return Promise.resolve();
      } catch (error) {
        return Promise.reject(error);
      }
    },

    takeOverSession(clubId) {
      try {
        if (!online.get()) throw new BackendError("offline");
        const account = getAccount();
        if (!account) throw new BackendError("no-account");
        const club = state.loadClubs().find((candidate) => candidate.id === clubId);
        const role = club ? roleInClub(club, account.accountId) : null;
        if (!club || role === null) throw new BackendError("not-found");
        if (role !== "organizer") throw new BackendError("forbidden");
        const current = record(clubId);
        if (!current) throw new BackendError("not-found");
        if (mine(account.accountId, current)) return Promise.resolve(current);
        const taken: ActiveSession = {
          ...current,
          hostAccountId: account.accountId,
          hostName: account.name,
          updatedAt: Date.now(),
        };
        state.saveActiveSessions(
          state.loadActiveSessions().map((s) => (s.clubId === clubId ? taken : s)),
        );
        serverChanged();
        return Promise.resolve(taken);
      } catch (error) {
        return Promise.reject(error);
      }
    },

    getActiveSession(clubId) {
      try {
        if (!online.get()) throw new BackendError("offline");
        return Promise.resolve(view().find((s) => s.clubId === clubId) ?? null);
      } catch (error) {
        return Promise.reject(error);
      }
    },

    endSharedSession(clubId) {
      try {
        const account = getAccount();
        if (!account) throw new BackendError("no-account");
        const current = record(clubId);
        if (!current) return Promise.resolve();
        if (!mine(account.accountId, current)) throw new BackendError("forbidden");
        if (online.get()) {
          state.saveActiveSessions(state.loadActiveSessions().filter((s) => s.clubId !== clubId));
        } else {
          state.savePendingSessionEnds([...new Set([...state.loadPendingSessionEnds(), clubId])]);
        }
        serverChanged();
        return Promise.resolve();
      } catch (error) {
        return Promise.reject(error);
      }
    },
  };
}
