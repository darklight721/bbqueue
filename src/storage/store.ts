import { useSyncExternalStore } from "react";
import type { Club, Session, SessionSummary } from "../domain/types.ts";
import {
  STORAGE_KEYS,
  clearSession,
  clearSummary,
  loadClubs,
  loadSession,
  loadSummary,
  saveClubs,
  saveSession,
  saveSummary,
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
const summarySlot = createSlot<SessionSummary | null>(null);

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
const subscribeSummary = subscribeTo(summarySlot);

// Other tabs: drop the cache for the affected key and notify subscribers.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    const all = event.key === null; // localStorage.clear()
    if (all || event.key === STORAGE_KEYS.clubs) refresh(clubsSlot);
    if (all || event.key === STORAGE_KEYS.session) refresh(sessionSlot);
    if (all || event.key === STORAGE_KEYS.summary) refresh(summarySlot);
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

export function getSummary(): SessionSummary | null {
  return get(summarySlot, loadSummary);
}

export function setSummary(summary: SessionSummary | null): void {
  set(summarySlot, summary, (value) => (value === null ? clearSummary() : saveSummary(value)));
}

export function useSummary(): SessionSummary | null {
  return useSyncExternalStore(subscribeSummary, getSummary);
}

/** Test helper: drop caches so the next read re-loads from localStorage. */
export function resetStoreForTests(): void {
  for (const slot of [clubsSlot, sessionSlot, summarySlot]) {
    slot.loaded = false;
  }
}
