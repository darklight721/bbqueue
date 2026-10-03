import { useSyncExternalStore } from "react";
import type { Account, Club, EndedSession, Session } from "../domain/types.ts";
import {
  STORAGE_KEYS,
  clearAccount,
  clearSession,
  loadAccount,
  loadClubs,
  loadEndedSessions,
  loadInstallHintDismissed,
  loadSession,
  loadWelcomeDone,
  removeLegacySummary,
  saveAccount,
  saveClubs,
  saveEndedSession,
  saveInstallHintDismissed,
  saveSession,
  saveWelcomeDone,
} from "./storage.ts";

/** In-memory cache backed by storage.ts. `loaded` distinguishes "not read yet" from `null`. */
interface Slot<T> {
  loaded: boolean;
  value: T;
  listeners: Set<() => void>;
}

function createSlot<T>(initial: T): Slot<T> {
  return { loaded: false, value: initial, listeners: new Set() };
}

const clubsSlot = createSlot<Club[]>([]);
const sessionSlot = createSlot<Session | null>(null);
const endedSessionsSlot = createSlot<EndedSession[]>([]);
const accountSlot = createSlot<Account | null>(null);
const welcomeDoneSlot = createSlot<boolean>(false);
const installHintDismissedSlot = createSlot<boolean>(false);

function get<T>(slot: Slot<T>, load: () => T): T {
  if (!slot.loaded) {
    slot.value = load();
    slot.loaded = true;
  }
  return slot.value;
}

function set<T>(slot: Slot<T>, value: T, persist: (value: T) => void): void {
  slot.value = value;
  slot.loaded = true;
  persist(value);
  notify(slot);
}

function notify(slot: Slot<unknown>): void {
  for (const listener of [...slot.listeners]) listener();
}

function subscribeTo(slot: Slot<unknown>) {
  return (listener: () => void) => {
    slot.listeners.add(listener);
    return () => {
      slot.listeners.delete(listener);
    };
  };
}

const subscribeClubs = subscribeTo(clubsSlot);
const subscribeSession = subscribeTo(sessionSlot);
const subscribeEndedSessions = subscribeTo(endedSessionsSlot);
const subscribeAccount = subscribeTo(accountSlot);
const subscribeWelcomeDone = subscribeTo(welcomeDoneSlot);
const subscribeInstallHintDismissed = subscribeTo(installHintDismissedSlot);

// Other tabs: drop the cache for the affected key and notify subscribers.
if (typeof window !== "undefined") {
  removeLegacySummary();
  window.addEventListener("storage", (event) => {
    const all = event.key === null; // localStorage.clear()
    if (all || event.key === STORAGE_KEYS.clubs) refresh(clubsSlot);
    if (all || event.key === STORAGE_KEYS.session) refresh(sessionSlot);
    if (all || event.key === STORAGE_KEYS.endedSessions) refresh(endedSessionsSlot);
    if (all || event.key === STORAGE_KEYS.account) refresh(accountSlot);
    if (all || event.key === STORAGE_KEYS.welcomeDone) refresh(welcomeDoneSlot);
    if (all || event.key === STORAGE_KEYS.installHintDismissed) refresh(installHintDismissedSlot);
  });
}

function refresh(slot: Slot<unknown>): void {
  slot.loaded = false;
  notify(slot);
}

export function getClubs(): Club[] {
  return get(clubsSlot, loadClubs);
}

export function setClubs(clubs: Club[]): void {
  set(clubsSlot, clubs, saveClubs);
}

export function useClubs(): Club[] {
  return useSyncExternalStore(subscribeClubs, getClubs);
}

export function getSession(): Session | null {
  return get(sessionSlot, loadSession);
}

export function setSession(session: Session | null): void {
  set(sessionSlot, session, (value) => (value === null ? clearSession() : saveSession(value)));
}

export function useSession(): Session | null {
  return useSyncExternalStore(subscribeSession, getSession);
}

/** Ended sessions, newest first by `endedAt`. */
export function getEndedSessions(): EndedSession[] {
  return get(endedSessionsSlot, loadEndedSessions);
}

/** Keeps `ended` first, at most 50 (ADR-0005); drops the oldest if storage is full. */
export function addEndedSession(ended: EndedSession): void {
  const kept = saveEndedSession(getEndedSessions(), ended);
  endedSessionsSlot.value = kept;
  endedSessionsSlot.loaded = true;
  notify(endedSessionsSlot);
}

export function useEndedSessions(): EndedSession[] {
  return useSyncExternalStore(subscribeEndedSessions, getEndedSessions);
}

/** The Account bound to this device, or null (no Account, or the Backend says there is none). */
export function getAccount(): Account | null {
  return get(accountSlot, loadAccount);
}

export function setAccount(account: Account | null): void {
  const current = getAccount();
  if (current?.accountId === account?.accountId && current?.name === account?.name) return;
  set(accountSlot, account, (value) => (value === null ? clearAccount() : saveAccount(value)));
}

export function useAccount(): Account | null {
  return useSyncExternalStore(subscribeAccount, getAccount);
}

/** Whether the person created an Account or skipped on the Welcome screen. Remembered on the device. */
export function getWelcomeDone(): boolean {
  return get(welcomeDoneSlot, loadWelcomeDone);
}

export function setWelcomeDone(): void {
  set(welcomeDoneSlot, true, saveWelcomeDone);
}

export function useWelcomeDone(): boolean {
  return useSyncExternalStore(subscribeWelcomeDone, getWelcomeDone);
}

/** Whether the "Add to Home Screen" hint was dismissed. Remembered on the device. */
export function getInstallHintDismissed(): boolean {
  return get(installHintDismissedSlot, loadInstallHintDismissed);
}

export function setInstallHintDismissed(): void {
  set(installHintDismissedSlot, true, saveInstallHintDismissed);
}

export function useInstallHintDismissed(): boolean {
  return useSyncExternalStore(subscribeInstallHintDismissed, getInstallHintDismissed);
}

/** Test helper: drop caches so the next read re-loads from localStorage. */
export function resetStoreForTests(): void {
  for (const slot of [
    clubsSlot,
    sessionSlot,
    endedSessionsSlot,
    accountSlot,
    welcomeDoneSlot,
    installHintDismissedSlot,
  ]) {
    slot.loaded = false;
  }
}
