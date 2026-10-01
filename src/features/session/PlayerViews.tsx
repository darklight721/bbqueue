import { PlayerChip } from "../../components/PlayerChip.tsx";
import type { Team } from "../../domain/types.ts";
import { useSessionView } from "./context.ts";

/** A Session player by id, shown with PlayerChip (stats from the shared per-render map). */
export function SessionPlayerChip({
  playerId,
  layout,
  align,
}: {
  playerId: string;
  layout?: "stacked" | "inline";
  align?: "start" | "end";
}) {
  const { playerById, stats } = useSessionView();
  const player = playerById.get(playerId);
  if (!player) return <span className="text-base-content/60">Unknown player</span>;
  return (
    <PlayerChip
      name={player.name}
      skill={player.skill}
      matchesPlayed={stats.get(playerId)?.matchesPlayed ?? 0}
      layout={layout}
      align={align}
    />
  );
}

/** Team A vs Team B, split by a "net" down the middle. */
export function TeamsView({ teams }: { teams: [Team, Team] }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch gap-3">
      <TeamColumn label="Team A" team={teams[0]} />
      <div aria-hidden="true" className="flex flex-col items-center">
        <span className="w-0 flex-1 border-l-2 border-dashed border-base-content/20" />
        <span className="py-1 font-display text-sm font-bold tracking-widest text-base-content/50">
          VS
        </span>
        <span className="w-0 flex-1 border-l-2 border-dashed border-base-content/20" />
      </div>
      <TeamColumn label="Team B" team={teams[1]} align="end" />
    </div>
  );
}

function TeamColumn({
  label,
  team,
  align = "start",
}: {
  label: string;
  team: Team;
  align?: "start" | "end";
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-2 ${align === "end" ? "items-end text-right" : ""}`}>
      <span className="text-xs font-bold tracking-[0.14em] text-base-content/55 uppercase">
        {label}
      </span>
      <ul aria-label={label} className="flex w-full flex-col gap-2.5">
        {team.map((id) => (
          <li key={id} className="min-w-0">
            <SessionPlayerChip playerId={id} align={align} />
          </li>
        ))}
      </ul>
    </div>
  );
}
