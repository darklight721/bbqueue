import type { SkillLevel } from "../domain/types.ts";
import { SkillBadge } from "./SkillBadge.tsx";

export interface PlayerChipProps {
  name: string;
  skill: SkillLevel;
  /** Ended matches only. */
  matchesPlayed: number;
  /**
   * "stacked": name on top, Skill bars + count underneath (Court cards, tight columns).
   * "inline": everything on one line (lists, pickers).
   */
  layout?: "stacked" | "inline";
  /** Stacked only: right-align (e.g. Team B on a Court card). */
  align?: "start" | "end";
  className?: string;
}

/** The standard way to show a player: name + Skill level + matches played. */
export function PlayerChip({
  name,
  skill,
  matchesPlayed,
  layout = "stacked",
  align = "start",
  className = "",
}: PlayerChipProps) {
  const played = <span className="whitespace-nowrap tabular-nums">{matchesPlayed} played</span>;

  if (layout === "inline") {
    return (
      <span className={`flex min-w-0 items-center gap-2 ${className}`}>
        <span className="min-w-0 truncate text-lg font-semibold">{name}</span>
        <SkillBadge skill={skill} compact />
        <span className="shrink-0 text-sm text-base-content/65">{played}</span>
      </span>
    );
  }

  return (
    <span
      className={`flex min-w-0 flex-col ${align === "end" ? "items-end text-right" : ""} ${className}`}
    >
      <span className="max-w-full truncate text-lg leading-tight font-semibold">{name}</span>
      <span
        className={`mt-0.5 flex items-center gap-1.5 text-sm text-base-content/65 ${align === "end" ? "flex-row-reverse" : ""}`}
      >
        <SkillBadge skill={skill} compact className="size-6" />
        {played}
      </span>
    </span>
  );
}
