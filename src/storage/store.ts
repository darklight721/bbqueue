import { useSyncExternalStore } from "react";
import type { ActiveSessionsReport } from "../backend/backend.ts";
import { accountIdsEqual } from "../domain/accountId.ts";
import type { Account, ActiveSession, Club, EndedSession, Session } from "../domain/types.ts";
import {
  STORAGE_KEYS,
  clearAccount,
  clearSession,
  loadAccount,
  loadClubs,
  loadEndedSessions,
  loadInstallHintDismissed,
  loadSession,
  loadSharedClubs,
  loadSharedSessions,
  loadWelcomeDone,
  removeLegacySummary,
  saveAccount,
  saveClubs,
  saveEndedSession,
  saveInstallHintDismissed,
  saveSession,
  saveSharedClubs,
  saveSharedSessions,
  saveWelcomeDone,
} from "./storage.ts";
import { mergeActiveSessions } from "./sharedSessions.ts";

/** In-memory cache backed by storage.ts. `loaded` distinguishes "not read yet" from `null`. */
interface Slot<T> {
  loaded: boolean;
  value: T;
  listeners: Set<() => void>;
}

function createSlot<T>(initial: T): Slot<T> {
  return { loaded: false, value: initial, listeners: new Set() };
}

const localClubsSlot = createSlot<Club[]>([]);
const sharedClubsSlot = createSlot<Club[]>([]);
const sessionSlot = createSlot<Session | null>(null);
const sharedSessionsSlot = createSlot<ActiveSession[]>([]);
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

const subscribeLocalClubs = subscribeTo(localClubsSlot);
const subscribeSharedClubs = subscribeTo(sharedClubsSlot);
function subscribeClubs(listener: () => void) {
  const stopLocal = subscribeLocalClubs(listener);
  const stopShared = subscribeSharedClubs(listener);
  return () => {
    stopLocal();
    stopShared();
  };
}
const subscribeSession = subscribeTo(sessionSlot);
const subscribeSharedSessions = subscribeTo(sharedSessionsSlot);
function subscribeActiveSessions(listener: () => void) {
  const stopDevice = subscribeSession(listener);
  const stopShared = subscribeSharedSessions(listener);
  return () => {
    stopDevice();
    stopShared();
  };
}
const subscribeEndedSessions = subscribeTo(endedSessionsSlot);
const subscribeAccount = subscribeTo(accountSlot);
const subscribeWelcomeDone = subscribeTo(welcomeDoneSlot);
const subscribeInstallHintDismissed = subscribeTo(installHintDismissedSlot);

// Other tabs: drop the cache for the affected key and notify subscribers.
if (typeof window !== "undefined") {
  removeLegacySummary();
  window.addEventListener("storage", (event) => {
    const all = event.key === null; // localStorage.clear()
    if (all || event.key === STORAGE_KEYS.clubs) refresh(localClubsSlot);
    if (all || event.key === STORAGE_KEYS.sharedClubs) refresh(sharedClubsSlot);
    if (all || event.key === STORAGE_KEYS.session) refresh(sessionSlot);
    if (all || event.key === STORAGE_KEYS.sharedSessions) refresh(sharedSessionsSlot);
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

/** Local clubs: only on this device. */
export function getLocalClubs(): Club[] {
  return get(localClubsSlot, loadClubs);
}

export function setLocalClubs(clubs: Club[]): void {
  set(localClubsSlot, clubs, saveClubs);
}

/** Shared clubs as last received from the Backend (also cached on the device). */
export function getSharedClubs(): Club[] {
  return get(sharedClubsSlot, loadSharedClubs);
}

/**
 * Called when the Backend reports the Account's Shared clubs. Edits to a Shared club never
 * write here directly: they go out through the Backend, which reports back.
 */
export function setSharedClubs(clubs: Club[]): void {
  if (JSON.stringify(clubs) === JSON.stringify(getSharedClubs())) return;
  set(sharedClubsSlot, clubs, saveSharedClubs);
}

let merged: { local: Club[]; shared: Club[]; clubs: Club[] } | null = null;

/** Every Club the UI shows: the device's Local clubs plus the Account's Shared clubs. */
export function getClubs(): Club[] {
  const local = getLocalClubs();
  const shared = getSharedClubs();
  if (merged?.local !== local || merged.shared !== shared) {
    merged = { local, shared, clubs: [...local, ...shared] };
  }
  return merged.clubs;
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

// --- Active sessions of Shared clubs (ADR-0007) -------------------------------------------------
//
// Alongside the device's own single Session (Local club or no Club), the store holds one Active
// session per Shared club: what the server last reported, or, for a Club this Account hosts, the
// Session this device runs. Hosted copies are changed here first and uploaded afterwards.

/** Sessions this device ended itself: a late report must not bring them back. */
const endedHere = new Set<string>();

export function getSharedSessions(): ActiveSession[] {
  return get(sharedSessionsSlot, loadSharedSessions);
}

export function useSharedSessions(): ActiveSession[] {
  return useSyncExternalStore(subscribeSharedSessions, getSharedSessions);
}

/** Calls `listener` whenever the Shared clubs' Active sessions change (outside React). */
export function observeSharedSessions(listener: () => void): () => void {
  return subscribeSharedSessions(listener);
}

function setSharedSessions(sessions: ActiveSession[]): void {
  if (JSON.stringify(sessions) === JSON.stringify(getSharedSessions())) return;
  set(sharedSessionsSlot, sessions, saveSharedSessions);
}

/** Called when the Backend reports what the server has; see `mergeActiveSessions`. */
export function applyActiveSessionsReport(report: ActiveSessionsReport): void {
  for (const reported of report.sessions) publishedCopies.add(reported.session);
  const current = getSharedSessions();
  const merged = mergeActiveSessions({
    current,
    report,
    me: getAccount()?.accountId,
    ended: endedHere,
  });
  noteLostHosts(current, merged);
  setSharedSessions(merged);
}

/**
 * What the server says about one Club's Active session right now (`null`: none), used when an
 * upload was refused and the device must learn who the host is without waiting for the observer.
 */
export function applyActiveSessionOf(clubId: string, active: ActiveSession | null): void {
  const others = getSharedSessions().filter((entry) => entry.clubId !== clubId);
  const own = getSharedSessions().filter((entry) => entry.clubId === clubId);
  if (active) publishedCopies.add(active.session);
  const merged = mergeActiveSessions({
    current: own,
    report: { sessions: active ? [active] : [], unknown: [] },
    me: getAccount()?.accountId,
    ended: endedHere,
  });
  noteLostHosts(own, merged);
  setSharedSessions([...others, ...merged].sort((a, b) => a.clubId.localeCompare(b.clubId)));
}

// --- Losing the host role (ticket 07) -------------------------------------------------------------

const lostHostSlot = createSlot<Record<string, string>>({});
lostHostSlot.loaded = true;
const subscribeLostHost = subscribeTo(lostHostSlot);

/** Remembers, for this run of the app, Sessions this Account was the host of until somebody took over. */
function noteLostHosts(before: readonly ActiveSession[], after: readonly ActiveSession[]): void {
  const me = getAccount()?.accountId;
  if (!me) return;
  let next = lostHostSlot.value;
  for (const entry of before) {
    if (!accountIdsEqual(entry.hostAccountId, me)) continue;
    const now = after.find((candidate) => candidate.clubId === entry.clubId);
    if (now && !accountIdsEqual(now.hostAccountId, me)) {
      next = { ...next, [now.session.id]: now.hostName };
    }
  }
  if (next !== lostHostSlot.value) {
    lostHostSlot.value = next;
    notify(lostHostSlot);
  }
}

/** Who took over from this Account as the host of the Session, or null when nobody did (while the app ran). */
export function useTakenOverBy(sessionId: string): string | null {
  return useSyncExternalStore(subscribeLostHost, () => lostHostSlot.value[sessionId] ?? null);
}

/** Copies of a Session that the server is known to have: the host's uploader skips them. */
const publishedCopies = new WeakSet<Session>();

export function isPublishedCopy(session: Session): boolean {
  return publishedCopies.has(session);
}

/** This device now hosts the Active session of a Shared club (it just started it, so the server has it). */
export function addHostedSession(entry: ActiveSession): void {
  endedHere.delete(entry.session.id);
  publishedCopies.add(entry.session);
  setSharedSessions([...getSharedSessions().filter((s) => s.clubId !== entry.clubId), entry]);
}

/** The Session host changed the Session: keep it on this device; the uploader sends it on. */
export function setHostedSession(clubId: string, session: Session): void {
  setSharedSessions(getSharedSessions().map((s) => (s.clubId === clubId ? { ...s, session } : s)));
}

/** Drop a Shared club's Active session from the device (it ended, or is gone from the server). */
export function removeSharedSession(clubId: string, options: { endedHere?: boolean } = {}): void {
  const existing = getSharedSessions().find((s) => s.clubId === clubId);
  if (existing && options.endedHere) endedHere.add(existing.session.id);
  setSharedSessions(getSharedSessions().filter((s) => s.clubId !== clubId));
}

/** What the Session screen and Home work with: one Active session, wherever it lives. */
export interface ActiveSessionEntry {
  session: Session;
  /** The Shared club's record; null for the device's own Session (Local club or no Club). */
  shared: ActiveSession | null;
}

let mergedActive: {
  device: Session | null;
  shared: ActiveSession[];
  entries: ActiveSessionEntry[];
} | null = null;

/** Every Active session this device can show: its own Session, then one per Shared club. */
export function getActiveSessions(): ActiveSessionEntry[] {
  const device = getSession();
  const shared = getSharedSessions();
  if (mergedActive?.device !== device || mergedActive.shared !== shared) {
    mergedActive = {
      device,
      shared,
      entries: [
        ...(device ? [{ session: device, shared: null }] : []),
        ...shared.map((entry) => ({ session: entry.session, shared: entry })),
      ],
    };
  }
  return mergedActive.entries;
}

export function useActiveSessions(): ActiveSessionEntry[] {
  return useSyncExternalStore(subscribeActiveSessions, getActiveSessions);
}

/** The Active session with this Session id, or null. */
export function findActiveSession(sessionId: string): ActiveSessionEntry | null {
  return getActiveSessions().find((entry) => entry.session.id === sessionId) ?? null;
}

/** The Active session of a Club, wherever it lives, or null. */
export function activeSessionOfClub(
  entries: readonly ActiveSessionEntry[],
  clubId: string,
): ActiveSessionEntry | null {
  return entries.find((entry) => entry.session.clubId === clubId) ?? null;
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
    localClubsSlot,
    sharedClubsSlot,
    sessionSlot,
    sharedSessionsSlot,
    endedSessionsSlot,
    accountSlot,
    welcomeDoneSlot,
    installHintDismissedSlot,
  ]) {
    slot.loaded = false;
  }
  endedHere.clear();
  lostHostSlot.value = {};
}
