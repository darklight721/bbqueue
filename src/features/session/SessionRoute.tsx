import { Redirect } from "wouter";
import { EndedSessionScreen } from "../past-sessions/EndedSessionScreen.tsx";
import { useEndedSessions, useSession } from "../../storage/store.ts";
import { SessionScreen } from "./SessionScreen.tsx";

/** `/sessions/:id`: the live Session if it is Active, else the Ended session, else the list. */
export function SessionRoute({ sessionId }: { sessionId: string }) {
  const session = useSession();
  const endedSessions = useEndedSessions();
  if (session?.id === sessionId) return <SessionScreen />;
  if (endedSessions.some((ended) => ended.id === sessionId)) {
    return <EndedSessionScreen sessionId={sessionId} />;
  }
  return <Redirect to="/sessions" replace />;
}
