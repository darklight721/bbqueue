import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  addCourt,
  allPlayerStats,
  endMatch,
  rehashAll,
  rehashCourt,
  removeCourt,
  removeMatch,
  startMatch,
} from "../../domain/engine/index.ts";
import type { Session } from "../../domain/types.ts";
import {
  getSession,
  getSharedSessions,
  setHostedSession,
  setSession,
} from "../../storage/store.ts";
import {
  SessionActionsContext,
  SessionViewContext,
  type EngineOperation,
  type SessionActions,
  type SessionView,
} from "./context.ts";
import { messageForReason } from "./reasons.ts";
import { NOTICE_BOTTOM } from "./SectionJumpBar.tsx";

const NOTICE_MS = 4000;

/** Latest timestamp recorded in the Session: a pure stand-in for "now" when computing stats. */
function lastChangeAt(session: Session): number {
  let latest = session.startedAt;
  for (const player of session.players) latest = Math.max(latest, player.joinedAt);
  for (const match of session.matches) latest = Math.max(latest, match.endedAt ?? match.startedAt);
  return latest;
}

/**
 * Provides the Session and the named engine actions. `hostedClubId` is set when the Session is
 * the Active session of a Shared club that this device hosts: changes are saved there (the
 * uploader sends them on) instead of in the device's own Session slot. `readOnly` is for
 * everyone who isn't the Session host: no action changes anything.
 */
export function SessionProvider({
  session,
  hostedClubId = null,
  readOnly = false,
  sharedClubId = null,
  children,
}: {
  session: Session;
  hostedClubId?: string | null;
  readOnly?: boolean;
  sharedClubId?: string | null;
  children: ReactNode;
}) {
  const view = useMemo<SessionView>(() => {
    const asOf = lastChangeAt(session);
    return {
      session,
      asOf,
      // Computed once per Session change (not per tick). Display fields — matchesPlayed,
      // status, courtNumber — don't depend on time; `wait`/`recent` are as of the last change.
      stats: allPlayerStats(session, asOf),
      playerById: new Map(session.players.map((player) => [player.id, player])),
      readOnly,
      sharedClubId,
    };
  }, [session, readOnly, sharedClubId]);

  const [notice, setNotice] = useState<{ id: number; text: string } | null>(null);
  const counter = useRef(0);
  const notify = useCallback((text: string) => {
    counter.current += 1;
    setNotice({ id: counter.current, text });
  }, []);
  const dismiss = useCallback(() => setNotice(null), []);

  const actions = useMemo<SessionActions>(() => {
    const run = (operation: EngineOperation): boolean => {
      if (readOnly) {
        notify(messageForReason("not-host"));
        return false;
      }
      const current = hostedClubId
        ? (getSharedSessions().find((entry) => entry.clubId === hostedClubId)?.session ?? null)
        : getSession();
      if (!current) {
        notify(messageForReason("no-session"));
        return false;
      }
      const result = operation(current, { now: Date.now(), rng: Math.random });
      if (!result.ok) {
        notify(messageForReason(result.reason));
        return false;
      }
      if (hostedClubId) setHostedSession(hostedClubId, result.session);
      else setSession(result.session);
      return true;
    };
    return {
      run,
      notify,
      startMatch: (courtId) => run((s, ctx) => startMatch(s, courtId, ctx)),
      endMatch: (matchId, score) => run((s, ctx) => endMatch(s, matchId, score, ctx)),
      removeMatch: (matchId) => run((s, ctx) => removeMatch(s, matchId, ctx)),
      rehashCourt: (courtId) => run((s, ctx) => rehashCourt(s, courtId, ctx)),
      rehashAll: () => run((s, ctx) => rehashAll(s, ctx)),
      addCourt: () => run((s, ctx) => addCourt(s, ctx)),
      removeCourt: (courtId) => run((s, ctx) => removeCourt(s, courtId, ctx)),
    };
  }, [notify, hostedClubId, readOnly]);

  return (
    <SessionViewContext.Provider value={view}>
      <SessionActionsContext.Provider value={actions}>
        {children}
        <Notice notice={notice} onDismiss={dismiss} />
      </SessionActionsContext.Provider>
    </SessionViewContext.Provider>
  );
}

function Notice({
  notice,
  onDismiss,
}: {
  notice: { id: number; text: string } | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(onDismiss, NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4 ${NOTICE_BOTTOM}`}
    >
      {notice ? (
        <div
          key={notice.id}
          className="animate-rise pointer-events-auto flex max-w-md items-center gap-2 rounded-box bg-neutral py-2 pr-2 pl-4 text-neutral-content shadow-xl"
        >
          <p className="min-w-0 flex-1 font-semibold">{notice.text}</p>
          <button type="button" className="btn btn-ghost text-neutral-content" onClick={onDismiss}>
            OK
          </button>
        </div>
      ) : null}
    </div>
  );
}
