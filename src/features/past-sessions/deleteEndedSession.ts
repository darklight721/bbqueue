import { BackendError } from "../../backend/backend.ts";
import { getBackend } from "../../backend/index.ts";
import type { EndedSession } from "../../domain/types.ts";
import { getClubs, removeEndedSession } from "../../storage/store.ts";

/**
 * Deletes an Ended session (see `canDeleteEndedSession` for who may).
 * - No Club, a Local club, or a Club that isn't a Shared club on this device: removed from the
 *   device. Works offline.
 * - A Shared club: deleted on the server first, which needs a connection and an Organizer. Only
 *   when that succeeded is it removed from this device (the cache of Shared clubs' Ended sessions
 *   and the device's own copy, when it hosted it); other devices drop theirs when the Backend
 *   reports it gone. When the server refuses or can't be reached this rejects with a
 *   {@link BackendError} (`offline`, `forbidden`, ...) and nothing is removed locally.
 */
export async function deleteEndedSession(ended: EndedSession): Promise<void> {
  const club = ended.clubId ? getClubs().find((candidate) => candidate.id === ended.clubId) : null;
  if (ended.clubId && club?.kind === "shared") {
    const backend = getBackend();
    if (!backend) throw new BackendError("failed");
    await backend.deleteEndedSession(ended.clubId, ended.id);
  }
  removeEndedSession(ended.id);
}
