import type { CSSProperties } from "react";
import { Link, Redirect } from "wouter";
import { SkillBadge } from "../../components/SkillBadge.tsx";
import type { SessionSummary, TopWinner } from "../../domain/types.ts";
import { useSummary } from "../../storage/store.ts";
import { CourtLines } from "../home/CourtLines.tsx";
import {
  countLabel,
  formatSessionDuration,
  ordinal,
  sessionWhen,
  sharedPlaces,
} from "./summaryFormat.ts";

/** Gold / silver / bronze discs; the place number is always printed on them too. */
const MEDAL: Record<number, { bg: string; ring: string }> = {
  1: { bg: "#e9b949", ring: "#b8871c" },
  2: { bg: "#c4ccd3", ring: "#8b959e" },
  3: { bg: "#d39a6a", ring: "#9c6436" },
};

const rise = (step: number): CSSProperties => ({ animationDelay: `${120 + step * 70}ms` });

/** End-of-night screen: totals and the top winners. Persisted until the user goes Home. */
export function SessionSummaryScreen() {
  const summary = useSummary();
  if (!summary) return <Redirect to="/" replace />;
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

function Totals({ summary }: { summary: SessionSummary }) {
  const tiles = [
    { label: "Matches played", value: String(summary.totalMatches) },
    { label: "Players", value: String(summary.totalPlayers) },
    { label: "Duration", value: formatSessionDuration(summary.endedAt - summary.startedAt) },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3">
      {tiles.map((tile, index) => (
        <div
          key={tile.label}
          className={`animate-rise flex flex-col gap-1 rounded-box border-[1.5px] border-base-300 bg-base-100 px-4 py-4 shadow-md ${
            index === 2 ? "col-span-2" : ""
          }`}
          style={rise(2 + index * 0.5)}
        >
          <dt className="order-2 text-xs font-bold tracking-[0.14em] text-base-content/60 uppercase">
            {tile.label}
          </dt>
          <dd className="order-1 font-display text-5xl leading-none font-bold tabular-nums">
            {tile.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function TopWinners({ winners }: { winners: readonly TopWinner[] }) {
  const shared = sharedPlaces(winners);
  return (
    <section aria-labelledby="summary-winners" className="flex flex-col gap-3">
      <h2 id="summary-winners" className="font-display text-3xl uppercase">
        Top winners
      </h2>
      {winners.length === 0 ? (
        <p className="animate-rise rounded-box border-[1.5px] border-dashed border-base-300 px-4 py-6 text-center text-base-content/70">
          No scored matches
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {winners.map((winner, index) => (
            <WinnerRow
              key={`${winner.place}-${winner.name}`}
              winner={winner}
              joint={shared.has(winner.place)}
              step={4 + index * 0.6}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function WinnerRow({ winner, joint, step }: { winner: TopWinner; joint: boolean; step: number }) {
  const medal = MEDAL[winner.place] ?? MEDAL[3]!;
  const first = winner.place === 1;
  return (
    <li
      className={`animate-rise flex items-center gap-3 rounded-box border-[1.5px] bg-base-100 p-3 pr-4 ${
        first ? "border-transparent shadow-lg ring-2" : "border-base-300"
      }`}
      style={{
        ...rise(step),
        ...(first ? ({ "--tw-ring-color": medal.bg } as CSSProperties) : {}),
      }}
    >
      <span
        className={`grid shrink-0 place-items-center rounded-full font-display leading-none font-bold text-[#14201a] ${
          first ? "size-14 text-2xl" : "size-12 text-xl"
        }`}
        style={{ backgroundColor: medal.bg, boxShadow: `inset 0 0 0 3px ${medal.ring}` }}
      >
        <span>
          {joint ? <span className="sr-only">Joint </span> : null}
          {ordinal(winner.place)}
        </span>
      </span>

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-2">
          <span
            className={`truncate font-display leading-tight font-bold ${first ? "text-2xl" : "text-xl"}`}
          >
            {winner.name}
          </span>
          <SkillBadge skill={winner.skill} compact />
        </span>
        <span className="text-sm text-base-content/65">
          {joint ? <span aria-hidden="true">Joint {ordinal(winner.place)} · </span> : null}
          {countLabel(winner.played, "match", "matches")} played
        </span>
      </span>

      <span className="flex shrink-0 flex-col items-end">
        <span className="font-display text-3xl leading-none font-bold tabular-nums">
          {winner.wins}
        </span>
        <span className="text-xs font-semibold text-base-content/60 uppercase">
          {winner.wins === 1 ? "win" : "wins"}
        </span>
      </span>
    </li>
  );
}
