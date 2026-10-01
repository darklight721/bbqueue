import { useId, useState } from "react";
import { ConfirmDialog } from "../../../components/ConfirmDialog.tsx";
import { PlayIcon, RefreshIcon } from "../../../components/icons.tsx";
import type { Court, Match } from "../../../domain/types.ts";
import { useSessionActions, useSessionView } from "../context.ts";
import { TeamsView } from "../PlayerViews.tsx";
import { teamNames } from "../teams.ts";
import { MatchTimer } from "./MatchTimer.tsx";
import { ScoreDialog } from "./ScoreDialog.tsx";

/** One Court: Busy (solid header, live timer, End match) or Idle (Lineup, Start match). */
export function CourtCard({ court }: { court: Court }) {
  const { session } = useSessionView();
  const match = court.activeMatchId
    ? (session.matches.find((candidate) => candidate.id === court.activeMatchId) ?? null)
    : null;
  return match ? <BusyCourt court={court} match={match} /> : <IdleCourt court={court} />;
}

function BusyCourt({ court, match }: { court: Court; match: Match }) {
  const { session, playerById } = useSessionView();
  const actions = useSessionActions();
  const headingId = useId();
  const [scoring, setScoring] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col overflow-hidden rounded-box border-2 border-primary bg-base-100 shadow-md"
    >
      <header className="flex items-center gap-3 bg-primary px-4 py-3 text-primary-content">
        <h3 id={headingId} className="font-display text-3xl uppercase">
          Court {court.number}
        </h3>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-black/20 px-2.5 py-0.5 text-xs font-bold tracking-wider uppercase">
          <span className="size-2 animate-pulse rounded-full bg-volt" aria-hidden="true" />
          Playing
        </span>
        <MatchTimer
          startedAt={match.startedAt}
          className="ml-auto font-display text-3xl font-bold"
        />
      </header>

      <div className="flex-1 p-4">
        <TeamsView teams={match.teams} />
      </div>

      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 px-4">
        <button
          type="button"
          className="btn btn-lg btn-outline border-base-300"
          onClick={() => setConfirmRemove(true)}
        >
          Remove match
        </button>
        <button type="button" className="btn btn-lg btn-secondary" onClick={() => setScoring(true)}>
          End match
        </button>
      </div>

      <RemoveCourtRow courtId={court.id} busy />

      <ScoreDialog
        open={scoring}
        courtNumber={court.number}
        teamLabels={[teamNames(match.teams[0], playerById), teamNames(match.teams[1], playerById)]}
        pointSystem={session.pointSystem}
        onSave={(score) => {
          if (actions.endMatch(match.id, score)) setScoring(false);
        }}
        onEndWithoutScore={() => {
          if (actions.endMatch(match.id, null)) setScoring(false);
        }}
        onCancel={() => setScoring(false)}
      />
      <ConfirmDialog
        open={confirmRemove}
        title="Remove this match?"
        message="It won't count."
        confirmLabel="Remove match"
        tone="danger"
        onConfirm={() => {
          setConfirmRemove(false);
          actions.removeMatch(match.id);
        }}
        onCancel={() => setConfirmRemove(false)}
      />
    </section>
  );
}

function IdleCourt({ court }: { court: Court }) {
  const actions = useSessionActions();
  const headingId = useId();
  const lineup = court.lineup;
  const lineupKey = lineup ? lineup.teams.flat().join("|") : "none";

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col overflow-hidden rounded-box border-2 border-base-300 bg-base-100"
    >
      <header className="flex items-center gap-3 bg-base-200 px-4 py-3">
        <h3 id={headingId} className="font-display text-3xl uppercase">
          Court {court.number}
        </h3>
        <span className="rounded-full border-[1.5px] border-base-content/25 px-2.5 py-0.5 text-xs font-bold tracking-wider text-base-content/70 uppercase">
          Idle
        </span>
      </header>

      <div className="flex-1 p-4">
        {lineup ? (
          <div key={lineupKey} className="animate-rise flex flex-col gap-2">
            <span className="text-xs font-bold tracking-[0.14em] text-primary uppercase">
              Lineup
            </span>
            <TeamsView teams={lineup.teams} />
          </div>
        ) : (
          <div className="flex h-full min-h-28 flex-col items-center justify-center rounded-field border-[1.5px] border-dashed border-base-300 px-4 text-center">
            <p className="font-display text-xl text-base-content/70 uppercase">
              Waiting for players
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 px-4">
        <button
          type="button"
          className="btn btn-lg btn-outline border-base-300"
          disabled={!lineup}
          onClick={() => actions.rehashCourt(court.id)}
        >
          <RefreshIcon className="size-5" />
          Rehash
        </button>
        <button
          type="button"
          className="btn btn-lg btn-primary"
          disabled={!lineup}
          onClick={() => actions.startMatch(court.id)}
        >
          <PlayIcon className="size-5" />
          Start match
        </button>
      </div>

      <RemoveCourtRow courtId={court.id} busy={false} />
    </section>
  );
}

function RemoveCourtRow({ courtId, busy }: { courtId: string; busy: boolean }) {
  const actions = useSessionActions();
  const hintId = useId();
  return (
    <div className="mt-2 flex min-h-12 items-center justify-end gap-2 px-2 pb-1">
      {busy ? (
        <p id={hintId} className="min-w-0 flex-1 pl-2 text-xs text-base-content/60">
          End or remove the match first
        </p>
      ) : null}
      <button
        type="button"
        className="btn btn-ghost text-sm text-base-content/70"
        disabled={busy}
        aria-describedby={busy ? hintId : undefined}
        onClick={() => actions.removeCourt(courtId)}
      >
        Remove court
      </button>
    </div>
  );
}
