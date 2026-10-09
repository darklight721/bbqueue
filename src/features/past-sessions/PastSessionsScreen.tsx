import { useId, useMemo } from "react";
import { Link, Redirect, useLocation, useSearch } from "wouter";
import { ChevronRightIcon, HistoryIcon } from "../../components/icons.tsx";
import { Screen } from "../../components/Screen.tsx";
import { displayClubName } from "../../domain/clubName.ts";
import type { Club, EndedSession } from "../../domain/types.ts";
import { useClubs, useEndedSessions } from "../../storage/store.ts";
import { countLabel, rise, sessionDay, sessionTimes } from "../session-summary/summaryFormat.ts";
import {
  ALL_CLUBS,
  buildClubFilterOptions,
  CLUB_PARAM,
  filterByClub,
  hasClubFilter,
  parseClubFilter,
  pastSessionsPath,
  type ClubFilterOption,
} from "./clubFilter.ts";
import { detailsPath, filterOrigin, type SessionOrigin } from "./sessionOrigin.ts";

/**
 * Every kept Ended session, newest first, optionally filtered by Club (`?club=<id|none>`).
 * Each row opens its details.
 */
export function PastSessionsScreen() {
  const sessions = useEndedSessions();
  const clubs = useClubs();
  const search = useSearch();
  const [, navigate] = useLocation();
  const options = useMemo(() => buildClubFilterOptions(sessions, clubs), [sessions, clubs]);
  const showFilter = hasClubFilter(options);
  // Without a visible filter there'd be no way to undo it, so show everything.
  const filter = showFilter
    ? parseClubFilter(new URLSearchParams(search).get(CLUB_PARAM), options)
    : "";
  const shown = useMemo(() => filterByClub(sessions, filter), [sessions, filter]);

  return (
    <Screen title="Past sessions" backTo="/">
      {sessions.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex flex-col gap-5">
          {showFilter ? (
            <ClubFilter
              options={options}
              value={filter}
              onChange={(value) => navigate(pastSessionsPath(value), { replace: true })}
            />
          ) : null}
          <SessionList
            sessions={shown}
            clubs={clubs}
            origin={filterOrigin(filter)}
            // Filtered to one Club: the filter already names it, so rows don't repeat it.
            showClubName={filter === ALL_CLUBS}
          />
        </div>
      )}
    </Screen>
  );
}

/** `/clubs/:clubId/sessions`: the Ended sessions of one Club, no filter. */
export function ClubSessionsScreen({ clubId }: { clubId: string }) {
  const clubs = useClubs();
  const sessions = useEndedSessions();
  const club = clubs.find((candidate) => candidate.id === clubId);
  const own = useMemo(
    () => sessions.filter((ended) => ended.clubId === clubId),
    [sessions, clubId],
  );
  if (!club) return <Redirect to="/clubs" replace />;

  return (
    <Screen title={club.name} subtitle="Sessions" backTo={`/clubs/${encodeURIComponent(clubId)}`}>
      {own.length === 0 ? (
        <EmptyState />
      ) : (
        <SessionList
          sessions={own}
          clubs={clubs}
          origin={{ kind: "club", clubId }}
          showClubName={false}
        />
      )}
    </Screen>
  );
}

/**
 * Club filter: a native select, so it stays easy with many Clubs (the phone's own picker).
 * Highlighted while it narrows the list.
 */
function ClubFilter({
  options,
  value,
  onChange,
}: {
  options: readonly ClubFilterOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const active = value !== ALL_CLUBS;
  return (
    <div
      className={`animate-rise flex items-center gap-3 rounded-box border-[1.5px] py-2 pr-2 pl-4 transition-colors ${
        active ? "border-primary/40 bg-primary/10" : "border-base-300 bg-base-200/70"
      }`}
    >
      <label
        htmlFor={id}
        className={`shrink-0 text-xs font-bold tracking-[0.14em] uppercase ${
          active ? "text-primary" : "text-base-content/60"
        }`}
      >
        Club
      </label>
      <select
        id={id}
        className={`select min-w-0 flex-1 overflow-clip bg-base-100 pr-10 text-base font-semibold [overflow-clip-margin:content-box] ${
          active ? "border-primary text-primary" : "border-base-300"
        }`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function SessionList({
  sessions,
  clubs,
  origin,
  showClubName,
}: {
  sessions: readonly EndedSession[];
  clubs: readonly Club[];
  origin: SessionOrigin;
  showClubName: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3 px-1">
        {/* Announced when the Club filter changes the list. */}
        <p aria-live="polite" className="font-display text-2xl leading-none font-bold uppercase">
          {countLabel(sessions.length, "session", "sessions")}
        </p>
        <p className="text-sm font-semibold text-base-content/60">Newest first</p>
      </div>
      <ul className="flex flex-col gap-3">
        {sessions.map((ended, index) => (
          <li key={ended.id} className="animate-rise" style={rise(Math.min(index, 8) * 0.6)}>
            <SessionRow
              ended={ended}
              href={detailsPath(ended.id, origin)}
              clubName={showClubName ? displayClubName(ended.clubId, ended.clubName, clubs) : null}
            />
          </li>
        ))}
      </ul>
      <p className="px-6 pt-1 text-center text-xs text-base-content/55">
        The 50 most recent sessions are kept.
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-box border-[1.5px] border-dashed border-base-300 px-6 py-10 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-base-200 text-primary">
        <HistoryIcon className="size-7" />
      </span>
      <p className="font-display text-2xl font-bold uppercase">No past sessions yet</p>
      <p className="text-base-content/70">Sessions you end show up here.</p>
    </div>
  );
}

function SessionRow({
  ended,
  href,
  clubName,
}: {
  ended: EndedSession;
  href: string;
  clubName: string | null;
}) {
  const nameId = useId();
  const clubId = useId();
  const whenId = useId();
  const countsId = useId();
  return (
    <Link
      href={href}
      aria-labelledby={nameId}
      aria-describedby={`${clubName ? `${clubId} ` : ""}${whenId} ${countsId}`}
      className="group flex min-h-24 items-center gap-4 rounded-box border-[1.5px] border-base-300 bg-base-100 p-3 pr-3 shadow-sm transition-transform active:scale-[0.98]"
    >
      <DateTile at={ended.startedAt} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        {clubName ? (
          <span
            id={clubId}
            className="truncate text-xs leading-tight font-bold tracking-[0.12em] text-primary uppercase"
          >
            {clubName}
          </span>
        ) : null}
        <span
          id={nameId}
          className="truncate font-display text-2xl leading-tight font-bold uppercase"
        >
          {ended.name}
        </span>
        <span id={whenId} className="truncate text-sm text-base-content/65">
          <span aria-hidden="true">{weekday(ended.startedAt)}</span>
          <span className="sr-only">{sessionDay(ended.startedAt)}</span>
          {" · "}
          {sessionTimes(ended.startedAt, ended.endedAt)}
        </span>
        <span id={countsId} className="truncate text-sm font-semibold text-base-content/80">
          {countLabel(ended.matches.length, "match", "matches")} ·{" "}
          {countLabel(ended.players.length, "player", "players")}
        </span>
      </span>
      <ChevronRightIcon className="size-6 shrink-0 opacity-50 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

/** Calendar-style day block in court green; adds the year when it isn't this year. */
export function DateTile({ at }: { at: number }) {
  const date = new Date(at);
  const otherYear = date.getFullYear() !== new Date().getFullYear();
  return (
    <span
      aria-hidden="true"
      className="flex w-16 shrink-0 flex-col items-center justify-center self-stretch rounded-field bg-court py-2 text-line shadow-inner"
    >
      <span className="text-[0.7rem] leading-none font-bold tracking-[0.16em] uppercase opacity-80">
        {new Intl.DateTimeFormat(undefined, { month: "short" }).format(at)}
      </span>
      <span className="font-display text-4xl leading-none font-bold tabular-nums">
        {new Intl.DateTimeFormat(undefined, { day: "numeric" }).format(at)}
      </span>
      {otherYear ? (
        <span className="text-[0.7rem] leading-none font-semibold opacity-80">
          {date.getFullYear()}
        </span>
      ) : null}
    </span>
  );
}

function weekday(at: number): string {
  return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(at);
}
