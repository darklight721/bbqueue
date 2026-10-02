import { useId } from "react";
import { Link } from "wouter";
import { ChevronRightIcon, HistoryIcon } from "../../components/icons.tsx";
import { Screen } from "../../components/Screen.tsx";
import type { EndedSession } from "../../domain/types.ts";
import { useEndedSessions } from "../../storage/store.ts";
import { countLabel, rise, sessionDay, sessionTimes } from "../session-summary/summaryFormat.ts";

/** Every kept Ended session, newest first. Each row opens its details. */
export function PastSessionsScreen() {
  const sessions = useEndedSessions();
  return (
    <Screen title="Past sessions" backTo="/">
      {sessions.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-base-content/60">
            Newest first. The 50 most recent sessions are kept.
          </p>
          <ul className="flex flex-col gap-3">
            {sessions.map((ended, index) => (
              <li key={ended.id} className="animate-rise" style={rise(Math.min(index, 8) * 0.6)}>
                <SessionRow ended={ended} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </Screen>
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

function SessionRow({ ended }: { ended: EndedSession }) {
  const nameId = useId();
  const whenId = useId();
  const countsId = useId();
  return (
    <Link
      href={`/sessions/${ended.id}`}
      aria-labelledby={nameId}
      aria-describedby={`${whenId} ${countsId}`}
      className="group flex min-h-24 items-center gap-4 rounded-box border-[1.5px] border-base-300 bg-base-100 p-3 pr-3 shadow-sm transition-transform active:scale-[0.98]"
    >
      <DateTile at={ended.startedAt} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
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
function DateTile({ at }: { at: number }) {
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
