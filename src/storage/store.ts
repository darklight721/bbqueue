import { useSyncExternalStore } from "react";
import type { ActiveSessionsReport } from "../backend/backend.ts";
import { accountIdsEqual } from "../domain/accountId.ts";
import type {
  Account,
  ActiveSession,
  Club,
  EndedSession,
  Session,
  SessionRequest,
} from "../domain/types.ts";
import {
  STORAGE_KEYS,
  clearAccount,
  clearSession,
  loadAccount,
  loadClubs,
  loadEndedHere,
  loadEndedSessions,
  loadInstallHintDismissed,
  loadSession,
  loadSharedClubs,
  loadSharedEndedSessions,
  loadSharedSessions,
  loadWelcomeDone,
  removeLegacySummary,
  saveAccount,
  saveClubs,
  saveEndedHere,
  saveEndedSession,
  saveInstallHintDismissed,
  saveSession,
  saveSharedClubs,
  saveSharedEndedSessions,
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
const sharedEndedSlot = createSlot<EndedSession[]>([]);
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
  const stopLocalClubs = subscribeLocalClubs(listener);
  return () => {
    stopDevice();
    stopShared();
    stopLocalClubs();
  };
}
const subscribeDeviceEnded = subscribeTo(endedSessionsSlot);
const subscribeSharedEnded = subscribeTo(sharedEndedSlot);
function subscribeEndedSessions(listener: () => void) {
  const stops = [
    subscribeDeviceEnded(listener),
    subscribeSharedEnded(listener),
    subscribeSharedClubs(listener),
  ];
  return () => {
    for (const stop of stops) stop();
  };
}
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
    if (all || event.key === STORAGE_KEYS.sharedEndedSessions) refresh(sharedEndedSlot);
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

/**
 * Every Club the UI shows: the device's Local clubs plus the Account's Shared clubs. While a Local
 * club is being made shared the server may already list it; the device's copy is the one that
 * shows until the conversion is confirmed, so a Club is never shown twice.
 */
export function getClubs(): Club[] {
  const local = getLocalClubs();
  const shared = getSharedClubs();
  if (merged?.local !== local || merged.shared !== shared) {
    const localIds = new Set(local.map((club) => club.id));
    merged = {
      local,
      shared,
      clubs: [...local, ...shared.filter((club) => !localIds.has(club.id))],
    };
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
  set(sessionSlot, session, (value) =>
    value === null ? clearSession() : saveSession(value, getAccount()?.accountId),
  );
}

export function useSession(): Session | null {
  return useSyncExternalStore(subscribeSession, getSession);
}

// --- Active sessions of Shared clubs (ADR-0007) -------------------------------------------------
//
// Alongside the device's own single Session (Local club or no Club), the store holds one Active
// session per Shared club: what the server last reported, or, for a Club this Account hosts, the
// Session this device runs. Hosted copies are changed here first and uploaded afterwards.

/**
 * Sessions this device ended itself (Session id → Club id): a late report must not bring them
 * back. Kept on the device, so it also holds after the app is closed while the delete is still on
 * its way; an id goes once the server reports its Session gone.
 */
const endedHere = new Map<string, string>(Object.entries(loadEndedHere()));

function persistEndedHere(): void {
  saveEndedHere(Object.fromEntries(endedHere));
}

/** Forgets the ended Sessions the server has now confirmed gone (none of the reported ones). */
function forgetConfirmedEnds(
  reported: readonly ActiveSession[],
  unknown: readonly string[],
  onlyClub?: string,
): void {
  let changed = false;
  for (const [sessionId, clubId] of endedHere) {
    if (onlyClub !== undefined && clubId !== onlyClub) continue;
    if (unknown.includes(clubId) || reported.some((entry) => entry.session.id === sessionId)) {
      continue;
    }
    endedHere.delete(sessionId);
    changed = true;
  }
  if (changed) persistEndedHere();
}

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

function setSharedSessions(sessions: ActiveSession[], options: { always?: boolean } = {}): void {
  if (!options.always && JSON.stringify(sessions) === JSON.stringify(getSharedSessions())) return;
  set(sharedSessionsSlot, sessions, (value) => saveSharedSessions(value, getAccount()?.accountId));
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
  forgetConfirmedEnds(report.sessions, report.unknown);
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
  forgetConfirmedEnds(active ? [active] : [], [], clubId);
}

/**
 * This device no longer has an Account (ticket 11): everything of Shared clubs goes, the Clubs, their
 * Active sessions, Ended sessions and requests. Local clubs, the device's own Session and its own
 * Ended sessions stay. A Session this Account was hosting stays in the device's own Session slot when
 * that is empty, so a night in progress isn't lost; another Organizer can take the Club's copy over.
 */
export function clearSharedData(
  accountId: string | null | undefined = getAccount()?.accountId,
): void {
  const me = accountId;
  const hosted = me
    ? getSharedSessions().find((entry) => accountIdsEqual(entry.hostAccountId, me))
    : undefined;
  if (hosted && getSession() === null) setSession(hosted.session);
  setSharedSessions([]);
  setSharedClubs([]);
  sharedEndedSlot.value = [];
  sharedEndedSlot.loaded = true;
  saveSharedEndedSessions([]);
  notify(sharedEndedSlot);
  endedHere.clear();
  persistEndedHere();
  requestsSlot.value = {};
  lostHostSlot.value = {};
  notify(requestsSlot);
  notify(lostHostSlot);
}

// --- Player requests (ticket 08) -----------------------------------------------------------------
//
// What the Backend reports about requests, per Shared club: this Account's own while watching,
// everybody's while hosting. Not kept on the device: Firestore's cache answers after a reload.

const requestsSlot = createSlot<Record<string, SessionRequest[]>>({});
requestsSlot.loaded = true;
const subscribeRequests = subscribeTo(requestsSlot);
const NO_REQUESTS: SessionRequest[] = [];

export function getRequests(clubId: string): SessionRequest[] {
  return requestsSlot.value[clubId] ?? NO_REQUESTS;
}

export function setRequests(clubId: string, requests: SessionRequest[]): void {
  if (JSON.stringify(requests) === JSON.stringify(getRequests(clubId))) return;
  requestsSlot.value = { ...requestsSlot.value, [clubId]: requests };
  notify(requestsSlot);
}

export function useRequests(clubId: string | null): SessionRequest[] {
  return useSyncExternalStore(subscribeRequests, () =>
    clubId ? getRequests(clubId) : NO_REQUESTS,
  );
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
  if (endedHere.delete(entry.session.id)) persistEndedHere();
  publishedCopies.add(entry.session);
  setSharedSessions([...getSharedSessions().filter((s) => s.clubId !== entry.clubId), entry]);
}

/** The Session host changed the Session: keep it on this device; the uploader sends it on. */
export function setHostedSession(clubId: string, session: Session): void {
  // Always replaced, even by an equal copy: a new copy is one the server isn't known to have.
  setSharedSessions(
    getSharedSessions().map((s) => (s.clubId === clubId ? { ...s, session } : s)),
    { always: true },
  );
}

/** Drop a Shared club's Active session from the device (it ended, or is gone from the server). */
export function removeSharedSession(clubId: string, options: { endedHere?: boolean } = {}): void {
  const existing = getSharedSessions().find((s) => s.clubId === clubId);
  if (existing && options.endedHere) {
    endedHere.set(existing.session.id, clubId);
    persistEndedHere();
  }
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
  local: Club[];
  entries: ActiveSessionEntry[];
} | null = null;

/**
 * Every Active session this device can show: its own Session, then one per Shared club. While a
 * Local club is being made shared the server already lists its Session: that copy is hidden, so
 * the Session is shown once, as the device's own (it is the same Session, or its Club is still
 * Local), until the conversion is confirmed and the device switches over.
 */
export function getActiveSessions(): ActiveSessionEntry[] {
  const device = getSession();
  const shared = getSharedSessions();
  const local = getLocalClubs();
  if (
    mergedActive?.device !== device ||
    mergedActive.shared !== shared ||
    mergedActive.local !== local
  ) {
    const localIds = new Set(local.map((club) => club.id));
    mergedActive = {
      device,
      shared,
      local,
      entries: [
        ...(device ? [{ session: device, shared: null }] : []),
        ...shared
          .filter((entry) => entry.session.id !== device?.id && !localIds.has(entry.clubId))
          .map((entry) => ({ session: entry.session, shared: entry })),
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

// --- Ended sessions ---------------------------------------------------------------------------------
//
// The device's own Ended sessions (no Club, a Local club, and the ones it hosted: ADR-0005, the 50
// most recent) and the Ended sessions of the Shared clubs the Account is on, as the server has
// them (ticket 09). Screens read one list: both, newest first, each Session once.

function getDeviceEndedSessions(): EndedSession[] {
  return get(endedSessionsSlot, loadEndedSessions);
}

export function getSharedEndedSessions(): EndedSession[] {
  return get(sharedEndedSlot, loadSharedEndedSessions);
}

/** How many Ended sessions of a Shared club the device keeps to look at (and the server lists). */
export const MAX_SHARED_ENDED_PER_CLUB = 50;

/**
 * Called when the Backend reports the Ended sessions of the Shared clubs this Account is on.
 * Ended sessions never change, so what the device already has is kept, the newest 50 per Club;
 * those of a Club this Account is no longer on are dropped.
 */
export function applyEndedSessionsReport(report: { sessions: EndedSession[]; clubIds: string[] }) {
  const clubIds = new Set(report.clubIds);
  // The ones this device hosted are on the device already (ADR-0005): not cached twice.
  const onDevice = new Set(getDeviceEndedSessions().map((ended) => ended.id));
  const byId = new Map<string, EndedSession>();
  for (const ended of getSharedEndedSessions()) {
    if (ended.clubId && clubIds.has(ended.clubId) && !onDevice.has(ended.id)) {
      byId.set(ended.id, ended);
    }
  }
  for (const ended of report.sessions) {
    if (ended.clubId && clubIds.has(ended.clubId) && !onDevice.has(ended.id)) {
      byId.set(ended.id, ended);
    }
  }
  const kept = newestPerClub([...byId.values()], MAX_SHARED_ENDED_PER_CLUB);
  const current = getSharedEndedSessions();
  if (kept.length === current.length && kept.every((ended, i) => ended.id === current[i]?.id))
    return;
  const saved = saveSharedEndedSessions(kept);
  sharedEndedSlot.value = saved;
  sharedEndedSlot.loaded = true;
  notify(sharedEndedSlot);
}

/** The `count` newest of each Club's Ended sessions, newest first. */
function newestPerClub(sessions: readonly EndedSession[], count: number): EndedSession[] {
  const perClub = new Map<string, number>();
  return [...sessions]
    .sort((a, b) => b.endedAt - a.endedAt)
    .filter((ended) => {
      const n = (perClub.get(ended.clubId ?? "") ?? 0) + 1;
      perClub.set(ended.clubId ?? "", n);
      return n <= count;
    });
}

let mergedEnded: {
  device: EndedSession[];
  shared: EndedSession[];
  clubs: Club[];
  list: EndedSession[];
} | null = null;

/** Every Ended session this device can show, newest first, each Session once. */
export function getEndedSessions(): EndedSession[] {
  const device = getDeviceEndedSessions();
  const shared = getSharedEndedSessions();
  const clubs = getSharedClubs();
  if (
    mergedEnded?.device !== device ||
    mergedEnded.shared !== shared ||
    mergedEnded.clubs !== clubs
  ) {
    const mine = new Set(clubs.map((club) => club.id));
    const known = new Set(device.map((ended) => ended.id));
    const list = [
      ...device,
      // A Shared club this Account has left isn't shown any more, even before the next report.
      ...shared.filter((ended) => !known.has(ended.id) && ended.clubId && mine.has(ended.clubId)),
    ].sort((a, b) => b.endedAt - a.endedAt);
    mergedEnded = { device, shared, clubs, list };
  }
  return mergedEnded.list;
}

/** Keeps `ended` first on the device, at most 50 (ADR-0005); drops the oldest if storage is full. */
export function addEndedSession(ended: EndedSession): void {
  const kept = saveEndedSession(getDeviceEndedSessions(), ended);
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
    sharedEndedSlot,
    accountSlot,
    welcomeDoneSlot,
    installHintDismissedSlot,
  ]) {
    slot.loaded = false;
  }
  endedHere.clear();
  for (const [sessionId, clubId] of Object.entries(loadEndedHere()))
    endedHere.set(sessionId, clubId);
  lostHostSlot.value = {};
  requestsSlot.value = {};
}
