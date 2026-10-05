import { accountIdsEqual, generateAccountId, normalizeAccountId } from "../domain/accountId.ts";
import { MAX_NAME_LENGTH, normalizeName } from "../domain/validation.ts";
import type { Account, Club } from "../domain/types.ts";
import { applyClubChange } from "../domain/clubChanges.ts";
import { createSimulatedClubs, serverChanged, type SimulatedClubsState } from "./simulatedClubs.ts";
import { createSimulatedSessions, type SimulatedSessionsState } from "./simulatedSessions.ts";
import {
  BackendError,
  MAX_ACCOUNT_ID_ATTEMPTS,
  browserOnline,
  type Backend,
  type OnlineSource,
  type SimulatedBackendOptions,
} from "./backend.ts";

/** Where a simulated backend keeps its "server" data. */
export interface SimulatedState extends SimulatedClubsState, SimulatedSessionsState {
  loadAccount(): Account | null;
  saveAccount(account: Account): void;
  /** The device no longer has an Account (it was deleted). */
  clearAccount(): void;
  /** Normalised Account IDs that are reserved. */
  loadReservedIds(): string[];
  saveReservedIds(ids: string[]): void;
  saveAccounts(accounts: Account[]): void;
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
  /** Record an Account on the "server", so others can look its Account ID up. */
  function register(account: Account) {
    const others = state
      .loadAccounts()
      .filter((a) => !accountIdsEqual(a.accountId, account.accountId));
    state.saveAccounts([...others, account]);
  }

  if (options.account && !state.loadAccount()) {
    const reserved = new Set(state.loadReservedIds());
    reserved.add(normalizeAccountId(options.account.accountId));
    state.saveReservedIds([...reserved]);
    state.saveAccount(options.account);
    register(options.account);
  }

  function emit() {
    const account = state.loadAccount();
    for (const listener of [...listeners]) listener(account);
  }

  const { clubs, refresh: refreshClubs } = createSimulatedClubs(
    state,
    () => state.loadAccount(),
    online,
  );

  const sessions = createSimulatedSessions(state, () => state.loadAccount(), online);

  return {
    ...clubs,
    ...sessions,
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
      if (trimmed === "" || trimmed.length > MAX_NAME_LENGTH)
        return Promise.reject(new BackendError("invalid-name"));
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
        register(account);
        emit();
        refreshClubs();
        return Promise.resolve(account);
      }
      return Promise.reject(new BackendError("id-unavailable"));
    },

    deleteAccount({ deleteClubIds, unlinkClubIds }) {
      try {
        if (!online.get()) throw new BackendError("offline");
        const account = state.loadAccount();
        if (!account) throw new BackendError("no-account");
        const clubs = state.loadClubs();
        const mine = (club: Club) =>
          club.players.find(
            (row) => row.link && accountIdsEqual(row.link.accountId, account.accountId),
          );
        // Check everything first, so a refusal changes nothing.
        for (const id of unlinkClubIds) {
          const club = clubs.find((candidate) => candidate.id === id);
          const row = club && mine(club);
          if (!club || !row?.link) continue;
          if (
            row.link.role === "organizer" &&
            !club.players.some((other) => other.id !== row.id && other.link?.role === "organizer")
          ) {
            throw new BackendError("last-organizer");
          }
        }
        for (const id of deleteClubIds) {
          const club = clubs.find((candidate) => candidate.id === id);
          if (
            club?.players.some(
              (row) => row.link && !accountIdsEqual(row.link.accountId, account.accountId),
            )
          ) {
            throw new BackendError("forbidden");
          }
        }

        state.saveClubs(
          clubs
            .filter((club) => !deleteClubIds.includes(club.id))
            .map((club) => {
              const row = unlinkClubIds.includes(club.id) ? mine(club) : undefined;
              return row ? applyClubChange(club, { type: "unlink", playerId: row.id }) : club;
            }),
        );
        state.saveEndedSessions(
          state.loadEndedSessions().filter((ended) => !deleteClubIds.includes(ended.clubId ?? "")),
        );
        state.saveActiveSessions(
          state.loadActiveSessions().filter((s) => !deleteClubIds.includes(s.clubId)),
        );
        state.saveRequests(state.loadRequests().filter((r) => !deleteClubIds.includes(r.clubId)));
        // The Account goes; its Account ID stays reserved for good.
        state.saveAccounts(
          state.loadAccounts().filter((a) => !accountIdsEqual(a.accountId, account.accountId)),
        );
        state.clearAccount();
        emit();
        refreshClubs();
        serverChanged();
        return Promise.resolve();
      } catch (error) {
        return Promise.reject(error);
      }
    },

    renameAccount(name) {
      const trimmed = normalizeName(name);
      if (trimmed === "" || trimmed.length > MAX_NAME_LENGTH)
        return Promise.reject(new BackendError("invalid-name"));
      if (!online.get()) return Promise.reject(new BackendError("offline"));
      const current = state.loadAccount();
      if (!current) return Promise.reject(new BackendError("no-account"));

      const account: Account = { ...current, name: trimmed };
      state.saveAccount(account);
      register(account);
      emit();
      return Promise.resolve(account);
    },
  };
}
