import { useSyncExternalStore } from "react";
import { diffClub } from "../domain/clubChanges.ts";
import type { Club } from "../domain/types.ts";
import { getAccount, getLocalClubs, setLocalClubs } from "../storage/store.ts";
import { getBackend } from "./index.ts";

/** Whether Clubs created now are Shared clubs: there is a Backend and an Account. */
export function createsSharedClubs(): boolean {
  return getBackend() !== null && getAccount() !== null;
}

function log(action: string) {
  return (error: unknown) => console.error(`Failed to ${action}`, error);
}

/** Save a new Club: a Shared club while signed in, a Local club otherwise. */
export function createClub(club: Club): void {
  const backend = getBackend();
  if (backend && getAccount()) {
    void backend
      .createSharedClub({ id: club.id, name: club.name, players: club.players })
      .catch(log("create Shared club"));
    return;
  }
  setLocalClubs([...getLocalClubs(), { ...club, kind: "local", players: club.players }]);
}

/**
 * Save an edited Club. Local clubs go to the device. A Shared club's changes go out through the
 * Backend one record at a time (name, one Club player row), and come back through the store.
 */
export function saveClub(before: Club, after: Club): void {
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
  for (const change of diffClub(before, after)) {
    switch (change.type) {
      case "rename":
        void backend.renameSharedClub(before.id, change.name).catch(log("rename Club"));
        break;
      case "addPlayer":
        void backend.addClubPlayer(before.id, change.player).catch(log("add Club player"));
        break;
      case "updatePlayer":
        void backend
          .updateClubPlayer(before.id, change.playerId, change.patch)
          .catch(log("update Club player"));
        break;
      case "removePlayer":
        void backend.removeClubPlayer(before.id, change.playerId).catch(log("remove Club player"));
        break;
    }
  }
}

/** Save every Club in `after` that differs from its version in `before`. */
export function saveClubs(before: readonly Club[], after: readonly Club[]): void {
  for (const club of after) {
    const old = before.find((candidate) => candidate.id === club.id);
    if (old && old !== club) saveClub(old, club);
  }
}

export function deleteClub(club: Club): void {
  if (club.kind === "local") {
    setLocalClubs(getLocalClubs().filter((existing) => existing.id !== club.id));
    return;
  }
  void getBackend()?.deleteSharedClub(club.id).catch(log("delete Club"));
}

/** Whether the device can reach the server; null when there is no Backend. */
export function useBackendOnline(): boolean | null {
  const backend = getBackend();
  return useSyncExternalStore(
    (listener) => (backend ? backend.observeOnline(listener) : () => {}),
    () => (backend ? backend.isOnline() : null),
  );
}
