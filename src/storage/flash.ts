import { useSyncExternalStore } from "react";

/**
 * A short message for the next screen, for when something changes under the person while they
 * look at another screen (a Session they had open ended). Shown once on Home, then dismissed.
 */
let message: string | null = null;
const listeners = new Set<() => void>();

export function setFlash(next: string | null): void {
  message = next;
  for (const listener of [...listeners]) listener();
}

export function getFlash(): string | null {
  return message;
}

export function useFlash(): string | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    () => message,
  );
}
