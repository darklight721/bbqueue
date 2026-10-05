import { accountIdsEqual } from "../domain/accountId.ts";
import { roleInClub } from "../domain/clubChanges.ts";
import { newId } from "../domain/ids.ts";
import type { Account, ActiveSession, EndedSession, SessionRequest } from "../domain/types.ts";
import { BackendError, type Backend, type OnlineSource } from "./backend.ts";
import { listenToServer, serverChanged, type SimulatedClubsState } from "./simulatedClubs.ts";

/** Where the simulated "server" keeps Active sessions, and the ends still waiting for the connection. */
export interface SimulatedSessionsState extends Pick<
  SimulatedClubsState,
  "loadClubs" | "saveClubs" | "observeExternalChanges"
> {
  /** One record per Shared club that has an Active session. */
  loadActiveSessions(): ActiveSession[];
  saveActiveSessions(sessions: ActiveSession[]): void;
  /** Player requests on the "server", oldest first, across all Clubs. */
  loadRequests(): SessionRequest[];
  saveRequests(requests: SessionRequest[]): void;
  /** Ended sessions of Shared clubs on the "server". */
  loadEndedSessions(): EndedSession[];
  saveEndedSessions(sessions: EndedSession[]): void;
  /** Ends this device made while offline (the delete, and the Ended session to publish) still queued. */
  loadPendingSessionEnds(): SimulatedPendingEnd[];
  savePendingSessionEnds(ends: SimulatedPendingEnd[]): void;
}

/** A Shared club's Session this device ended while offline, waiting for the connection. */
export interface SimulatedPendingEnd {
  clubId: string;
  ended: EndedSession | null;
}

/** How many Ended sessions of a Club the "server" lists (the 50 most recent, as Firestore does). */
const LISTED_ENDED = 50;

export type ActiveSessionsApi = Pick<
  Backend,
  | "observeActiveSessions"
  | "startSharedSession"
  | "publishActiveSession"
  | "endSharedSession"
  | "takeOverSession"
  | "getActiveSession"
  | "requestSessionChange"
  | "observeSessionRequests"
  | "resolveSessionRequests"
  | "observeEndedSessions"
  | "makeSharedClub"
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
    for (const end of pending) {
      const current = record(end.clubId);
      // Only the host's end goes through (somebody may have taken over while this device was away).
      if (!current || !mine(account?.accountId, current)) continue;
      removeRecord(end.clubId);
      if (end.ended) publish(end.ended);
    }
    state.savePendingSessionEnds([]);
    serverChanged();
  }

  function removeRecord(clubId: string) {
    state.saveActiveSessions(state.loadActiveSessions().filter((s) => s.clubId !== clubId));
    state.saveRequests(state.loadRequests().filter((r) => r.clubId !== clubId));
  }

  /** The Ended session is created once and never changes (the rules refuse updates). */
  function publish(ended: EndedSession) {
    const all = state.loadEndedSessions();
    if (all.some((existing) => existing.id === ended.id)) return;
    state.saveEndedSessions([...all, ended]);
  }

  /** The Active sessions this device shows: the Clubs I'm on, minus the ends still waiting. */
  function view(): ActiveSession[] {
    const account = getAccount();
    if (!account) return [];
    const clubs = state.loadClubs();
    const pending = state.loadPendingSessionEnds().map((end) => end.clubId);
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

    requestSessionChange(clubId, input) {
      try {
        if (!online.get()) throw new BackendError("offline");
        const account = getAccount();
        if (!account) throw new BackendError("no-account");
        const club = state.loadClubs().find((candidate) => candidate.id === clubId);
        if (!club || roleInClub(club, account.accountId) === null) {
          throw new BackendError("forbidden");
        }
        if (!record(clubId)) throw new BackendError("not-found");
        const existing = state.loadRequests();
        const request: SessionRequest = {
          id: newId(),
          clubId,
          sessionId: input.sessionId,
          sessionPlayerId: input.sessionPlayerId,
          accountId: account.accountId,
          kind: input.kind,
          status: "pending",
          // Strictly increasing, so two quick requests keep their order.
          createdAt: Math.max(Date.now(), (existing.at(-1)?.createdAt ?? 0) + 1),
        };
        state.saveRequests([...existing, request]);
        serverChanged();
        return Promise.resolve(request);
      } catch (error) {
        return Promise.reject(error);
      }
    },

    observeSessionRequests(clubId, scope, listener) {
      const report = () => {
        const account = getAccount();
        const active = view().find((s) => s.clubId === clubId);
        const visible = state.loadRequests().filter((r) => {
          if (r.clubId !== clubId || !account) return false;
          if (scope === "own") return accountIdsEqual(r.accountId, account.accountId);
          // Everybody's requests are the Session host's to see.
          return !!active && mine(account.accountId, active);
        });
        listener(visible);
      };
      report();
      const stopServer = listenToServer(report);
      const stopExternal = state.observeExternalChanges?.(report);
      return () => {
        stopServer();
        stopExternal?.();
      };
    },

    resolveSessionRequests(clubId, results) {
      try {
        if (!online.get()) throw new BackendError("offline");
        const account = getAccount();
        const current = record(clubId);
        if (!account || !current || !mine(account.accountId, current)) {
          throw new BackendError("forbidden");
        }
        const byId = new Map(results.map((result) => [result.id, result.status]));
        state.saveRequests(
          state
            .loadRequests()
            .map((r) =>
              r.clubId === clubId && r.status === "pending" && byId.has(r.id)
                ? { ...r, status: byId.get(r.id)! }
                : r,
            ),
        );
        serverChanged();
        return Promise.resolve();
      } catch (error) {
        return Promise.reject(error);
      }
    },

    makeSharedClub({ club, endedSessions, activeSession }) {
      try {
        if (!online.get()) throw new BackendError("offline");
        const account = getAccount();
        if (!account) throw new BackendError("no-account");
        const linked = club.players.filter((row) => row.link);
        const meRow = linked[0];
        if (
          club.kind !== "shared" ||
          linked.length !== 1 ||
          !meRow?.link ||
          meRow.link.role !== "organizer" ||
          !accountIdsEqual(meRow.link.accountId, account.accountId) ||
          endedSessions.some((ended) => ended.clubId !== club.id) ||
          (activeSession && activeSession.clubId !== club.id)
        ) {
          throw new BackendError("failed");
        }
        const clubs = state.loadClubs();
        const there = clubs.find((candidate) => candidate.id === club.id);
        // A Club somebody else has taken the id of; or a part of this one from an earlier try.
        if (there && !there.players.every((row) => !row.link || row.id === meRow.id)) {
          throw new BackendError("forbidden");
        }
        const record = state.loadActiveSessions().find((s) => s.clubId === club.id);
        if (activeSession && record && !mine(account.accountId, record)) {
          throw new BackendError("session-exists");
        }

        state.saveClubs([...clubs.filter((candidate) => candidate.id !== club.id), club]);
        const known = new Set(state.loadEndedSessions().map((ended) => ended.id));
        state.saveEndedSessions([
          ...state.loadEndedSessions(),
          ...endedSessions.filter((ended) => !known.has(ended.id)),
        ]);
        let active: ActiveSession | null = null;
        if (activeSession) {
          active = {
            clubId: club.id,
            session: activeSession,
            hostAccountId: account.accountId,
            hostName: account.name,
            updatedAt: Date.now(),
          };
          state.saveActiveSessions([
            ...state.loadActiveSessions().filter((s) => s.clubId !== club.id),
            active,
          ]);
        }
        serverChanged();
        return Promise.resolve({ club, active });
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

    endSharedSession(clubId, ended = null) {
      try {
        const account = getAccount();
        if (!account) throw new BackendError("no-account");
        const current = record(clubId);
        if (!current) return Promise.resolve();
        if (!mine(account.accountId, current)) throw new BackendError("forbidden");
        if (online.get()) {
          removeRecord(clubId);
          if (ended) publish(ended);
        } else {
          state.savePendingSessionEnds([
            ...state.loadPendingSessionEnds().filter((end) => end.clubId !== clubId),
            { clubId, ended },
          ]);
        }
        serverChanged();
        return Promise.resolve();
      } catch (error) {
        return Promise.reject(error);
      }
    },

    observeEndedSessions(listener) {
      const report = () => {
        const account = getAccount();
        if (!account) {
          listener({ sessions: [], clubIds: [] });
          return;
        }
        const clubIds = state
          .loadClubs()
          .filter((club) => roleInClub(club, account.accountId) !== null)
          .map((club) => club.id);
        const perClub = new Map<string, number>();
        const sessions = state
          .loadEndedSessions()
          .filter((ended) => ended.clubId !== null && clubIds.includes(ended.clubId))
          .sort((a, b) => b.endedAt - a.endedAt)
          .filter((ended) => {
            const count = (perClub.get(ended.clubId!) ?? 0) + 1;
            perClub.set(ended.clubId!, count);
            return count <= LISTED_ENDED;
          });
        listener({ sessions, clubIds });
      };
      report();
      const stopServer = listenToServer(report);
      const stopExternal = state.observeExternalChanges?.(report);
      return () => {
        stopServer();
        stopExternal?.();
      };
    },
  };
}
