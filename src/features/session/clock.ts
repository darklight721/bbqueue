import { useSyncExternalStore } from "react";

/**
 * One shared ticking clock for every live timer on screen.
 * A single interval runs only while something is subscribed; the snapshot is
 * whole seconds so React re-renders at most once per second.
 */
const listeners = new Set<() => void>();
let interval: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (interval === null) {
    interval = setInterval(() => {
      for (const notify of [...listeners]) notify();
    }, 250);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && interval !== null) {
      clearInterval(interval);
      interval = null;
    }
  };
}

function snapshot(): number {
  return Math.floor(Date.now() / 1000) * 1000;
}

/** Current time (epoch ms, whole seconds), updating every second while mounted. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, snapshot);
}

/** "mm:ss", or "h:mm:ss" past an hour. Negative durations show as 00:00. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
