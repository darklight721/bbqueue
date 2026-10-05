import type { Account, ActiveSession, Club, SessionRequest } from "../domain/types.ts";
import type { Backend, OnlineSource, SimulatedBackendOptions } from "./backend.ts";
import type { ClubOp } from "./simulatedClubs.ts";
import { createSimulatedBackend } from "./simulatedBackend.ts";

/**
 * What the "server" holds. Give the same one to several in-memory backends to simulate several
 * devices (people) sharing a server.
 */
export interface InMemoryServer {
  reserved: string[];
  accounts: Account[];
  clubs: Club[];
  activeSessions: ActiveSession[];
  requests: SessionRequest[];
}

export function createInMemoryServer(): InMemoryServer {
  return { reserved: [], accounts: [], clubs: [], activeSessions: [], requests: [] };
}

export interface InMemoryBackend extends Backend {
  /** Test control: simulate losing or regaining the connection. */
  setOnline(online: boolean): void;
}

/** Backend that keeps everything in variables. For component tests and as the agreed contract. */
export function createInMemoryBackend(
  options: Omit<SimulatedBackendOptions, "online"> & {
    online?: boolean;
    server?: InMemoryServer;
  } = {},
): InMemoryBackend {
  const server = options.server ?? createInMemoryServer();
  let account: Account | null = null;
  let pendingOps: ClubOp[] = [];
  let pendingEnds: string[] = [];
  let isOnline = options.online ?? true;
  const onlineListeners = new Set<(online: boolean) => void>();

  const online: OnlineSource = {
    get: () => isOnline,
    subscribe(listener) {
      onlineListeners.add(listener);
      return () => {
        onlineListeners.delete(listener);
      };
    },
  };

  const backend = createSimulatedBackend(
    {
      loadAccount: () => account,
      saveAccount: (next) => {
        account = next;
      },
      loadReservedIds: () => server.reserved,
      saveReservedIds: (ids) => {
        server.reserved = ids;
      },
      loadAccounts: () => server.accounts,
      saveAccounts: (accounts) => {
        server.accounts = accounts;
      },
      loadClubs: () => server.clubs,
      saveClubs: (next) => {
        server.clubs = next;
      },
      loadActiveSessions: () => server.activeSessions,
      saveActiveSessions: (next) => {
        server.activeSessions = next;
      },
      loadRequests: () => server.requests,
      saveRequests: (next) => {
        server.requests = next;
      },
      loadPendingSessionEnds: () => pendingEnds,
      savePendingSessionEnds: (ids) => {
        pendingEnds = ids;
      },
      loadPendingOps: () => pendingOps,
      savePendingOps: (ops) => {
        pendingOps = ops;
      },
    },
    { ...options, online },
  );

  return {
    ...backend,
    setOnline(next) {
      isOnline = next;
      for (const listener of [...onlineListeners]) listener(next);
    },
  };
}
