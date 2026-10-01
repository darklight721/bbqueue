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
import { getSession, setSession } from "../../storage/store.ts";
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

export function SessionProvider({ session, children }: { session: Session; children: ReactNode }) {
  const view = useMemo<SessionView>(() => {
    const asOf = lastChangeAt(session);
    return {
      session,
      asOf,
      // Computed once per Session change (not per tick). Display fields — matchesPlayed,
      // status, courtNumber — don't depend on time; `wait`/`recent` are as of the last change.
      stats: allPlayerStats(session, asOf),
      playerById: new Map(session.players.map((player) => [player.id, player])),
    };
  }, [session]);

  const [notice, setNotice] = useState<{ id: number; text: string } | null>(null);
  const counter = useRef(0);
  const notify = useCallback((text: string) => {
    counter.current += 1;
    setNotice({ id: counter.current, text });
  }, []);
  const dismiss = useCallback(() => setNotice(null), []);

  const actions = useMemo<SessionActions>(() => {
    const run = (operation: EngineOperation): boolean => {
      const current = getSession();
      if (!current) {
        notify(messageForReason("no-session"));
        return false;
      }
      const result = operation(current, { now: Date.now(), rng: Math.random });
      if (!result.ok) {
        notify(messageForReason(result.reason));
        return false;
      }
      setSession(result.session);
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
  }, [notify]);

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
