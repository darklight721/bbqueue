import type { EndedSession, Session, SessionRequestKind } from "../domain/types.ts";
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
 * An Organizer takes over as the Session host of a Shared club's Active session (ADR-0007): the server's copy of the Session becomes theirs to run, and the old host's device turns
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
 * the record is deleted on the server (waiting for the connection when offline). `ended` (the
 * slimmed Ended session, when the Session had at least one Ended match) is published to the Club
 * in the same step, so it can't be lost with the Active session; it also stays on the
 * device, as today. Failures are logged, never thrown: ending the night is not held up by the
 * server.
 */
export function endSharedSession(clubId: string, ended: EndedSession | null = null): void {
  removeSharedSession(clubId, { endedHere: true });
  getBackend()
    ?.endSharedSession(clubId, ended)
    .catch((error: unknown) => console.error("Failed to end the shared session", error));
}

/**
 * A Player asks the Session host to switch their own Sitting out or to let them leave. The request waits for the host's device; the store shows it as pending until then. Needs a
 * connection. Rejects with a {@link BackendError} (`offline`, `not-found`, `forbidden`, ...).
 */
export async function requestSessionChange(
  clubId: string,
  input: { sessionId: string; sessionPlayerId: string; kind: SessionRequestKind },
): Promise<void> {
  const backend = getBackend();
  if (!backend) throw new BackendError("failed");
  await backend.requestSessionChange(clubId, input);
}
