import { useMemo, useRef } from "react";
import { Link, Redirect, useSearch } from "wouter";
import { BrandMark, Wordmark } from "../../components/BrandMark.tsx";
import { ShareIcon, WarningIcon } from "../../components/icons.tsx";
import type { SessionSummary } from "../../domain/types.ts";
import { buildSummary } from "../../domain/engine/index.ts";
import { useEndedSessions } from "../../storage/store.ts";
import { CourtLines } from "../home/CourtLines.tsx";
import { APP_URL_LABEL, summaryFileName, useShareSummary } from "./shareSummary.ts";
import { rise, sessionWhen } from "./summaryFormat.ts";
import { TopWinners, Totals } from "./SummaryParts.tsx";

/** End-of-night screen for one Ended session: totals and the top winners. */
export function SessionSummaryScreen({ sessionId }: { sessionId: string }) {
  const ended = useEndedSessions().find((candidate) => candidate.id === sessionId);
  const summary = useMemo(() => (ended ? buildSummary(ended) : null), [ended]);
  if (!summary) return <Redirect to="/sessions" replace />;
  return <Summary sessionId={sessionId} summary={summary} />;
}

function Summary({ sessionId, summary }: { sessionId: string; summary: SessionSummary }) {
  // Opened from the Ended session details page: go back there instead of Home.
  const fromDetails = new URLSearchParams(useSearch()).get("from") === "details";
  const captureRef = useRef<HTMLDivElement>(null);
  const { share, status } = useShareSummary(
    captureRef,
    summaryFileName(summary.sessionName, summary.startedAt),
  );
  const busy = status === "busy";

  return (
    <div className="flex min-h-dvh flex-col">
      {/*
       * Everything in here is the shareable image (hero, Totals, Top winners).
       * It is a size container, so its width-dependent styles follow its own
       * width rather than the screen's: set it to phone width and it lays out
       * like a phone. Opaque page background + bottom padding so the image has
       * a solid, finished edge. The action buttons stay outside.
       */}
      <div ref={captureRef} data-summary-capture className="@container bg-base-100 pb-10">
        <Hero summary={summary} />

        <main className="px-safe relative z-10 mx-auto -mt-12 flex w-full max-w-2xl flex-col gap-8">
          <Totals summary={summary} />
          <TopWinners winners={summary.topWinners} />
        </main>

        <ShareFooter />
      </div>

      <div className="px-safe mx-auto mt-auto flex w-full max-w-2xl flex-col pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {/* Always in the page (empty = no height) so the message is announced when it appears. */}
        <p
          role="status"
          className="mb-3 flex items-center justify-center gap-2 text-sm font-semibold text-error empty:mb-0"
        >
          {status === "error" ? (
            <>
              <WarningIcon className="size-4 shrink-0" />
              Couldn't create the image
            </>
          ) : null}
        </p>

        <button
          type="button"
          className="btn btn-lg btn-primary animate-rise w-full"
          style={rise(6)}
          disabled={busy}
          aria-busy={busy}
          onClick={() => void share()}
        >
          {busy ? (
            <span className="loading loading-spinner loading-sm" aria-hidden="true" />
          ) : (
            <ShareIcon className="size-5" />
          )}
          Share summary
        </button>

        <Link
          href={fromDetails ? `/sessions/${sessionId}` : "/"}
          className="btn btn-lg btn-outline animate-rise mt-3 w-full border-base-300 bg-base-100"
          style={rise(6.5)}
        >
          {fromDetails ? "Back" : "Home"}
        </Link>
      </div>
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
      <CourtLines className="absolute top-1/2 left-1/2 -z-10 w-[150%] max-w-none -translate-x-1/2 -translate-y-1/2 rotate-[12deg] text-line/25 @min-[40rem]:w-[110%]" />

      <div className="px-safe pt-safe mx-auto w-full max-w-2xl">
        <div className="flex min-h-[15rem] flex-col justify-end pt-6 pb-20">
          {/* Brand lockup: sits at the top of the hero, and so at the top of the shared image. */}
          <div className="animate-rise mb-auto flex items-center gap-2.5 pb-9">
            <BrandMark className="size-9 shrink-0 drop-shadow-[0_3px_8px_rgb(0_0_0/0.2)]" />
            <p className="font-display text-[1.875rem] leading-none font-extrabold tracking-[-0.01em]">
              <span className="sr-only">BBQueue</span>
              <span aria-hidden="true">
                <Wordmark />
              </span>
            </p>
          </div>

          <h1
            className="animate-rise mb-3 inline-flex items-center gap-2 self-start rounded-full bg-black/20 px-3 py-1 font-sans text-xs font-bold tracking-[0.18em] uppercase backdrop-blur-sm"
            style={rise(-0.5)}
          >
            <span className="size-2 rounded-full bg-volt" aria-hidden="true" />
            Session summary
          </h1>
          <p
            className="animate-rise font-display text-[clamp(2.5rem,12cqw,4.75rem)] leading-[0.9] font-bold tracking-tight break-words uppercase"
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

/**
 * App link at the bottom of the shared image. Hidden on the page (and from screen
 * readers); the capture reveals `[data-share-only]` in its clone.
 */
function ShareFooter() {
  return (
    <div
      data-share-only
      hidden
      aria-hidden="true"
      className="px-safe mx-auto mt-10 w-full max-w-2xl"
    >
      {/* Text only: a short court-green rule ties it to the hero without a second logo. */}
      <div className="flex flex-col items-center gap-1.5 border-t-[1.5px] border-base-300 pt-6 text-center">
        <span aria-hidden="true" className="mb-1.5 h-1 w-10 rounded-full bg-court" />
        <span className="text-[0.6875rem] leading-none font-bold tracking-[0.2em] text-base-content/55 uppercase">
          Made with BBQueue
        </span>
        <span className="font-display text-2xl leading-tight font-bold text-primary">
          {APP_URL_LABEL}
        </span>
      </div>
    </div>
  );
}
