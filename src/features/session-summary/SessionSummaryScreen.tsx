import { useMemo } from "react";
import { Link, Redirect } from "wouter";
import type { SessionSummary } from "../../domain/types.ts";
import { buildSummary } from "../../domain/engine/index.ts";
import { useEndedSessions } from "../../storage/store.ts";
import { CourtLines } from "../home/CourtLines.tsx";
import { rise, sessionWhen } from "./summaryFormat.ts";
import { TopWinners, Totals } from "./SummaryParts.tsx";

/** End-of-night screen for one Ended session: totals and the top winners. */
export function SessionSummaryScreen({ sessionId }: { sessionId: string }) {
  const ended = useEndedSessions().find((candidate) => candidate.id === sessionId);
  const summary = useMemo(() => (ended ? buildSummary(ended) : null), [ended]);
  if (!summary) return <Redirect to="/sessions" replace />;
  return <Summary summary={summary} />;
}

function Summary({ summary }: { summary: SessionSummary }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Hero summary={summary} />

      <main className="px-safe relative z-10 mx-auto -mt-12 flex w-full max-w-2xl flex-1 flex-col gap-8 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <Totals summary={summary} />
        <TopWinners winners={summary.topWinners} />

        <Link
          href="/"
          className="btn btn-lg btn-primary animate-rise mt-auto w-full"
          style={rise(6)}
        >
          Home
        </Link>
      </main>
    </div>
  );
}

function Hero({ summary }: { summary: SessionSummary }) {
  return (
    <header className="relative isolate overflow-hidden bg-court text-line">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(120% 90% at 85% -10%, rgb(255 255 255 / 0.2), transparent 55%), linear-gradient(200deg, transparent 40%, var(--color-court-deep) 100%)",
        }}
      />
      <CourtLines className="absolute top-1/2 left-1/2 -z-10 w-[150%] max-w-none -translate-x-1/2 -translate-y-1/2 rotate-[12deg] text-line/25 sm:w-[110%]" />

      <div className="px-safe pt-safe mx-auto w-full max-w-2xl">
        <div className="flex min-h-[15rem] flex-col justify-end pt-10 pb-20">
          <h1 className="animate-rise mb-3 inline-flex items-center gap-2 self-start rounded-full bg-black/20 px-3 py-1 font-sans text-xs font-bold tracking-[0.18em] uppercase backdrop-blur-sm">
            <span className="size-2 rounded-full bg-volt" aria-hidden="true" />
            Session summary
          </h1>
          <p
            className="animate-rise font-display text-[clamp(2.5rem,12vw,4.75rem)] leading-[0.9] font-bold tracking-tight break-words uppercase"
            style={rise(0)}
          >
            {summary.sessionName}
          </p>
          <p className="animate-rise mt-3 text-sm font-semibold text-line/80" style={rise(1)}>
            {sessionWhen(summary.startedAt, summary.endedAt)}
          </p>
        </div>
      </div>
    </header>
  );
}
