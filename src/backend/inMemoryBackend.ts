import type { Account, Club } from "../domain/types.ts";
import type { Backend, OnlineSource, SimulatedBackendOptions } from "./backend.ts";
import type { ClubOp } from "./simulatedClubs.ts";
import { createSimulatedBackend } from "./simulatedBackend.ts";

export interface InMemoryBackend extends Backend {
  /** Test control: simulate losing or regaining the connection. */
  setOnline(online: boolean): void;
}

/** Backend that keeps everything in variables. For component tests and as the agreed contract. */
export function createInMemoryBackend(
  options: Omit<SimulatedBackendOptions, "online"> & { online?: boolean } = {},
): InMemoryBackend {
  let account: Account | null = null;
  let reserved: string[] = [];
  let clubs: Club[] = [];
  let pendingOps: ClubOp[] = [];
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
      loadReservedIds: () => reserved,
      saveReservedIds: (ids) => {
        reserved = ids;
      },
      loadClubs: () => clubs,
      saveClubs: (next) => {
        clubs = next;
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
