import { useMemo } from "react";
import { Redirect } from "wouter";
import { MatchList, MatchRow } from "../../components/MatchRow.tsx";
import { usesMixedTargets } from "../../components/matchTargets.ts";
import { Screen } from "../../components/Screen.tsx";
import { buildSummary } from "../../domain/engine/index.ts";
import type { EndedSession } from "../../domain/types.ts";
import { useEndedSessions } from "../../storage/store.ts";
import { CourtLines } from "../home/CourtLines.tsx";
import { formatDuration } from "../session/clock.ts";
import { SectionHeader } from "../session/SectionHeader.tsx";
import { rise, sessionDay, sessionTimes } from "../session-summary/summaryFormat.ts";
import { TopWinners, Totals } from "../session-summary/SummaryParts.tsx";

const MATCHES_HEADING_ID = "ended-session-matches";

/** Read-only look back at one Ended session: when, totals, Top winners and every match. */
export function EndedSessionScreen({ sessionId }: { sessionId: string }) {
  const ended = useEndedSessions().find((candidate) => candidate.id === sessionId);
  if (!ended) return <Redirect to="/sessions" replace />;
  return <Details ended={ended} />;
}

function Details({ ended }: { ended: EndedSession }) {
  const summary = useMemo(() => buildSummary(ended), [ended]);
  const playerById = useMemo(
    () => new Map(ended.players.map((player) => [player.id, player])),
    [ended.players],
  );
  const showTarget = usesMixedTargets(ended.matches);

  return (
    <Screen title={ended.name} backTo="/sessions">
      <WhenBanner ended={ended} />
      <Totals summary={summary} />
      <TopWinners winners={summary.topWinners} />

      <section
        aria-labelledby={MATCHES_HEADING_ID}
        className="animate-rise flex flex-col gap-3"
        style={rise(6)}
      >
        <SectionHeader id={MATCHES_HEADING_ID} title="Matches" detail="Oldest first" />
        <MatchList label="Matches">
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
      </section>
    </Screen>
  );
}

/** Court-green card with the day and the start–end time. */
function WhenBanner({ ended }: { ended: EndedSession }) {
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
    </div>
  );
}
