import { generateAccountId, normalizeAccountId } from "../domain/accountId.ts";
import { normalizeName } from "../domain/validation.ts";
import type { Account } from "../domain/types.ts";
import {
  BackendError,
  MAX_ACCOUNT_ID_ATTEMPTS,
  browserOnline,
  type Backend,
  type OnlineSource,
  type SimulatedBackendOptions,
} from "./backend.ts";

/** Where a simulated backend keeps its "server" data. */
export interface SimulatedState {
  loadAccount(): Account | null;
  saveAccount(account: Account): void;
  /** Normalised Account IDs that are reserved. */
  loadReservedIds(): string[];
  saveReservedIds(ids: string[]): void;
  /** Calls `listener` when another tab changes the data. Returns a stop function. */
  observeExternalChanges?(listener: () => void): () => void;
}

/**
 * Backend behaviour without a server, over a pluggable state. The in-memory backend keeps the
 * state in variables, the local fake backend in localStorage. The contract tests hold both to
 * the same behaviour as the Firebase backend.
 */
export function createSimulatedBackend(
  state: SimulatedState,
  options: SimulatedBackendOptions = {},
): Backend {
  const random = options.random ?? Math.random;
  const online: OnlineSource = options.online ?? browserOnline;
  const listeners = new Set<(account: Account | null) => void>();

  if (options.takenAccountIds?.length) {
    const reserved = new Set(state.loadReservedIds());
    for (const id of options.takenAccountIds) reserved.add(normalizeAccountId(id));
    state.saveReservedIds([...reserved]);
  }

  function emit() {
    const account = state.loadAccount();
    for (const listener of [...listeners]) listener(account);
  }

  return {
    isOnline: () => online.get(),
    observeOnline: (listener) => online.subscribe(listener),

    getCurrentAccount: () => Promise.resolve(state.loadAccount()),

    observeCurrentAccount(listener) {
      listeners.add(listener);
      listener(state.loadAccount());
      const stopExternal = state.observeExternalChanges?.(() => listener(state.loadAccount()));
      return () => {
        listeners.delete(listener);
        stopExternal?.();
      };
    },

    createAccount(name) {
      const trimmed = normalizeName(name);
      if (trimmed === "") return Promise.reject(new BackendError("invalid-name"));
      if (!online.get()) return Promise.reject(new BackendError("offline"));
      if (state.loadAccount()) return Promise.reject(new BackendError("account-exists"));

      const reserved = new Set(state.loadReservedIds());
      for (let attempt = 0; attempt < MAX_ACCOUNT_ID_ATTEMPTS; attempt++) {
        const accountId = generateAccountId(trimmed, random);
        const key = normalizeAccountId(accountId);
        if (reserved.has(key)) continue;
        reserved.add(key);
        state.saveReservedIds([...reserved]);
        const account: Account = { accountId, name: trimmed };
        state.saveAccount(account);
        emit();
        return Promise.resolve(account);
      }
      return Promise.reject(new BackendError("id-unavailable"));
    },
  };
}
