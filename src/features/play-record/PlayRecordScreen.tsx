import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, Redirect, useSearch } from "wouter";
import { ChartIcon, ChevronRightIcon, UsersIcon } from "../../components/icons.tsx";
import { Avatar } from "../../components/Avatar.tsx";
import { Screen } from "../../components/Screen.tsx";
import { displayClubName } from "../../domain/clubName.ts";
import { initials } from "../../domain/initials.ts";
import {
  accountPlayRecord,
  accountPlayRecordTargets,
  BEST_PARTNER_MIN_TOGETHER,
  clubPlayRecord,
  type PlayPartner,
  type PlayRecord,
  type PlaySessionEntry,
} from "../../domain/playRecord.ts";
import { useAccount, useClubs, useEndedSessions } from "../../storage/store.ts";
import { CourtLines } from "../home/CourtLines.tsx";
import { DateTile } from "../past-sessions/PastSessionsScreen.tsx";
import { detailsPath, type SessionOrigin } from "../past-sessions/sessionOrigin.ts";
import { countLabel, MEDAL, ordinal, rise, sessionDay } from "../session-summary/summaryFormat.ts";
import { ClubLine } from "../session-summary/SummaryParts.tsx";
import { formatWinRate, winLoss, winLossWords } from "./format.ts";
import { clubStatsBackPath } from "./statsOrigin.ts";
import { WinRateChart } from "./WinRateChart.tsx";

/** How long a Session row stays highlighted after its dot is tapped. */
const HIGHLIGHT_MS = 2600;

/** `/clubs/:clubId/players/:clubPlayerId/stats`: one Club player's Play record in one Club. */
export function ClubStatsScreen({
  clubId,
  clubPlayerId,
}: {
  clubId: string;
  clubPlayerId: string;
}) {
  const sessions = useEndedSessions();
  const clubs = useClubs();
  const search = useSearch();
  const record = useMemo(
    () => clubPlayRecord(sessions, clubs, clubId, clubPlayerId),
    [sessions, clubs, clubId, clubPlayerId],
  );
  const backTo = clubStatsBackPath(search, clubId, sessions, clubs);
  const clubName = displayClubName(clubId, record.sessions[0]?.clubName ?? null, clubs);
  const origin = useMemo<SessionOrigin>(
    () => ({ kind: "playerStats", clubId, clubPlayerId }),
    [clubId, clubPlayerId],
  );

  return (
    <Screen title="Stats" backTo={backTo}>
      {record.name === null && record.sessions.length === 0 ? (
        <EmptyState title="No stats to show">
          There are no ended sessions for this player on this device.
        </EmptyState>
      ) : (
        <PlayRecordView
          record={record}
          name={record.name ?? "Player"}
          clubLine={clubName}
          origin={origin}
          emptyText={`${record.name ?? "This player"}'s stats show up here after they play in a session that ends.`}
        />
      )}
    </Screen>
  );
}

/** `/account/stats`: the signed-in Account's Play record, across every Club it is linked in. */
export function AccountStatsScreen() {
  const account = useAccount();
  const sessions = useEndedSessions();
  const clubs = useClubs();
  const accountId = account?.accountId ?? null;
  const targets = useMemo(
    () => (accountId ? accountPlayRecordTargets(clubs, accountId) : []),
    [clubs, accountId],
  );
  const record = useMemo(
    () => (accountId ? accountPlayRecord(sessions, clubs, accountId) : null),
    [sessions, clubs, accountId],
  );
  if (!account || !record) return <Redirect to="/account" replace />;

  const clubNames = [...new Set(targets.map((target) => target.clubId))]
    .map((clubId) => clubs.find((club) => club.id === clubId)?.name)
    .filter((name): name is string => Boolean(name));

  return (
    <Screen title="Your stats" backTo="/account">
      {targets.length === 0 ? (
        <EmptyState title="No stats yet">
          Your stats show up here once an Organizer adds you to their Club with your Account ID.
        </EmptyState>
      ) : (
        <PlayRecordView
          record={record}
          name={account.name}
          clubLine={clubNames.length > 0 ? clubNames.join(" · ") : null}
          origin={ACCOUNT_ORIGIN}
          emptyText="Your stats show up here after you play in a session that ends."
        />
      )}
    </Screen>
  );
}

const ACCOUNT_ORIGIN: SessionOrigin = { kind: "accountStats" };

/**
 * The Stats page itself, shared by the Club and Account views: header, headline numbers, Win rate
 * chart, Partners, the Session list, and a note on which Sessions count.
 */
function PlayRecordView({
  record,
  name,
  clubLine,
  origin,
  emptyText,
}: {
  record: PlayRecord;
  name: string;
  clubLine: string | null;
  /** Where the Session rows say they were opened from, so their Back returns here. */
  origin: SessionOrigin;
  /** Shown instead of the figures when there is no Ended session yet. */
  emptyText: string;
}) {
  const rowPrefix = useId();
  const [picked, setPicked] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const multiClub = new Set(record.sessions.map((entry) => entry.clubId)).size > 1;
  const rowId = (sessionId: string) => `${rowPrefix}-${sessionId}`;

  function pick(sessionId: string) {
    setPicked(sessionId);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setPicked(null), HIGHLIGHT_MS);
    const row = document.getElementById(rowId(sessionId));
    const link = row?.querySelector<HTMLElement>("a");
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    row?.scrollIntoView?.({ behavior: still ? "auto" : "smooth", block: "center" });
    link?.focus({ preventScroll: true });
  }

  return (
    <>
      <Header name={name} clubLine={clubLine} />
      {record.sessions.length === 0 ? (
        <EmptyState title="No stats yet">{emptyText}</EmptyState>
      ) : (
        <>
          <Headline record={record} />
          <WinRateChart
            sessions={record.sessions}
            overall={record.totals.winRate}
            picked={picked}
            onPick={pick}
            style={rise(3.5)}
          />
          <Partners partners={record.partners} showClub={multiClub} />
          <SessionList
            sessions={record.sessions}
            showClub={multiClub}
            picked={picked}
            rowId={rowId}
            origin={origin}
          />
        </>
      )}
      <p className="px-6 text-center text-xs leading-snug text-base-content/55">
        Only sessions ended since Stats were added count. Older sessions aren't included.
      </p>
    </>
  );
}

/** Court-green card: who these Stats are about, and in which Club (or Clubs). */
function Header({ name, clubLine }: { name: string; clubLine: string | null }) {
  const nameId = useId();
  return (
    <section
      aria-labelledby={nameId}
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
      <CourtLines className="absolute top-1/2 right-[-34%] -z-10 w-[85%] max-w-none -translate-y-1/2 rotate-[12deg] text-line/20" />

      <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-black/20 px-3 py-1 text-xs font-bold tracking-[0.18em] uppercase">
        <span className="size-2 rounded-full bg-volt" aria-hidden="true" />
        Stats
      </p>
      <div className="flex items-center gap-4">
        <Avatar name={name} size="lg" />
        <h2
          id={nameId}
          className="min-w-0 font-display text-4xl leading-none font-bold break-words uppercase"
        >
          {name}
        </h2>
      </div>
      {clubLine ? <ClubLine name={clubLine} className="mt-4 text-sm" /> : null}
    </section>
  );
}

/**
 * Matches · Wins · Losses on one row, then Win rate (wider, with a bar) and Sessions.
 * One size container, so numbers scale with the column like the Session summary's.
 */
function Headline({ record }: { record: PlayRecord }) {
  const { totals } = record;
  const tiles: { label: string; value: string; wide?: boolean }[] = [
    { label: "Matches", value: String(totals.played) },
    { label: "Wins", value: String(totals.wins) },
    { label: "Losses", value: String(totals.losses) },
    { label: "Win rate", value: formatWinRate(totals.winRate), wide: true },
    { label: "Sessions", value: String(totals.sessions) },
  ];
  return (
    // auto-rows-fr: both rows, and so every tile, are the same height.
    <dl className="@container grid auto-rows-fr grid-cols-6 gap-[clamp(0.5rem,2.5cqw,0.875rem)]">
      {tiles.map((tile, index) => (
        <div
          key={tile.label}
          className={`animate-rise relative flex min-w-0 flex-col justify-between gap-2 rounded-box border-[1.5px] border-base-300 bg-base-100 px-[clamp(0.75rem,3.5cqw,1.25rem)] py-[clamp(0.75rem,3.5cqw,1.125rem)] shadow-sm ${
            tile.wide
              ? "col-span-4 pr-[calc(clamp(2.75rem,14cqw,4rem)+clamp(1rem,5cqw,1.75rem))]"
              : "col-span-2"
          }`}
          style={rise(1 + index * 0.35)}
        >
          <dt className="order-2 text-[clamp(0.6875rem,3cqw,0.8125rem)] leading-tight font-bold tracking-[0.08em] text-base-content/60 uppercase">
            {tile.label}
          </dt>
          <dd
            className={`order-1 font-display text-[clamp(2rem,10cqw,3.25rem)] leading-none font-bold tracking-tight tabular-nums ${
              tile.wide ? "text-primary" : ""
            }`}
          >
            {tile.value}
            {tile.wide ? <RateRing rate={totals.winRate} /> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The Win rate as a small donut on the right of its tile (the number next to it carries the
 * value). With no Win rate it is an empty dashed ring, like the chart's "No win or loss", not 0%.
 */
function RateRing({ rate }: { rate: number | null }) {
  // r = 100 / 2π, so the circumference is 100 and the dash length is the percentage.
  const r = 15.9155;
  const percent = rate === null ? 0 : Math.round(rate * 1000) / 10;
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 38 38"
      className="absolute top-1/2 right-[clamp(0.75rem,3.5cqw,1.25rem)] size-[clamp(2.75rem,14cqw,4rem)] -translate-y-1/2 -rotate-90"
    >
      <circle
        cx="19"
        cy="19"
        r={r}
        className={`fill-none ${rate === null ? "stroke-base-content/30" : "stroke-base-300"}`}
        strokeWidth={rate === null ? 2.5 : 6}
        strokeDasharray={rate === null ? "3.2 3.05" : undefined}
      />
      {rate !== null && percent > 0 ? (
        <circle
          cx="19"
          cy="19"
          r={r}
          className="fill-none stroke-primary"
          strokeWidth={6}
          strokeDasharray={`${percent} ${100 - percent}`}
        />
      ) : null}
    </svg>
  );
}

function Partners({ partners, showClub }: { partners: PlayRecord["partners"]; showClub: boolean }) {
  const headingId = useId();
  const clubs = useClubs();
  const { mostFrequent, best } = partners;
  // Partners only carry their Club id; show the Club's current name.
  const clubOf = (partner: PlayPartner) =>
    showClub ? (clubs.find((club) => club.id === partner.clubId)?.name ?? null) : null;
  return (
    <section
      aria-labelledby={headingId}
      className="animate-rise flex flex-col gap-3"
      style={rise(5)}
    >
      <div className="flex min-h-12 items-center">
        <h2 id={headingId} className="font-display text-3xl uppercase">
          Partners
        </h2>
      </div>
      {mostFrequent === null ? (
        <p className="rounded-box border-[1.5px] border-dashed border-base-300 px-4 py-6 text-center text-base-content/70">
          No Partners to show yet. Guests who weren't saved to the Club don't count.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <PartnerCard
            caption="Most frequent"
            partner={mostFrequent}
            clubName={clubOf(mostFrequent)}
            value={String(mostFrequent.together)}
            unit="together"
            detail={`${winLoss(mostFrequent.wins, mostFrequent.losses)} · ${formatWinRate(mostFrequent.winRate)} win rate`}
          />
          {best ? (
            <PartnerCard
              caption="Best"
              partner={best}
              clubName={clubOf(best)}
              value={formatWinRate(best.winRate)}
              unit="win rate"
              detail={`${winLoss(best.wins, best.losses)} · ${countLabel(best.together, "match", "matches")} together`}
            />
          ) : (
            <div className="flex flex-col justify-center gap-1 rounded-box border-[1.5px] border-dashed border-base-300 px-4 py-4">
              <p className="text-xs font-bold tracking-[0.12em] text-primary uppercase">Best</p>
              <p className="leading-snug text-base-content/70">
                No Best partner yet. It takes {BEST_PARTNER_MIN_TOGETHER} matches together, at least
                one with a score.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function PartnerCard({
  caption,
  partner,
  clubName,
  value,
  unit,
  detail,
}: {
  caption: string;
  partner: PlayPartner;
  /** Shown when the Stats span more than one Club. */
  clubName: string | null;
  /** The big number on the right. */
  value: string;
  unit: string;
  detail: string;
}) {
  const letters = initials(partner.name);
  return (
    <article
      aria-label={`${caption} partner`}
      className="flex items-center gap-3 rounded-box border-[1.5px] border-base-300 bg-base-100 p-3 pr-4 shadow-sm"
    >
      <span
        aria-hidden="true"
        className="grid size-12 shrink-0 place-items-center rounded-full bg-base-200 font-display text-xl leading-none font-bold text-base-content/75 shadow-[inset_0_0_0_1.5px_var(--color-base-300)]"
      >
        {letters || <UsersIcon className="size-5" />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-xs leading-tight font-bold tracking-[0.12em] text-primary uppercase">
          {caption}
        </span>
        <span className="truncate font-display text-xl leading-tight font-bold">
          {partner.name}
        </span>
        {clubName ? (
          <span className="truncate text-xs font-semibold text-base-content/60">{clubName}</span>
        ) : null}
        <span className="truncate text-sm text-base-content/65">{detail}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end">
        <span className="font-display text-3xl leading-none font-bold tabular-nums">{value}</span>
        <span className="text-xs font-semibold text-base-content/60 uppercase">{unit}</span>
      </span>
    </article>
  );
}

function SessionList({
  sessions,
  showClub,
  picked,
  rowId,
  origin,
}: {
  sessions: readonly PlaySessionEntry[];
  showClub: boolean;
  picked: string | null;
  rowId: (sessionId: string) => string;
  origin: SessionOrigin;
}) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="animate-rise flex flex-col gap-3"
      style={rise(6)}
    >
      <div className="flex min-h-12 flex-wrap items-baseline gap-x-3">
        <h2 id={headingId} className="font-display text-3xl uppercase">
          Sessions
        </h2>
        <span className="text-sm font-semibold text-base-content/60">
          {countLabel(sessions.length, "session", "sessions")} · newest first
        </span>
      </div>
      <ol aria-labelledby={headingId} className="flex flex-col gap-2.5">
        {sessions.map((entry) => (
          <li key={entry.sessionId} id={rowId(entry.sessionId)} className="scroll-mt-24">
            <SessionRow
              entry={entry}
              clubName={showClub ? entry.clubName : null}
              highlighted={picked === entry.sessionId}
              href={detailsPath(entry.sessionId, origin)}
            />
          </li>
        ))}
      </ol>
    </section>
  );
}

function SessionRow({
  entry,
  clubName,
  highlighted,
  href,
}: {
  entry: PlaySessionEntry;
  clubName: string | null;
  highlighted: boolean;
  href: string;
}) {
  const medal = entry.wins >= 1 ? MEDAL[entry.place] : undefined;
  const label =
    `${sessionDay(entry.startedAt)}${clubName ? `, ${clubName}` : ""}: ` +
    `${winLossWords(entry.wins, entry.losses)}` +
    (entry.place > 0 ? `, ${ordinal(entry.place)} place` : "");
  return (
    <Link
      href={href}
      aria-label={label}
      data-highlighted={highlighted || undefined}
      className={`group flex min-h-22 items-center gap-3 rounded-box border-[1.5px] p-3 pr-2 shadow-sm transition-[transform,background-color,border-color,box-shadow] duration-300 active:scale-[0.98] ${
        highlighted
          ? "border-primary bg-primary/8 shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-primary)_25%,transparent)]"
          : "border-base-300 bg-base-100"
      }`}
    >
      <DateTile at={entry.startedAt} />
      <span aria-hidden="true" className="flex min-w-0 flex-1 flex-col gap-0.5">
        {clubName ? (
          <span className="truncate text-xs leading-tight font-bold tracking-[0.12em] text-primary uppercase">
            {clubName}
          </span>
        ) : null}
        <span className="flex items-baseline gap-2">
          <span className="font-display text-3xl leading-none font-bold tabular-nums">
            {winLoss(entry.wins, entry.losses)}
          </span>
          <span className="text-xs font-bold tracking-[0.08em] text-base-content/55 uppercase">
            W–L
          </span>
        </span>
        <span className="truncate text-sm text-base-content/65">
          {countLabel(entry.played, "match", "matches")}
          {entry.winRate !== null ? ` · ${formatWinRate(entry.winRate)}` : null}
        </span>
      </span>
      {entry.place > 0 ? (
        <span aria-hidden="true" className="flex shrink-0 flex-col items-center gap-1">
          <span
            className={`grid size-11 place-items-center rounded-full font-display text-lg leading-none font-bold ${
              medal ? "text-[#14201a]" : "bg-base-200 text-base-content/75"
            }`}
            style={
              medal
                ? { backgroundColor: medal.bg, boxShadow: `inset 0 0 0 3px ${medal.ring}` }
                : { boxShadow: "inset 0 0 0 1.5px var(--color-base-300)" }
            }
          >
            {ordinal(entry.place)}
          </span>
          <span className="text-[0.65rem] leading-none font-bold tracking-[0.08em] text-base-content/55 uppercase">
            Place
          </span>
        </span>
      ) : null}
      <ChevronRightIcon className="size-6 shrink-0 opacity-50 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      className="animate-rise flex flex-col items-center gap-3 rounded-box border-[1.5px] border-dashed border-base-300 px-6 py-10 text-center"
      style={rise(1)}
    >
      <span className="grid size-14 place-items-center rounded-full bg-base-200 text-primary">
        <ChartIcon className="size-7" />
      </span>
      <p className="font-display text-2xl font-bold uppercase">{title}</p>
      <p className="text-base-content/70">{children}</p>
    </div>
  );
}
