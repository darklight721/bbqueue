import { useId, useMemo, type ReactNode, type Ref } from "react";
import { Link } from "wouter";
import { ChevronRightIcon, PencilIcon, UserIcon } from "../../components/icons.tsx";
import { SkillBadge } from "../../components/SkillBadge.tsx";
import { initials } from "../../domain/initials.ts";
import { ownRow } from "../../domain/permissions.ts";
import { clubRosterFigures, type RosterFigures } from "../../domain/playRecord.ts";
import { SKILL_LABEL, type Club, type ClubPlayer } from "../../domain/types.ts";
import { useEndedSessions } from "../../storage/store.ts";
import { formatWinRate } from "../play-record/format.ts";
import { clubStatsFromClubPagePath } from "../play-record/paths.ts";
import { countLabel } from "../session-summary/summaryFormat.ts";
import { editPlayersPath, OVER_CLUB_PAGE_STATE } from "./clubPaths.ts";

/** "Players" with the count, and the section's one action (Edit). */
export function PlayersHeading({
  id,
  count,
  action,
  note,
}: {
  id: string;
  count: number;
  action?: ReactNode;
  /** A line under the heading. */
  note?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex min-h-10 items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h2 id={id} className="font-display text-2xl uppercase">
            Players
          </h2>
          <span className="text-sm font-semibold text-base-content/60 tabular-nums">
            {count === 0 ? "None yet" : count}
          </span>
        </div>
        {action}
      </div>
      {note ? <p className="text-sm text-base-content/65">{note}</p> : null}
    </div>
  );
}

/** The Players heading's Edit: opens Edit players. */
export function EditPlayersLink({
  club,
  linkRef,
}: {
  club: Club;
  linkRef?: Ref<HTMLAnchorElement>;
}) {
  return (
    <Link
      ref={linkRef}
      href={editPlayersPath(club.id)}
      state={OVER_CLUB_PAGE_STATE}
      className="btn h-10 min-h-10 gap-1.5 rounded-full border-base-300 px-4 btn-outline"
      aria-label="Edit players"
    >
      <PencilIcon className="size-4" />
      Edit
    </Link>
  );
}

/**
 * The roster to read: one card, rows ruled off, sorted by name. Each row opens that Club player's
 * Stats. The viewer's own row says "You"; Organizers are named; Account IDs aren't shown.
 */
export function RosterList({
  club,
  viewer,
  emptyNote,
}: {
  club: Club;
  viewer: string | undefined;
  emptyNote: ReactNode;
}) {
  const endedSessions = useEndedSessions();
  const figures = useMemo(
    () => clubRosterFigures(endedSessions, club.id),
    [endedSessions, club.id],
  );
  const rows = useMemo(
    () =>
      [...club.players].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      ),
    [club.players],
  );
  const mine = ownRow(club, viewer);

  if (rows.length === 0) {
    return (
      <p className="rounded-box border-[1.5px] border-dashed border-base-300 px-4 py-6 text-center text-base-content/70">
        {emptyNote}
      </p>
    );
  }
  return (
    <ul className="divide-y divide-base-300 overflow-hidden rounded-box border-[1.5px] border-base-300 bg-base-100">
      {rows.map((row) => (
        <li key={row.id}>
          <RosterRow
            clubId={club.id}
            row={row}
            isMine={row.id === mine?.id}
            organizer={club.kind === "shared" && row.link?.role === "organizer"}
            figures={figures.get(row.id) ?? null}
          />
        </li>
      ))}
    </ul>
  );
}

/** "12 matches · 58%", or "3 matches" with no win or loss yet. */
function figuresLine(figures: RosterFigures): string {
  const matches = countLabel(figures.played, "match", "matches");
  return figures.winRate === null ? matches : `${matches} · ${formatWinRate(figures.winRate)}`;
}

function RosterRow({
  clubId,
  row,
  isMine,
  organizer,
  figures,
}: {
  clubId: string;
  row: ClubPlayer;
  isMine: boolean;
  organizer: boolean;
  /** Null: no Ended match yet, so a single line. */
  figures: RosterFigures | null;
}) {
  const nameId = useId();
  const detailId = useId();
  const letters = initials(row.name);
  return (
    <Link
      href={clubStatsFromClubPagePath(clubId, row.id)}
      aria-labelledby={nameId}
      aria-describedby={detailId}
      className={`group relative flex min-h-16 items-center gap-3 py-2.5 pr-2 pl-4 transition-colors active:bg-base-200 ${
        isMine ? "bg-primary/[0.07]" : ""
      }`}
    >
      {isMine ? (
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-primary" />
      ) : null}
      <span
        aria-hidden="true"
        className="grid size-10 shrink-0 place-items-center rounded-full bg-base-200 font-display text-lg leading-none font-bold text-base-content/75 shadow-[inset_0_0_0_1.5px_var(--color-base-300)]"
      >
        {letters || <UserIcon className="size-5" />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span id={nameId} className="truncate text-lg leading-tight font-semibold">
            {row.name}
          </span>
          {isMine ? (
            <span
              aria-hidden="true"
              className="badge shrink-0 badge-sm badge-neutral font-semibold"
            >
              You
            </span>
          ) : null}
        </span>
        {organizer || figures ? (
          <span
            aria-hidden="true"
            className="flex min-w-0 items-center gap-2 text-sm text-base-content/60"
          >
            {organizer ? (
              <span className="shrink-0 text-xs font-semibold tracking-wide text-base-content/55 uppercase">
                Organizer
              </span>
            ) : null}
            {organizer && figures ? <span aria-hidden="true">·</span> : null}
            {figures ? <span className="truncate tabular-nums">{figuresLine(figures)}</span> : null}
          </span>
        ) : null}
      </span>
      <SkillBadge skill={row.skill} compact />
      <ChevronRightIcon className="size-6 shrink-0 opacity-50 transition-transform group-hover:translate-x-0.5" />
      {/* What the row says besides the name, read as its description. */}
      <span id={detailId} className="sr-only">
        {[
          isMine ? "You" : null,
          organizer ? "Organizer" : null,
          figures ? figuresLine(figures) : null,
          SKILL_LABEL[row.skill],
        ]
          .filter(Boolean)
          .join(", ")}
      </span>
    </Link>
  );
}
