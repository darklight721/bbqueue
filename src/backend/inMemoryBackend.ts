import type { Account } from "../domain/types.ts";
import type { Backend, OnlineSource, SimulatedBackendOptions } from "./backend.ts";
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
