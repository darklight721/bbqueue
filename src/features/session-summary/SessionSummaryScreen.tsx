import { useMemo, useRef, type SVGProps } from "react";
import { Link, Redirect } from "wouter";
import { BrandMark, Wordmark } from "../../components/BrandMark.tsx";
import { WarningIcon } from "../../components/icons.tsx";
import type { SessionSummary } from "../../domain/types.ts";
import { buildSummary } from "../../domain/engine/index.ts";
import { useEndedSessions } from "../../storage/store.ts";
import { CourtLines } from "../home/CourtLines.tsx";
import { summaryFileName, useShareSummary } from "./shareSummary.ts";
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
          href="/"
          className="btn btn-lg btn-outline animate-rise mt-3 w-full border-base-300 bg-base-100"
          style={rise(6.5)}
        >
          Home
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

/** Box with an arrow leaving it: the usual "share" glyph. */
function ShareIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M12 3.5v11M7.75 7.5 12 3.25l4.25 4.25" />
      <path d="M8 10.5H6.5A1.5 1.5 0 0 0 5 12v7a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-7a1.5 1.5 0 0 0-1.5-1.5H16" />
    </svg>
  );
}
