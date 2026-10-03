import { useSyncExternalStore } from "react";
import { diffClub, inSafeOrder } from "../domain/clubChanges.ts";
import type { Club } from "../domain/types.ts";
import { getAccount, getLocalClubs, setLocalClubs } from "../storage/store.ts";
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
