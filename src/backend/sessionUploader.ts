import type { Unsubscribe } from "./backend.ts";

export interface UploaderOptions<T> {
  /** Sends one whole copy. Resolves when the server has it. */
  send(value: T): Promise<unknown>;
  isOnline(): boolean;
  observeOnline(listener: (online: boolean) => void): Unsubscribe;
  /**
   * Called when a send fails. Return "stop" when sending again can't help (the host was taken
   * over, the record is gone); anything else tries again after a pause.
   */
  onError?(error: unknown): "retry" | "stop";
  /** Quiet time after the last change before sending. */
  debounceMs?: number;
  /** A burst of changes never holds the upload back longer than this. */
  maxWaitMs?: number;
  /** Pauses before trying again after a failure; the last one repeats. */
  retryDelaysMs?: readonly number[];
}

export interface Uploader<T> {
  /** The latest copy. Replaces any copy that hasn't been sent yet. */
  push(value: T): void;
  /** Whether a copy is waiting or on its way. */
  isBusy(): boolean;
  stop(): void;
}

/**
 * Uploads the Session host's latest whole copy, as rarely as is safe (ADR-0007):
 * - changes within `debounceMs` of each other go out together, and at most `maxWaitMs` late;
 * - at most one send is in flight; changes made meanwhile wait and go out as one copy after it;
 * - nothing is sent while offline, and coming back online sends the latest copy once, instead
 *   of replaying every copy made meanwhile (so nothing relies on Firestore's offline queue);
 * - a failed send is tried again with growing pauses, never thrown into the caller's play.
 */
export function createCoalescingUploader<T>(options: UploaderOptions<T>): Uploader<T> {
  const debounceMs = options.debounceMs ?? 1_000;
  const maxWaitMs = options.maxWaitMs ?? 5_000;
  const retryDelays = options.retryDelaysMs ?? [2_000, 5_000, 15_000, 30_000];

  let latest: T | undefined;
  let dirty = false;
  let stopped = false;
  /** Number of the send that is in flight, or 0. A new send after going offline replaces it. */
  let inFlight = 0;
  let sends = 0;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let firstDirtyAt = 0;

  function schedule(delay: number) {
    clearTimeout(timer);
    timer = setTimeout(fire, delay);
  }

  function fire() {
    timer = undefined;
    if (stopped || !dirty || inFlight !== 0 || !options.isOnline()) return;
    const value = latest as T;
    const id = ++sends;
    dirty = false;
    inFlight = id;
    options.send(value).then(
      () => {
        if (stopped) return;
        if (inFlight === id) inFlight = 0;
        failures = 0;
        if (dirty && inFlight === 0) schedule(debounceMs);
      },
      (error: unknown) => {
        if (stopped) return;
        if (inFlight === id) inFlight = 0;
        let verdict: "retry" | "stop" = "retry";
        try {
          verdict = options.onError?.(error) ?? "retry";
        } catch (handlerError) {
          console.error("Upload error handler failed", handlerError);
        }
        if (verdict === "stop") {
          dirty = false;
          return;
        }
        dirty = true;
        const delay = retryDelays[Math.min(failures, retryDelays.length - 1)] ?? 30_000;
        failures += 1;
        if (inFlight === 0 && options.isOnline()) schedule(delay);
      },
    );
  }

  const stopOnline = options.observeOnline((online) => {
    if (stopped) return;
    if (!online) {
      clearTimeout(timer);
      timer = undefined;
      // A send that never answered may or may not have arrived: send the latest copy again.
      if (inFlight !== 0) dirty = true;
      return;
    }
    // Back online: whatever is waiting goes out now, once, as the latest copy. A send that was
    // in flight when the connection dropped is given up on (it may be stuck).
    inFlight = 0;
    failures = 0;
    if (dirty) schedule(0);
  });

  return {
    push(value) {
      if (stopped) return;
      latest = value;
      if (!dirty) firstDirtyAt = Date.now();
      dirty = true;
      if (!options.isOnline() || inFlight !== 0) return;
      // After a failure the pause before trying again holds, however much changes meanwhile.
      if (failures > 0 && timer !== undefined) return;
      const waited = Date.now() - firstDirtyAt;
      schedule(Math.max(0, Math.min(debounceMs, maxWaitMs - waited)));
    },
    isBusy: () => dirty || inFlight !== 0,
    stop() {
      stopped = true;
      clearTimeout(timer);
      stopOnline();
    },
  };
}
