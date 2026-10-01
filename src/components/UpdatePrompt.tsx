import { useRegisterSW } from "virtual:pwa-register/react";
import { RefreshIcon } from "./icons.tsx";

/**
 * "New version available" toast. Never reloads on its own: the user taps Reload.
 * Imports the PWA virtual module, so App loads this lazily and only where service
 * workers exist (keeps jsdom tests away from it).
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div className="toast toast-center z-50 w-[calc(100%-2rem)] max-w-md bottom-[max(1rem,env(safe-area-inset-bottom))]">
      <div
        role="status"
        className="flex items-center gap-3 rounded-box bg-neutral py-3 pr-3 pl-4 text-neutral-content shadow-xl"
      >
        <RefreshIcon className="size-6 shrink-0 text-accent" />
        <p className="min-w-0 flex-1 font-semibold">New version available</p>
        <button
          type="button"
          className="btn btn-ghost text-neutral-content"
          onClick={() => setNeedRefresh(false)}
        >
          Later
        </button>
        <button
          type="button"
          className="btn btn-accent"
          onClick={() => void updateServiceWorker(true)}
        >
          Reload
        </button>
      </div>
    </div>
  );
}
