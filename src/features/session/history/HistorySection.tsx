import { useId, useMemo, useState } from "react";
import { SkillBadge } from "../../../components/SkillBadge.tsx";
import type { Match, Team } from "../../../domain/types.ts";
import { formatDuration } from "../clock.ts";
import { useSessionView } from "../context.ts";
import { SectionHeader } from "../SectionHeader.tsx";

const HEADING_ID = "session-history";

/** Ended matches, newest first. Collapsed by default to keep the screen short. */
export function HistorySection() {
  const { session } = useSessionView();
  const [open, setOpen] = useState(false);
  const listId = useId();

  const ended = useMemo(
    () =>
      session.matches
        .filter((match) => match.status === "ended")
        .sort((a, b) => (b.number ?? 0) - (a.number ?? 0) || (b.endedAt ?? 0) - (a.endedAt ?? 0)),
    [session.matches],
  );
  const count = ended.length;

  return (
    <section aria-labelledby={HEADING_ID} className="flex flex-col gap-3">
      <SectionHeader
        id={HEADING_ID}
        title="History"
        detail={`${count} ${count === 1 ? "match" : "matches"}`}
        action={
          count > 0 ? (
            <button
              type="button"
              className="btn btn-outline border-base-300"
              aria-expanded={open}
              aria-controls={listId}
              onClick={() => setOpen((value) => !value)}
            >
              {open ? "Hide history" : "Show history"}
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
          ) : null
        }
      />

      {count === 0 ? (
        <p className="rounded-box border-[1.5px] border-dashed border-base-300 px-4 py-5 text-center text-base-content/70">
          No matches played yet.
        </p>
      ) : open ? (
        <ol
          id={listId}
          aria-label="Match history"
          className="overflow-hidden rounded-box border-[1.5px] border-base-300 bg-base-100 md:grid md:grid-cols-2"
        >
          {ended.map((match) => (
            <HistoryEntry key={match.id} match={match} />
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function HistoryEntry({ match }: { match: Match }) {
  const score = match.score;
  const winner = score ? (score[0] > score[1] ? 0 : 1) : null;
  const duration = match.endedAt !== null ? formatDuration(match.endedAt - match.startedAt) : "";

  return (
    <li className="flex flex-col gap-1 border-b border-base-300 px-4 py-3 last:border-b-0 md:odd:border-r">
      <div className="flex items-baseline gap-2 text-sm">
        <span className="font-display text-lg leading-none font-bold uppercase">
          Match #{match.number} · Court {match.courtNumber}
        </span>
        <span className="ml-auto text-base-content/60 tabular-nums">
          <span className="sr-only">Duration </span>
          {duration}
        </span>
      </div>
      <TeamLine team={match.teams[0]} score={score?.[0] ?? null} outcome={outcome(winner, 0)} />
      <TeamLine team={match.teams[1]} score={score?.[1] ?? null} outcome={outcome(winner, 1)} />
      {score === null ? <p className="text-sm text-base-content/60 italic">No score</p> : null}
    </li>
  );
}

type Outcome = "won" | "lost" | "none";

function outcome(winner: 0 | 1 | null, team: 0 | 1): Outcome {
  if (winner === null) return "none";
  return winner === team ? "won" : "lost";
}

function TeamLine({
  team,
  score,
  outcome,
}: {
  team: Team;
  score: number | null;
  outcome: Outcome;
}) {
  const { playerById } = useSessionView();
  return (
    <div className={`flex items-center gap-2 ${outcome === "lost" ? "text-base-content/65" : ""}`}>
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0.5">
        {team.map((id, index) => {
          const player = playerById.get(id);
          return (
            <span key={id} className="inline-flex min-w-0 items-center gap-1">
              {index > 0 ? (
                <span aria-hidden="true" className="text-base-content/50">
                  &amp;
                </span>
              ) : null}
              {index > 0 ? <span className="sr-only">and</span> : null}
              <span className={`truncate ${outcome === "won" ? "font-bold" : "font-medium"}`}>
                {player?.name ?? "Unknown"}
              </span>
              {player ? <SkillBadge skill={player.skill} compact className="size-5" /> : null}
            </span>
          );
        })}
      </span>
      {score !== null ? (
        <span
          className={`min-w-10 text-right font-display text-2xl leading-none tabular-nums ${
            outcome === "won" ? "font-bold text-primary" : "font-semibold"
          }`}
        >
          {outcome === "won" ? <span className="sr-only">Won, </span> : null}
          <span>{score}</span>
        </span>
      ) : null}
    </div>
  );
}
