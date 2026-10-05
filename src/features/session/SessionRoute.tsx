import { useEffect, useState } from "react";
import { Redirect } from "wouter";
import { EndedSessionScreen } from "../past-sessions/EndedSessionScreen.tsx";
import { setFlash } from "../../storage/flash.ts";
import { isSessionHost } from "../../domain/permissions.ts";
import { useAccount, useActiveSessions, useEndedSessions } from "../../storage/store.ts";
import { SessionScreen } from "./SessionScreen.tsx";

/**
 * `/sessions/:id`: the Active session if there is one with that id (the device's own, or a
 * Shared club's, which anyone on the Club may open), else the Ended session, else the list.
 * A Session that was open and ends while it is on screen (its host ended it) sends the person
 * Home with a short notice.
 */
export function SessionRoute({ sessionId }: { sessionId: string }) {
  const active = useActiveSessions().find((entry) => entry.session.id === sessionId) ?? null;
  const endedSessions = useEndedSessions();
  const account = useAccount();
  const [seen, setSeen] = useState<{ name: string; viewing: boolean } | null>(null);
  if (active) {
    const viewing = !isSessionHost(active.shared, account?.accountId);
    if (seen?.name !== active.session.name || seen.viewing !== viewing) {
      setSeen({ name: active.session.name, viewing });
    }
  }

  // A Session somebody else runs that vanishes: tell them once, on the screen they land on.
  const vanished = !active && seen?.viewing ? seen : null;
  useEffect(() => {
    if (vanished) setFlash(`'${vanished.name}' has ended.`);
  }, [vanished]);

  if (active) return <SessionScreen sessionId={sessionId} />;
  if (vanished) return <Redirect to="/" replace />;
  if (endedSessions.some((ended) => ended.id === sessionId)) {
    return <EndedSessionScreen sessionId={sessionId} />;
  }
  return <Redirect to="/sessions" replace />;
}
