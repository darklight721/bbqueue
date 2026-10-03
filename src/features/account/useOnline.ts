import { useSyncExternalStore } from "react";
import type { Backend } from "../../backend/backend.ts";

/** Whether the Backend can reach the server right now; re-renders when that changes. */
export function useOnline(backend: Backend): boolean {
  return useSyncExternalStore(
    (listener) => backend.observeOnline(listener),
    () => backend.isOnline(),
  );
}
