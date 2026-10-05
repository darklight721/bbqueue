import { applyRequests } from "../domain/engine/index.ts";
import type { Session, SessionRequest } from "../domain/types.ts";
import type { Backend, Unsubscribe } from "./backend.ts";

/** Pause before trying to mark requests again after a failure. */
const RETRY_MS = 5_000;

/** Order in which this run of the app first saw each copy of a Session: a later copy has a bigger number. */
const versions = new WeakMap<Session, number>();
let versionCounter = 0;
export function versionOf(session: Session): number {
  let version = versions.get(session);
  if (version === undefined) {
    version = ++versionCounter;
    versions.set(session, version);
  }
  return version;
}

export interface HostRequests {
  /** Applies any new requests to the hosted Session; call again whenever the Session changes. */
  process(): void;
  /** The server has this copy of the Session: requests applied into it (or an earlier copy) are marked. */
  uploaded(session: Session): void;
  stop(): void;
}

/**
 * The Session host's side of Players' requests (ticket 08, ADR-0007) for one Shared club.
 *
 * Requests are applied to the host's copy in the order they were made, through the engine
 * (`applyRequests`). A request that was applied is only marked `applied` once a copy of the Session
 * that includes it has reached the server, so that if this device is replaced as host before that,
 * the request is still pending for the new host. A skipped request changes nothing, so it is marked
 * at once. A leave that has to wait for the player's Match stays pending and is tried again after
 * every change of the Session.
 */
export function createHostRequests(options: {
  backend: Backend;
  clubId: string;
  getSession(): Session | null;
  setSession(session: Session): void;
  /** Called with every report of the Club's requests, for the store. */
  onRequests?(requests: SessionRequest[]): void;
  /** The host was refused: this device isn't the Session host any more. */
  onRefused?(): void;
}): HostRequests {
  const { backend, clubId } = options;
  let latest: SessionRequest[] = [];
  /** Requests this device has dealt with, until the server reports them resolved. */
  const handled = new Set<string>();
  const skipped: string[] = [];
  const applied: { id: string; version: number }[] = [];
  let uploadedVersion = 0;
  let flushing = false;
  let stopped = false;
  let retry: ReturnType<typeof setTimeout> | undefined;

  const stopObserving: Unsubscribe = backend.observeSessionRequests(clubId, "all", (requests) => {
    latest = requests;
    options.onRequests?.(requests);
    process();
  });
  const stopOnline = backend.observeOnline((online) => {
    if (online) flush();
  });

  function process() {
    if (stopped) return;
    const session = options.getSession();
    if (!session) return;
    const pending = latest.filter(
      (request) =>
        request.status === "pending" &&
        !handled.has(request.id) &&
        // Left over from another Session of this Club: nothing to do with this one.
        request.sessionId === session.id,
    );
    if (pending.length > 0) {
      const result = applyRequests(session, pending, { now: Date.now(), rng: Math.random });
      const version = result.session === session ? 0 : versionOf(result.session);
      for (const outcome of result.outcomes) {
        if (outcome.outcome === "deferred") continue;
        handled.add(outcome.requestId);
        if (outcome.outcome === "skipped") skipped.push(outcome.requestId);
        else applied.push({ id: outcome.requestId, version });
      }
      // Dealt with before the Session is saved: saving tells the host's uploader, which calls back.
      if (result.session !== session) options.setSession(result.session);
    }
    flush();
  }

  function flush() {
    if (stopped || flushing || !backend.isOnline()) return;
    const ready = [
      ...skipped.map((id) => ({ id, status: "skipped" as const })),
      ...applied
        .filter((entry) => entry.version <= uploadedVersion)
        .map((entry) => ({ id: entry.id, status: "applied" as const })),
    ];
    if (ready.length === 0) return;
    flushing = true;
    backend.resolveSessionRequests(clubId, ready).then(
      () => {
        flushing = false;
        const done = new Set(ready.map((entry) => entry.id));
        for (let index = skipped.length - 1; index >= 0; index--) {
          if (done.has(skipped[index]!)) skipped.splice(index, 1);
        }
        for (let index = applied.length - 1; index >= 0; index--) {
          if (done.has(applied[index]!.id)) applied.splice(index, 1);
        }
        flush();
      },
      (error: unknown) => {
        flushing = false;
        if ((error as { code?: unknown } | null)?.code === "forbidden") {
          // Not the host any more: the new host deals with whatever is still pending.
          skipped.length = 0;
          applied.length = 0;
          options.onRefused?.();
          return;
        }
        console.warn("Couldn't mark the requests, trying again", error);
        clearTimeout(retry);
        retry = setTimeout(flush, RETRY_MS);
      },
    );
  }

  return {
    process,
    uploaded(session) {
      uploadedVersion = Math.max(uploadedVersion, versionOf(session));
      flush();
    },
    stop() {
      stopped = true;
      clearTimeout(retry);
      stopObserving();
      stopOnline();
    },
  };
}
