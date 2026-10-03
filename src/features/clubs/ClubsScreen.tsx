import { useId, useMemo } from "react";
import { Link } from "wouter";
import { getBackend } from "../../backend/index.ts";
import { ChevronRightIcon, PlusIcon, UsersIcon } from "../../components/icons.tsx";
import { Screen } from "../../components/Screen.tsx";
import type { Club } from "../../domain/types.ts";
import { useClubs } from "../../storage/store.ts";
import { playerCountLabel, sortClubs } from "./clubList.ts";

/** List of Clubs; each row opens the Club for editing. */
export function ClubsScreen() {
  const clubs = useClubs();
  const sorted = useMemo(() => sortClubs(clubs), [clubs]);
  const empty = sorted.length === 0;

  return (
    <Screen title="Clubs" backTo="/" footer={empty ? undefined : <AddClubLink />}>
      {empty ? (
        <EmptyState />
      ) : (
        <ul className="flex flex-col gap-3">
          {sorted.map((club, index) => (
            <li key={club.id}>
              <ClubRow club={club} index={index} />
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}

function ClubRow({ club, index }: { club: Club; index: number }) {
  const nameId = useId();
  const countId = useId();
  // Without a backend every Club is on this device, so there is nothing to tell apart.
  const deviceOnly = club.kind === "local" && getBackend() !== null;
  const initial = club.name.trim().charAt(0).toLocaleUpperCase() || "?";
  return (
    <Link
      href={`/clubs/${club.id}`}
      aria-labelledby={nameId}
      aria-describedby={countId}
      className="animate-rise group flex min-h-20 items-center gap-4 rounded-box border-[1.5px] border-base-300 bg-base-100 p-4 pr-3 shadow-sm transition-transform active:scale-[0.98]"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <span
        aria-hidden="true"
        className="grid size-12 shrink-0 place-items-center rounded-full bg-primary/10 font-display text-2xl font-bold text-primary"
      >
        {initial}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span id={nameId} className="truncate font-display text-2xl leading-tight font-bold">
          {club.name}
        </span>
        <span id={countId} className="text-sm text-base-content/65">
          {playerCountLabel(club.players.length)}
        </span>
        {deviceOnly ? (
          <span className="text-xs font-semibold text-base-content/55">This device only</span>
        ) : null}
      </span>
      <ChevronRightIcon className="size-6 shrink-0 opacity-50 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function AddClubLink({ className = "" }: { className?: string }) {
  return (
    <Link href="/clubs/new" className={`btn btn-lg btn-primary w-full ${className}`}>
      <PlusIcon className="size-6" />
      Add club
    </Link>
  );
}

function EmptyState() {
  return (
    <section
      aria-labelledby="clubs-empty-title"
      className="animate-rise mt-4 flex flex-col items-center rounded-box border-[1.5px] border-dashed border-base-300 px-6 py-10 text-center"
    >
      <span
        aria-hidden="true"
        className="grid size-20 place-items-center rounded-full bg-primary/10 text-primary"
      >
        <UsersIcon className="size-10" />
      </span>
      <h2 id="clubs-empty-title" className="mt-5 font-display text-3xl uppercase">
        No clubs yet
      </h2>
      <p className="mt-2 max-w-xs text-base text-base-content/70">
        Add a club to keep its players ready for every session.
      </p>
      <AddClubLink className="mt-6 max-w-xs" />
    </section>
  );
}
