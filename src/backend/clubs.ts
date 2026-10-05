import { useSyncExternalStore } from "react";
import { diffClub, inSafeOrder } from "../domain/clubChanges.ts";
import type { DeletionPlan } from "../domain/accountDeletion.ts";
import { makeSharedClub, sessionForSharing, type ShareChoice } from "../domain/makeShared.ts";
import { newId } from "../domain/ids.ts";
import type { Club } from "../domain/types.ts";
import {
  addHostedSession,
  clearSharedData,
  getAccount,
  getEndedSessions,
  getLocalClubs,
  getSession,
  getSharedClubs,
  removeSharedSession,
  setAccount,
  setHostedSession,
  setLocalClubs,
  setSession,
  setSharedClubs,
} from "../storage/store.ts";
import { BackendError } from "./backend.ts";
import { getBackend } from "./index.ts";

/** Whether Clubs created now are Shared clubs: there is a Backend and an Account. */
export function createsSharedClubs(): boolean {
  return getBackend() !== null && getAccount() !== null;
}

/** Save a new Club: a Shared club while signed in, a Local club otherwise. Rejects with a BackendError. */
export async function createClub(club: Club): Promise<void> {
  const backend = getBackend();
  if (backend && getAccount()) {
    await backend.createSharedClub({ id: club.id, name: club.name, players: club.players });
    return;
  }
  setLocalClubs([...getLocalClubs(), { ...club, kind: "local", players: club.players }]);
}

/**
 * Save an edited Club. Local clubs go to the device. A Shared club's changes go out through the
 * Backend one record at a time (name, one Club player row, one link), and come back through the
 * store. Stops at the first change the server or the rules refuse and rejects with that
 * BackendError, so the caller can say what went wrong; offline, changes that can wait are queued.
 */
export async function saveClub(before: Club, after: Club): Promise<void> {
  if (before.kind === "local") {
    setLocalClubs(
      getLocalClubs().map((existing) =>
        existing.id === after.id ? { ...after, kind: "local" } : existing,
      ),
    );
    return;
  }
  const backend = getBackend();
  if (!backend) return;
  for (const change of inSafeOrder(diffClub(before, after))) {
    switch (change.type) {
      case "rename":
        await backend.renameSharedClub(before.id, change.name);
        break;
      case "addPlayer":
        await backend.addClubPlayer(before.id, change.player);
        break;
      case "updatePlayer":
        await backend.updateClubPlayer(before.id, change.playerId, change.patch);
        break;
      case "removePlayer":
        await backend.removeClubPlayer(before.id, change.playerId);
        break;
      case "link":
        await backend.linkClubPlayer(
          before.id,
          change.playerId,
          change.link.accountId,
          change.link.role,
        );
        break;
      case "setRole":
        await backend.setClubPlayerRole(before.id, change.playerId, change.role);
        break;
      case "unlink":
        await backend.unlinkClubPlayer(before.id, change.playerId);
        break;
    }
  }
}

/** Save every Club in `after` that differs from its version in `before`. */
export async function saveClubs(before: readonly Club[], after: readonly Club[]): Promise<void> {
  for (const club of after) {
    const old = before.find((candidate) => candidate.id === club.id);
    if (old && old !== club) await saveClub(old, club);
  }
}

export async function deleteClub(club: Club): Promise<void> {
  if (club.kind === "local") {
    setLocalClubs(getLocalClubs().filter((existing) => existing.id !== club.id));
    return;
  }
  await getBackend()?.deleteSharedClub(club.id);
}

/** The current Account leaves a Shared club. Rejects with a BackendError (`last-organizer`, `offline`, …). */
export async function leaveClub(club: Club): Promise<void> {
  await getBackend()?.leaveClub(club.id);
}

/** Whether the device can reach the server; null when there is no Backend. */
export function useBackendOnline(): boolean | null {
  const backend = getBackend();
  return useSyncExternalStore(
    (listener) => (backend ? backend.observeOnline(listener) : () => {}),
    () => (backend ? backend.isOnline() : null),
  );
}

/**
 * Make a Local club a Shared club (ticket 10): the Club, its rows, its Ended sessions and the
 * device's Active session when that is this Club's (this Account becomes its Session host) go to
 * the server. Only once the server has confirmed does the device switch over: the Local club goes,
 * the Shared one takes its place, and the device's own Session slot is emptied. Whatever fails
 * leaves the Local club exactly as it was. Needs a connection. Rejects with a BackendError.
 */
export async function makeClubShared(club: Club, choice: ShareChoice): Promise<void> {
  const backend = getBackend();
  const account = getAccount();
  if (!backend) throw new BackendError("failed");
  if (!account) throw new BackendError("no-account");
  if (!backend.isOnline()) throw new BackendError("offline");

  const plan = makeSharedClub(club, choice, account, newId);
  if (!plan.ok) throw new BackendError("failed");

  // The Ended sessions this device kept for the Club, and the Session it is running for it.
  const ended = getEndedSessions().filter((candidate) => candidate.clubId === club.id);
  const running = getSession();
  const session =
    running && running.clubId === club.id
      ? sessionForSharing(running, plan.meRowId, account.accountId)
      : null;

  let result;
  try {
    result = await backend.makeSharedClub({
      club: plan.club,
      endedSessions: ended,
      activeSession: session,
    });
  } catch (error) {
    // Don't leave a half-made Club behind on the server (when the connection is gone, the next
    // try carries on from it instead).
    if (!(error instanceof BackendError && error.code === "offline")) {
      await backend.deleteSharedClub(club.id).catch(() => undefined);
    }
    throw error;
  }

  // Confirmed: switch over. The Shared club goes in first (it stays hidden behind the Local club
  // of the same id), so there is never a moment without the Club.
  setSharedClubs([...getSharedClubs().filter((other) => other.id !== club.id), result.club]);
  if (result.active && running) {
    const latest = getSession();
    addHostedSession(result.active);
    if (latest && latest.id === running.id) {
      // The Session went on being played while the Club was being made: the device's latest copy
      // is the one to keep, not the one that was sent. It isn't marked as uploaded, so the host's
      // uploader sends it (also when the server held an older copy from an earlier try).
      setHostedSession(club.id, sessionForSharing({ ...latest }, plan.meRowId, account.accountId));
      setSession(null);
    } else {
      // The Session was ended while the Club was being made: the server must not keep it.
      const finished = getEndedSessions().find((candidate) => candidate.id === running.id) ?? null;
      removeSharedSession(club.id, { endedHere: true });
      backend
        .endSharedSession(club.id, finished)
        .catch((error: unknown) => console.error("Failed to end the shared session", error));
    }
  }
  setLocalClubs(getLocalClubs().filter((other) => other.id !== club.id));
}

/**
 * Delete this device's Account (ticket 11), carrying out `plan` (see `planAccountDeletion`): the
 * Shared clubs it is the only Account of are deleted, its rows elsewhere are unlinked, the Account
 * and its sign-in go (its Account ID stays reserved). Then the device is signed out: Shared club
 * data is cleared, and Local clubs and the device's own Sessions stay. Needs a connection.
 * Rejects with a BackendError and changes nothing on the device when the server refuses.
 */
export async function deleteMyAccount(plan: DeletionPlan): Promise<void> {
  const backend = getBackend();
  if (!backend) throw new BackendError("failed");
  if (plan.blocked.length > 0) throw new BackendError("last-organizer");
  // The Backend signs the device out as it goes, so remember whose Sessions were hosted here.
  const me = getAccount()?.accountId;
  await backend.deleteAccount({
    deleteClubIds: plan.deleteClubs.map(({ club }) => club.id),
    unlinkClubIds: plan.unlinkClubs.map((club) => club.id),
  });
  clearSharedData(me);
  setAccount(null);
}
