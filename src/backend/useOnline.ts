import { useCallback, useSyncExternalStore } from "react";
import type { Backend } from "./backend.ts";
import { getBackend } from "./index.ts";

/**
 * Whether the device can reach the server right now; re-renders when that changes. With a
 * Backend it is that one's answer; without one, the app's own Backend's, or null when there is
 * none (no Firebase config, so nothing to be online for).
 */
export function useOnline(backend: Backend): boolean;
export function useOnline(): boolean | null;
export function useOnline(given?: Backend): boolean | null {
  const backend = given ?? getBackend();
  const subscribe = useCallback(
    (listener: () => void) => (backend ? backend.observeOnline(listener) : () => {}),
    [backend],
  );
  return useSyncExternalStore(subscribe, () => (backend ? backend.isOnline() : null));
}
