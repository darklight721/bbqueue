import type { ReactNode } from "react";

import { EyeIcon, OfflineIcon } from "../../components/icons.tsx";
import { useNow } from "./clock.ts";
import { copyNote } from "./copyAge.ts";
import { useOnline } from "../../backend/useOnline.ts";

/**
 * Shown at the top of the Session screen to everyone who isn't the Session host (ADR-0007):
 * they watch, the host changes. Says who the host is and, when the copy isn't live (offline, or
 * a while since the host's last upload), how old it is. Offline turns the whole strip amber so
 * it can't be mistaken for the calm "last update" line.
 */
export function WatchingNote({
  hostName,
  updatedAt,
  takenOverBy = null,
  action,
}: {
  hostName: string;
  updatedAt: number;
  /** Set when this device was the host until that person took over: says what happened. */
  takenOverBy?: string | null;
  /** Something the person can do from here, such as Take over. */
  action?: ReactNode;
}) {
  const online = useOnline();
  const now = useNow();
  const note = copyNote({ updatedAt, now, online });
  const offline = note?.offline === true;
  return (
    <div
      className={`flex flex-col gap-2.5 rounded-box border-[1.5px] px-3 py-2.5 ${
        offline ? "border-warning/70 bg-warning/12" : "border-base-300 bg-base-200/60"
      } ${takenOverBy ? "animate-rise" : ""}`}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={`grid size-10 shrink-0 place-items-center rounded-full ${
            offline ? "bg-warning text-warning-content" : "bg-base-100 text-primary"
          }`}
        >
          {offline ? <OfflineIcon className="size-5" /> : <EyeIcon className="size-5" />}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="text-sm font-semibold">Watching. {hostName} runs this session.</p>
          {/* This device was the host until a moment ago: say so first, even offline. */}
          {takenOverBy ? (
            <p role="status" className="text-sm text-base-content/75">
              {takenOverBy} took over. Changes you hadn't uploaded were dropped.
            </p>
          ) : null}
          {note ? (
            <p
              role={offline ? "status" : undefined}
              className={`text-sm ${offline ? "font-semibold text-base-content/85" : "text-base-content/60"}`}
            >
              {note.text}
            </p>
          ) : takenOverBy ? null : (
            <p className="text-sm text-base-content/60">Only the host can change it.</p>
          )}
        </div>
      </div>
      {action}
    </div>
  );
}

/**
 * Compact, always-visible state in the top bar for someone watching: "Live" while connected
 * (the Session updates by itself), "Offline" when this device has no connection.
 */
export function LivePill() {
  const online = useOnline();
  if (online === false) {
    return (
      <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-warning/20 px-2.5 text-xs font-bold tracking-wider whitespace-nowrap text-base-content uppercase ring-1 ring-warning/60">
        <OfflineIcon className="size-3.5" />
        Offline
      </span>
    );
  }
  return (
    <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary/10 px-2.5 text-xs font-bold tracking-wider whitespace-nowrap text-primary uppercase">
      <span aria-hidden="true" className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:hidden" />
        <span className="relative inline-flex size-2 rounded-full bg-primary" />
      </span>
      Live
    </span>
  );
}
