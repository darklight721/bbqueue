import { useId, useState, type CSSProperties, type ReactNode } from "react";
import { SkillBadge } from "../../components/SkillBadge.tsx";
import type { SessionSummary, StandingsEntry, TopWinner } from "../../domain/types.ts";
import { countLabel, formatSessionDuration, ordinal, rise } from "./summaryFormat.ts";

/**
 * Gold / silver / bronze discs for Top winners; the place number is always printed on them
 * too. Other places get a plain base-200 disc.
 */
const MEDAL: Record<number, { bg: string; ring: string }> = {
  1: { bg: "#e9b949", ring: "#b8871c" },
  2: { bg: "#c4ccd3", ring: "#8b959e" },
  3: { bg: "#d39a6a", ring: "#9c6436" },
};

/**
 * Matches, Players and Duration as three number tiles on one row at every width.
 * The list is its own size container: numbers, labels and spacing scale with its width
 * (so a 320px phone and the phone-width shared image both fit "12 h 45 min" on one line).
 * Duration gets a wider column since it holds the longest value.
 */
export function Totals({ summary }: { summary: SessionSummary }) {
  const tiles = [
    { label: "Matches", value: String(summary.totalMatches) },
    { label: "Players", value: String(summary.totalPlayers) },
    { label: "Duration", value: formatSessionDuration(summary.endedAt - summary.startedAt) },
  ];
  return (
    <dl className="@container grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)] gap-[clamp(0.5rem,2.5cqw,0.75rem)]">
      {tiles.map((tile, index) => (
        <div
          key={tile.label}
          className="animate-rise flex min-w-0 flex-col gap-1.5 rounded-box border-[1.5px] border-base-300 bg-base-100 px-[clamp(0.625rem,3.5cqw,1rem)] py-[clamp(0.75rem,4cqw,1rem)] shadow-md"
          style={rise(2 + index * 0.5)}
        >
          <dt className="order-2 truncate text-[clamp(0.5625rem,3.3cqw,0.75rem)] leading-none font-bold tracking-[0.08em] text-base-content/60 uppercase">
            {tile.label}
          </dt>
          <dd className="order-1 font-display text-[clamp(1.5rem,9.25cqw,3rem)] leading-none font-bold tracking-tight whitespace-nowrap tabular-nums">
            <TotalValue value={tile.value} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Numbers at full size, words ("h", "min", "Under") smaller so a duration fits its tile.
 * The text stays the same ("2 h 15 min"); only the look changes.
 */
function TotalValue({ value }: { value: string }) {
  const parts = value.split(/(\d+)/).filter((part) => part !== "");
  return parts.map((part, index) =>
    /^\d+$/.test(part) ? (
      <span key={index}>{part}</span>
    ) : (
      <span
        key={index}
        className="text-[0.46em] font-semibold tracking-normal whitespace-pre text-base-content/70"
      >
        {part}
      </span>
    ),
  );
}

/**
 * The Club's name on a court-green hero or banner: a short volt rule, then the name in small
 * spaced capitals. Long names wrap instead of being cut (it is also part of the shared image).
 */
export function ClubLine({
  name,
  className = "",
  style,
}: {
  name: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <p
      className={`flex items-start gap-2.5 leading-tight font-bold tracking-[0.12em] text-line uppercase ${className}`}
      style={style}
    >
      <span
        aria-hidden="true"
        className="mt-[calc(0.5lh-1.5px)] h-[3px] w-[1.1em] shrink-0 rounded-full bg-volt"
      />
      <span className="min-w-0 break-words">{name}</span>
    </p>
  );
}

export function TopWinners({ winners }: { winners: readonly TopWinner[] }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="font-display text-3xl uppercase">
        Top winners
      </h2>
      {winners.length === 0 ? (
        <p className="animate-rise rounded-box border-[1.5px] border-dashed border-base-300 px-4 py-6 text-center text-base-content/70">
          No scored matches
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {winners.map((winner, index) => (
            <PlaceRow
              key={`${winner.place}-${winner.name}`}
              entry={winner}
              style={rise(4 + index * 0.6)}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

/**
 * Every player who played, in place order (Ended session details). Open by default.
 * Only Top winners (3rd or better with a win) get a medal; everyone else a plain disc.
 */
export function Standings({
  standings,
  style,
}: {
  standings: readonly StandingsEntry[];
  style?: CSSProperties;
}) {
  return (
    <CollapsibleSection
      title="Standings"
      detail={countLabel(standings.length, "player", "players")}
      showLabel="Show standings"
      hideLabel="Hide standings"
      defaultOpen
      style={style}
    >
      {(listId, reopened) => (
        <ol id={listId} aria-label="Standings" className="flex flex-col gap-2">
          {standings.map((entry, index) => (
            <PlaceRow
              key={`${entry.place}-${entry.name}`}
              entry={entry}
              showLosses
              // Stagger the first few rows on page load; a reopened list comes in quickly.
              style={
                reopened
                  ? rise(-1.5 + Math.min(index, 6) * 0.3)
                  : rise(4 + Math.min(index, 6) * 0.4)
              }
            />
          ))}
        </ol>
      )}
    </CollapsibleSection>
  );
}

/**
 * Section with a title, a short detail and a Show/Hide button that folds its content away,
 * like History in the live session. Open/closed is not remembered between visits.
 */
export function CollapsibleSection({
  title,
  detail,
  showLabel,
  hideLabel,
  defaultOpen = false,
  style,
  children,
}: {
  title: string;
  detail: string;
  showLabel: string;
  hideLabel: string;
  defaultOpen?: boolean;
  style?: CSSProperties;
  /** Renders the content; give `contentId` to its root. `reopened` once the user has toggled. */
  children: (contentId: string, reopened: boolean) => ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [toggled, setToggled] = useState(false);
  const headingId = useId();
  const contentId = useId();
  return (
    <section aria-labelledby={headingId} className="animate-rise flex flex-col gap-3" style={style}>
      {/* Same look as SectionHeader, but the detail wraps under the title on narrow screens
          instead of being cut off by the wide Show/Hide button. */}
      <div className="flex min-h-12 items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3">
          <h2 id={headingId} className="font-display text-3xl uppercase">
            {title}
          </h2>
          <span className="text-sm font-semibold whitespace-nowrap text-base-content/60">
            {detail}
          </span>
        </div>
        <button
          type="button"
          className="btn shrink-0 btn-outline border-base-300"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => {
            setOpen(!open);
            setToggled(true);
          }}
        >
          {open ? hideLabel : showLabel}
          <svg
            viewBox="0 0 24 24"
            className={`size-5 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={2.25}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>
      {open ? children(contentId, toggled) : null}
    </section>
  );
}

/**
 * One placed player: place disc, name with Skill, matches played (plus losses when
 * `showLosses`) and wins. Medal colours only for 1st–3rd with at least one win.
 */
function PlaceRow({
  entry,
  showLosses = false,
  style,
}: {
  entry: StandingsEntry;
  showLosses?: boolean;
  style: CSSProperties;
}) {
  const medal = entry.wins >= 1 ? MEDAL[entry.place] : undefined;
  const first = medal !== undefined && entry.place === 1;
  return (
    <li
      className={`animate-rise flex items-center gap-3 rounded-box border-[1.5px] bg-base-100 p-3 pr-4 ${
        first ? "border-transparent shadow-lg ring-2" : "border-base-300"
      }`}
      style={{
        ...style,
        ...(first && medal ? ({ "--tw-ring-color": medal.bg } as CSSProperties) : {}),
      }}
    >
      <span
        className={`grid shrink-0 place-items-center rounded-full font-display leading-none font-bold ${
          first ? "size-14 text-2xl" : "size-12 text-xl"
        } ${medal ? "text-[#14201a]" : "bg-base-200 text-base-content/75"}`}
        style={
          medal
            ? { backgroundColor: medal.bg, boxShadow: `inset 0 0 0 3px ${medal.ring}` }
            : { boxShadow: "inset 0 0 0 1.5px var(--color-base-300)" }
        }
      >
        <span>{ordinal(entry.place)}</span>
      </span>

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-2">
          <span
            className={`truncate font-display leading-tight font-bold ${first ? "text-2xl" : "text-xl"}`}
          >
            {entry.name}
          </span>
          <SkillBadge skill={entry.skill} compact />
        </span>
        <span className="text-sm text-base-content/65">
          {/* Each part stays on one line, so a narrow row breaks between parts, not inside. */}
          <span className="whitespace-nowrap">
            {countLabel(entry.played, "match", "matches")} played{showLosses ? " ·" : null}
          </span>
          {showLosses ? (
            <>
              {" "}
              <span className="whitespace-nowrap">
                {countLabel(entry.losses, "loss", "losses")}
              </span>
            </>
          ) : null}
        </span>
      </span>

      <span className="flex shrink-0 flex-col items-end">
        <span className="font-display text-3xl leading-none font-bold tabular-nums">
          {entry.wins}
        </span>
        <span className="text-xs font-semibold text-base-content/60 uppercase">
          {entry.wins === 1 ? "win" : "wins"}
        </span>
      </span>
    </li>
  );
}
