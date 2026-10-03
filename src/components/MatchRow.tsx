import type { ReactNode } from "react";
import type { PointSystem, SkillLevel, Team } from "../domain/types.ts";
import { SkillBadge } from "./SkillBadge.tsx";

/** The bits of a player a match row needs. */
export interface MatchRowPlayer {
  name: string;
  skill: SkillLevel;
}

export interface MatchRowData {
  number: number | null;
  courtNumber: number;
  teams: [Team, Team];
  target: PointSystem;
  score: [number, number] | null;
}

/**
 * Bordered list that holds `MatchRow`s (two columns on tablets).
 * Used by the live History and by an Ended session's details.
 */
export function MatchList({
  id,
  label,
  children,
}: {
  id?: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <ol
      id={id}
      aria-label={label}
      className="overflow-hidden rounded-box border-[1.5px] border-base-300 bg-base-100 md:grid md:grid-cols-2"
    >
      {children}
    </ol>
  );
}

/**
 * One Ended match: "Match #n · Court N", both Teams with Skill, the score (or "--" per Team when unscored)
 * and how long it took. The Target is shown only when `showTarget` (both 21 and 31 were used).
 */
export function MatchRow({
  match,
  duration,
  showTarget,
  playerById,
}: {
  match: MatchRowData;
  /** Already formatted, e.g. "12:34". */
  duration: string;
  showTarget: boolean;
  playerById: ReadonlyMap<string, MatchRowPlayer>;
}) {
  const score = match.score;
  const winner = score ? (score[0] > score[1] ? 0 : 1) : null;

  return (
    <li className="flex flex-col gap-1 border-b border-base-300 px-4 py-3 last:border-b-0 md:odd:border-r">
      <div className="flex items-baseline gap-2 text-sm">
        <span className="font-display text-lg leading-none font-bold uppercase">
          Match #{match.number} · Court {match.courtNumber}
        </span>
        {showTarget ? (
          <span className="self-center rounded-full border-[1.5px] border-base-content/25 px-2 py-px text-xs font-bold whitespace-nowrap text-base-content/70">
            <span aria-hidden="true">{match.target} pts</span>
            <span className="sr-only">{match.target} points</span>
          </span>
        ) : null}
        <span className="ml-auto text-base-content/60 tabular-nums">
          <span className="sr-only">Duration </span>
          {duration}
        </span>
      </div>
      <TeamLine
        team={match.teams[0]}
        score={score?.[0] ?? null}
        outcome={outcome(winner, 0)}
        playerById={playerById}
      />
      <TeamLine
        team={match.teams[1]}
        score={score?.[1] ?? null}
        outcome={outcome(winner, 1)}
        playerById={playerById}
      />
      {score === null ? <p className="sr-only">No score</p> : null}
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
  playerById,
}: {
  team: Team;
  score: number | null;
  outcome: Outcome;
  playerById: ReadonlyMap<string, MatchRowPlayer>;
}) {
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
              {player ? <SkillBadge skill={player.skill} compact size="sm" /> : null}
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
      ) : (
        <span
          aria-hidden="true"
          className="min-w-10 text-right font-display text-2xl leading-none font-semibold tracking-[0.15em] text-base-content/40 tabular-nums"
        >
          --
        </span>
      )}
    </div>
  );
}
