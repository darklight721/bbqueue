import { useId, type CSSProperties } from "react";
import type { PlaySessionEntry } from "../../domain/playRecord.ts";
import { countLabel, sessionDay } from "../session-summary/summaryFormat.ts";
import { formatWinRate, shortDay, winLossWords } from "./format.ts";

/** How many Sessions the chart shows, oldest on the left. */
export const CHART_SESSIONS = 20;

/** Plot height in px (0% to 100%). */
const PLOT = 152;
/** Room above 100% so a full dot isn't cut off. */
const TOP = 14;
/** Strip under 0% for Sessions with no win or loss (gaps in the line, not 0%). */
const LANE = 30;
/** Dot diameters in px: the most matches in the chart get the biggest. */
const DOT_MIN = 10;
const DOT_MAX = 22;

/** Position of a Win rate inside the plot, in px from the top. */
const yOf = (rate: number) => TOP + (1 - rate) * PLOT;

/**
 * Win rate per Session as a hand-drawn line: one dot per Session, sized by its matches. A Session
 * with no win or loss sits in a strip below the plot and breaks the line. The dashed line is the
 * overall Win rate. Dots are buttons: tapping one shows that Session in the list below.
 */
export function WinRateChart({
  sessions,
  overall,
  picked,
  onPick,
  style,
}: {
  /** Newest first, as in the Play record. */
  sessions: readonly PlaySessionEntry[];
  overall: number | null;
  picked: string | null;
  onPick: (sessionId: string) => void;
  style?: CSSProperties;
}) {
  const headingId = useId();
  const shown = sessions.slice(0, CHART_SESSIONS).reverse();
  const count = shown.length;
  const maxPlayed = Math.max(1, ...shown.map((entry) => entry.played));
  const hasGaps = shown.some((entry) => entry.winRate === null);
  const height = TOP + PLOT + (hasGaps ? LANE : 12);
  // Column centres in the 0–100 viewBox (and in % of the plot's width).
  const xOf = (index: number) => ((index + 0.5) / count) * 100;
  const runs = lineRuns(shown, xOf);
  const sizes = shown.map(
    (entry) => DOT_MIN + (DOT_MAX - DOT_MIN) * Math.sqrt(entry.played / maxPlayed),
  );

  return (
    <section aria-labelledby={headingId} className="animate-rise flex flex-col gap-3" style={style}>
      <div className="flex min-h-12 flex-wrap items-baseline gap-x-3">
        <h2 id={headingId} className="font-display text-3xl uppercase">
          Win rate
        </h2>
        <span className="text-sm font-semibold text-base-content/60">
          {count === 1 ? "1 session" : `Last ${countLabel(count, "session", "sessions")}`}
        </span>
      </div>

      <div className="rounded-box border-[1.5px] border-base-300 bg-base-100 px-3 pt-3 pb-4 shadow-sm">
        <div className="flex gap-2">
          {/* Y axis */}
          <div aria-hidden="true" className="relative w-9 shrink-0" style={{ height }}>
            {[1, 0.5, 0].map((rate) => (
              <span
                key={rate}
                className="absolute right-0 -translate-y-1/2 text-[0.7rem] leading-none font-semibold text-base-content/55 tabular-nums"
                style={{ top: yOf(rate) }}
              >
                {Math.round(rate * 100)}%
              </span>
            ))}
            {hasGaps ? (
              <span
                className="absolute right-0 -translate-y-1/2 text-sm leading-none font-bold text-base-content/45"
                style={{ top: TOP + PLOT + LANE / 2 + 2 }}
              >
                –
              </span>
            ) : null}
          </div>

          {/* Plot */}
          <div className="relative min-w-0 flex-1" style={{ height }}>
            {[1, 0.5, 0].map((rate) => (
              <div
                key={rate}
                aria-hidden="true"
                className={`absolute inset-x-0 border-t ${
                  rate === 0 ? "border-base-content/25" : "border-base-300"
                }`}
                style={{ top: yOf(rate) }}
              />
            ))}
            {hasGaps ? (
              <div
                aria-hidden="true"
                className="absolute inset-x-0 rounded-field bg-base-200/70"
                style={{ top: TOP + PLOT + 6, height: LANE - 4 }}
              />
            ) : null}
            {overall !== null ? (
              <div
                aria-hidden="true"
                data-testid="overall-line"
                className="absolute inset-x-0 border-t-2 border-dashed border-base-content/45"
                style={{ top: yOf(overall) - 1 }}
              />
            ) : null}

            <svg
              aria-hidden="true"
              className="absolute inset-x-0 overflow-visible text-primary"
              style={{ top: TOP, height: PLOT, width: "100%" }}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              {runs.map((run, index) =>
                run.length > 1 ? (
                  <g key={index}>
                    <path
                      d={`M${run[0]!.x},100 ${run.map((p) => `L${p.x},${p.y}`).join(" ")} L${run.at(-1)!.x},100Z`}
                      className="fill-current opacity-[0.12]"
                    />
                    <path
                      d={`M${run.map((p) => `${p.x},${p.y}`).join(" L")}`}
                      className="fill-none stroke-current"
                      strokeWidth={2.5}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                ) : null,
              )}
            </svg>

            {/* One tall tap column per Session, with its dot inside. */}
            <div role="group" aria-label="Win rate per session" className="absolute inset-0">
              {shown.map((entry, index) => {
                const size = sizes[index]!;
                const isPicked = picked === entry.sessionId;
                const top = entry.winRate === null ? TOP + PLOT + LANE / 2 + 2 : yOf(entry.winRate);
                return (
                  <button
                    key={entry.sessionId}
                    type="button"
                    aria-label={`${sessionDay(entry.startedAt)}: ${winLossWords(entry.wins, entry.losses)}, ${countLabel(entry.played, "match", "matches")}`}
                    className="group absolute top-0 bottom-0 cursor-pointer rounded-field transition-colors hover:bg-base-200/50 active:bg-primary/10"
                    style={{ left: `${(index / count) * 100}%`, width: `${100 / count}%` }}
                    onClick={() => onPick(entry.sessionId)}
                  >
                    <span
                      aria-hidden="true"
                      className={`absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform duration-200 group-active:scale-90 ${
                        entry.winRate === null
                          ? "border-2 border-dashed border-base-content/50 bg-base-100"
                          : "bg-primary shadow-[0_0_0_3px_var(--color-base-100)]"
                      } ${isPicked ? "scale-125 outline-2 outline-offset-2 outline-primary" : ""}`}
                      style={{ top, width: size, height: size }}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* X axis: the oldest and newest day shown. */}
        <div
          aria-hidden="true"
          className="mt-1.5 ml-11 flex justify-between text-[0.7rem] font-semibold text-base-content/55 tabular-nums"
        >
          {count === 1 ? (
            <span className="mx-auto">{shortDay(shown[0]!.startedAt)}</span>
          ) : (
            <>
              <span>{shortDay(shown[0]!.startedAt)}</span>
              <span>{shortDay(shown.at(-1)!.startedAt)}</span>
            </>
          )}
        </div>

        <Legend overall={overall} hasGaps={hasGaps} />
      </div>
    </section>
  );
}

function Legend({ overall, hasGaps }: { overall: number | null; hasGaps: boolean }) {
  return (
    <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-base-300 pt-3 text-xs font-semibold text-base-content/70">
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="flex items-center gap-0.5">
          <span className="size-1.5 rounded-full bg-primary" />
          <span className="size-3 rounded-full bg-primary" />
        </span>
        Bigger dot, more matches
      </li>
      {overall !== null ? (
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="w-5 border-t-2 border-dashed border-base-content/45"
          />
          Overall {formatWinRate(overall)}
        </li>
      ) : null}
      {hasGaps ? (
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-3 rounded-full border-2 border-dashed border-base-content/50"
          />
          No win or loss
        </li>
      ) : null}
      <li className="text-base-content/55">Tap a dot to find it below</li>
    </ul>
  );
}

/** The line's unbroken stretches: consecutive Sessions that have a Win rate. */
function lineRuns(
  shown: readonly PlaySessionEntry[],
  xOf: (index: number) => number,
): { x: number; y: number }[][] {
  const runs: { x: number; y: number }[][] = [[]];
  shown.forEach((entry, index) => {
    if (entry.winRate === null) {
      if (runs.at(-1)!.length > 0) runs.push([]);
      return;
    }
    runs.at(-1)!.push({ x: round(xOf(index)), y: round((1 - entry.winRate) * 100) });
  });
  return runs.filter((run) => run.length > 0);
}

const round = (value: number) => Math.round(value * 100) / 100;
