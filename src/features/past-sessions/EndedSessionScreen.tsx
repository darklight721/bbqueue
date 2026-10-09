import { useId, useMemo, useState } from "react";
import { Link, Redirect, useLocation, useSearch } from "wouter";
import { BackendError } from "../../backend/backend.ts";
import { useOnline } from "../../backend/useOnline.ts";
import { ConfirmDialog } from "../../components/ConfirmDialog.tsx";
import { OfflineNote } from "../../components/OfflineNote.tsx";
import { ChevronRightIcon, ShareIcon, TrashIcon } from "../../components/icons.tsx";
import { MatchList, MatchRow } from "../../components/MatchRow.tsx";
import { usesMixedTargets } from "../../components/matchTargets.ts";
import { Screen } from "../../components/Screen.tsx";
import { buildSummary, rankStandings } from "../../domain/engine/index.ts";
import type { EndedSession } from "../../domain/types.ts";
import { displayClubName } from "../../domain/clubName.ts";
import { canDeleteEndedSession } from "../../domain/permissions.ts";
import { useAccount, useClubs, useEndedSessions } from "../../storage/store.ts";
import { CourtLines } from "../home/CourtLines.tsx";
import { clubStatsFromSessionPath } from "../play-record/statsOrigin.ts";
import { formatDuration } from "../session/clock.ts";
import { countLabel, rise, sessionDay, sessionTimes } from "../session-summary/summaryFormat.ts";
import {
  ClubLine,
  CollapsibleSection,
  Standings,
  Totals,
} from "../session-summary/SummaryParts.tsx";
import { buildClubFilterOptions } from "./clubFilter.ts";
import { deleteEndedSession } from "./deleteEndedSession.ts";
import { originBackPath, parseOrigin, summaryPath, validateOrigin } from "./sessionOrigin.ts";

/** Read-only look back at one Ended session: when, totals, Standings and every match. */
export function EndedSessionScreen({ sessionId }: { sessionId: string }) {
  const ended = useEndedSessions().find((candidate) => candidate.id === sessionId);
  if (!ended) return <Redirect to="/sessions" replace />;
  return <Details ended={ended} />;
}

function Details({ ended }: { ended: EndedSession }) {
  const clubs = useClubs();
  const account = useAccount();
  const sessions = useEndedSessions();
  const search = useSearch();
  // Where the user came from (a filtered list, a club's list, or the plain list): Back returns there.
  const origin = useMemo(
    () => validateOrigin(parseOrigin(search), buildClubFilterOptions(sessions, clubs), clubs),
    [search, sessions, clubs],
  );
  const clubName = displayClubName(ended.clubId, ended.clubName, clubs);
  const summary = useMemo(() => buildSummary(ended), [ended]);
  const standings = useMemo(() => rankStandings(ended), [ended]);
  const playerById = useMemo(
    () => new Map(ended.players.map((player) => [player.id, player])),
    [ended.players],
  );
  const showTarget = usesMixedTargets(ended.matches);
  const club = clubs.find((candidate) => candidate.id === ended.clubId) ?? null;
  const canDelete = canDeleteEndedSession(club, account?.accountId);

  return (
    <Screen title={ended.name} backTo={originBackPath(origin)}>
      <WhenBanner ended={ended} clubName={clubName} />
      <SummaryLink href={summaryPath(ended.id, origin)} />
      <Totals summary={summary} />
      <Standings
        standings={standings}
        // Club players open their Stats in this Club; Guests and Club-less Sessions stay plain.
        statsHref={(entry) =>
          ended.clubId !== null && entry.clubPlayerId !== null
            ? clubStatsFromSessionPath(ended.clubId, entry.clubPlayerId, ended.id, origin)
            : null
        }
        style={rise(3.5)}
      />

      <CollapsibleSection
        title="Matches"
        detail={countLabel(ended.matches.length, "match", "matches")}
        showLabel="Show matches"
        hideLabel="Hide matches"
        style={rise(5.5)}
      >
        {(listId) => (
          // Oldest first, as played.
          <MatchList id={listId} label="Matches">
            {ended.matches.map((match) => (
              <MatchRow
                key={match.number}
                match={match}
                duration={formatDuration(match.endedAt - match.startedAt)}
                showTarget={showTarget}
                playerById={playerById}
              />
            ))}
          </MatchList>
        )}
      </CollapsibleSection>

      {canDelete ? (
        <DeleteSection
          ended={ended}
          sharedClubName={club?.kind === "shared" ? club.name : null}
          backPath={originBackPath(origin)}
        />
      ) : null}
    </Screen>
  );
}

/**
 * "Delete session" at the very end, ruled off and quiet (a red ghost button, like Delete club) so
 * it doesn't compete with the summary. A Shared club's is deleted on the server, which needs a
 * connection; on success the user goes back to the list they came from.
 */
function DeleteSection({
  ended,
  sharedClubName,
  backPath,
}: {
  ended: EndedSession;
  sharedClubName: string | null;
  backPath: string;
}) {
  const [, navigate] = useLocation();
  const online = useOnline();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noteId = useId();
  const needsConnection = sharedClubName !== null && online === false;
  const blocked = needsConnection || deleting;

  async function remove() {
    setConfirming(false);
    setDeleting(true);
    setError(null);
    // Taken now: once the session is gone, a filter that only it matched would no longer count
    // as a valid origin.
    const to = backPath;
    try {
      await deleteEndedSession(ended);
    } catch (failure) {
      console.error("Failed to delete the ended session", failure);
      setError(deleteErrorMessage(failure));
      setDeleting(false);
      return;
    }
    // The details route may already have sent us to the plain list when the session vanished from
    // the store; this puts us on the list we came from either way, without a Back entry for it.
    navigate(to, { replace: true });
  }

  const message =
    `'${ended.name}' and its matches will be gone for good.` +
    (sharedClubName ? ` Everyone on ${sharedClubName} loses it too.` : "");

  return (
    <div className="mt-4 flex flex-col gap-1 border-t border-base-300 pt-6">
      <button
        type="button"
        // Red only when it can be used; daisyUI's disabled grey shows otherwise.
        className={`btn w-full btn-ghost ${blocked ? "" : "text-error"}`}
        disabled={blocked}
        aria-describedby={needsConnection || error ? noteId : undefined}
        onClick={() => setConfirming(true)}
      >
        {deleting ? (
          <span className="loading loading-sm loading-spinner" aria-hidden="true" />
        ) : (
          <TrashIcon className="size-5" />
        )}
        {deleting ? "Deleting…" : "Delete session"}
      </button>
      {error ? (
        <p
          id={noteId}
          role="alert"
          className="px-4 text-center text-sm leading-snug font-semibold text-error"
        >
          {error}
        </p>
      ) : needsConnection ? (
        <OfflineNote id={noteId} className="justify-center px-4 text-center">
          Deleting needs a connection.
        </OfflineNote>
      ) : null}

      <ConfirmDialog
        open={confirming}
        title="Delete this session?"
        message={message}
        confirmLabel="Delete"
        cancelLabel="Keep"
        tone="danger"
        onConfirm={() => void remove()}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

function deleteErrorMessage(error: unknown): string {
  switch (error instanceof BackendError ? error.code : null) {
    case "offline":
      return "You're offline. Deleting needs a connection.";
    case "forbidden":
      return "Only Organizers can delete this club's sessions.";
    case "not-found":
      return "This club is no longer available.";
    default:
      return "Couldn't delete the session. Please try again.";
  }
}

/** Card link to the shareable Session summary (its Back button returns here). */
function SummaryLink({ href }: { href: string }) {
  const labelId = useId();
  const detailId = useId();
  return (
    <Link
      href={href}
      aria-labelledby={labelId}
      aria-describedby={detailId}
      className="animate-rise group flex min-h-20 items-center gap-4 rounded-box border-[1.5px] border-base-300 bg-base-100 p-4 pr-3 text-base-content shadow-sm transition-transform active:scale-[0.98]"
      style={rise(1)}
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-base-200 text-primary">
        <ShareIcon className="size-6" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span id={labelId} className="font-display text-2xl leading-tight font-bold uppercase">
          View summary
        </span>
        <span id={detailId} className="truncate text-sm text-base-content/65">
          Share it as an image
        </span>
      </span>
      <ChevronRightIcon className="size-6 shrink-0 opacity-50 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

/** Court-green card with the day, the start–end time and the Club (when there was one). */
function WhenBanner({ ended, clubName }: { ended: EndedSession; clubName: string | null }) {
  return (
    <div
      className="animate-rise relative isolate overflow-hidden rounded-box bg-court px-5 py-5 text-line shadow-lg"
      style={rise(0)}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(120% 120% at 100% 0%, rgb(255 255 255 / 0.18), transparent 55%), linear-gradient(200deg, transparent 40%, var(--color-court-deep) 100%)",
        }}
      />
      <CourtLines className="absolute top-1/2 right-[-30%] -z-10 w-[85%] max-w-none -translate-y-1/2 rotate-[12deg] text-line/20" />

      <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-black/20 px-3 py-1 text-xs font-bold tracking-[0.18em] uppercase">
        <span className="size-2 rounded-full bg-volt" aria-hidden="true" />
        Ended session
      </p>
      <p className="font-display text-4xl leading-none font-bold uppercase">
        {sessionDay(ended.startedAt)}
      </p>
      <p className="mt-2 text-base font-semibold text-line/85 tabular-nums">
        {sessionTimes(ended.startedAt, ended.endedAt)}
      </p>
      {clubName ? <ClubLine name={clubName} className="mt-3 text-sm" /> : null}
    </div>
  );
}
