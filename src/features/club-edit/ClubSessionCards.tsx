import type { MouseEvent } from "react";
import { useOnline } from "../../backend/useOnline.ts";
import { HistoryIcon, PlayIcon, PlusIcon } from "../../components/icons.tsx";
import { canStartSession, isSessionHost } from "../../domain/permissions.ts";
import type { Club } from "../../domain/types.ts";
import { activeSessionOfClub, useActiveSessions, useEndedSessions } from "../../storage/store.ts";
import { newSessionForClubPath } from "../new-session/newSession.ts";
import { countLabel } from "../session-summary/summaryFormat.ts";
import { ClubCardLink } from "./ClubCardLink.tsx";

/**
 * The Club page's session cards: Open active session or New session (for those who may start
 * one), and Sessions (past sessions), side by side. `leaveVia` guards each link (unsaved changes).
 */
export function ClubSessionCards({
  club,
  viewer,
  leaveVia,
}: {
  club: Club;
  viewer: string | undefined;
  leaveVia?: (href: string) => (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const online = useOnline();
  const endedSessions = useEndedSessions();
  const activeEntries = useActiveSessions();
  const sessionCount = endedSessions.filter((ended) => ended.clubId === club.id).length;
  // This Club's Active session: the device's own for a Local club, the Shared club's record otherwise.
  const activeEntry = activeSessionOfClub(activeEntries, club.id);
  const activeSession = activeEntry?.session ?? null;
  // Only the device's own Session is replaced by starting a new one; a Shared club's isn't touched.
  const replacesDeviceSession =
    club.kind === "local" && activeEntries.some((entry) => !entry.shared);
  // A Player of a Shared club only looks back at past sessions.
  const startsSessions = canStartSession(club, viewer);
  if (!startsSessions && sessionCount === 0) return null;

  const tiled = startsSessions && sessionCount > 0;
  const activeHref = activeSession ? `/sessions/${encodeURIComponent(activeSession.id)}` : null;
  const sessionsHref = `/clubs/${encodeURIComponent(club.id)}/sessions`;

  return (
    // Side by side in two equal columns; a card on its own takes the whole row.
    <nav aria-label="Club sessions" className="grid grid-cols-2 gap-3">
      {!startsSessions ? null : activeSession && activeHref ? (
        <ClubCardLink
          href={activeHref}
          tone="active"
          tile={tiled}
          className={tiled ? "" : "col-span-2"}
          icon={<PlayIcon className="size-6 translate-x-0.5" />}
          label="Open active session"
          detail={
            activeEntry?.shared
              ? `${activeSession.name} · ${
                  isSessionHost(activeEntry.shared, viewer)
                    ? "You're the host"
                    : `Host: ${activeEntry.shared.hostName}`
                }`
              : activeSession.name
          }
          onClick={leaveVia?.(activeHref)}
        />
      ) : (
        <ClubCardLink
          href={newSessionForClubPath(club.id)}
          tone="plain"
          tile={tiled}
          className={tiled ? "" : "col-span-2"}
          icon={<PlusIcon className="size-6" />}
          label="New session"
          detail={
            club.kind === "shared" && online === false
              ? "Needs a connection to start"
              : replacesDeviceSession
                ? "Replaces the current session"
                : "Pick players and courts"
          }
          onClick={leaveVia?.(newSessionForClubPath(club.id))}
        />
      )}
      {sessionCount > 0 ? (
        <ClubCardLink
          href={sessionsHref}
          tone="plain"
          tile={tiled}
          className={tiled ? "" : "col-span-2"}
          icon={<HistoryIcon className="size-6" />}
          label="Sessions"
          detail={countLabel(sessionCount, "past session", "past sessions")}
          onClick={leaveVia?.(sessionsHref)}
        />
      ) : null}
    </nav>
  );
}
