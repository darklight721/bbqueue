import type { Session } from "../domain/types.ts";
import { addHostedSession, removeSharedSession } from "../storage/store.ts";
import { BackendError } from "./backend.ts";
import { getBackend } from "./index.ts";

/**
 * Start the Active session of a Shared club with `session` and make this device its Session
 * host: the Session is kept in the store, and uploaded after every change (see
 * `startActiveSessionSync`). Needs a connection. Rejects with a {@link BackendError} (`offline`,
 * `session-exists`, `forbidden`, `not-found`, ...); then nothing was started.
 */
export async function startSharedSession(clubId: string, session: Session): Promise<void> {
  const backend = getBackend();
  if (!backend) throw new BackendError("failed");
  addHostedSession(await backend.startSharedSession(clubId, session));
}

/**
 * An Organizer takes over as the Session host of a Shared club's Active session (ADR-0007, ticket
 * 07): the server's copy of the Session becomes theirs to run, and the old host's device turns
 * read-only when it hears. Needs a connection. Rejects with a {@link BackendError} (`offline`,
 * `forbidden`, `not-found`, ...); then nothing changed.
 */
export async function takeOverSession(clubId: string): Promise<void> {
  const backend = getBackend();
  if (!backend) throw new BackendError("failed");
  addHostedSession(await backend.takeOverSession(clubId));
}

/**
 * The Session host ends a Shared club's Active session: it leaves the device's store at once, and
 * the record is deleted on the server (waiting for the connection when offline). Failures are
 * logged, never thrown: ending the night is not held up by the server.
 */
export function endSharedSession(clubId: string): void {
  removeSharedSession(clubId, { endedHere: true });
  getBackend()
    ?.endSharedSession(clubId)
    .catch((error: unknown) => console.error("Failed to end the shared session", error));
  // Ticket 09 publishes the Ended session to the Club here.
}
