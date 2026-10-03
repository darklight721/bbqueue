import { useId, useMemo } from "react";
import { Link, Redirect, useSearch } from "wouter";
import { ChevronRightIcon, ShareIcon } from "../../components/icons.tsx";
import { MatchList, MatchRow } from "../../components/MatchRow.tsx";
import { usesMixedTargets } from "../../components/matchTargets.ts";
import { Screen } from "../../components/Screen.tsx";
import { buildSummary, rankStandings } from "../../domain/engine/index.ts";
import type { EndedSession } from "../../domain/types.ts";
import { displayClubName } from "../../domain/clubName.ts";
import { useClubs, useEndedSessions } from "../../storage/store.ts";
import { CourtLines } from "../home/CourtLines.tsx";
import { formatDuration } from "../session/clock.ts";
import { countLabel, rise, sessionDay, sessionTimes } from "../session-summary/summaryFormat.ts";
import {
  ClubLine,
  CollapsibleSection,
  Standings,
  Totals,
} from "../session-summary/SummaryParts.tsx";
import { buildClubFilterOptions } from "./clubFilter.ts";
import { originBackPath, parseOrigin, summaryPath, validateOrigin } from "./sessionOrigin.ts";

/** Read-only look back at one Ended session: when, totals, Standings and every match. */
export function EndedSessionScreen({ sessionId }: { sessionId: string }) {
  const ended = useEndedSessions().find((candidate) => candidate.id === sessionId);
  if (!ended) return <Redirect to="/sessions" replace />;
  return <Details ended={ended} />;
}

function Details({ ended }: { ended: EndedSession }) {
  const clubs = useClubs();
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

  return (
    <Screen title={ended.name} backTo={originBackPath(origin)}>
      <WhenBanner ended={ended} clubName={clubName} />
      <SummaryLink href={summaryPath(ended.id, origin)} />
      <Totals summary={summary} />
      <Standings standings={standings} style={rise(3.5)} />

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
    </Screen>
  );
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
