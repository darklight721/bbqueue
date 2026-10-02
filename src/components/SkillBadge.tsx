import { SKILL_LABEL, type SkillLevel } from "../domain/types.ts";

const SKILL_COLOR: Record<SkillLevel, string> = {
  beginner: "var(--color-skill-beginner)",
  intermediate: "var(--color-skill-intermediate)",
  advanced: "var(--color-skill-advanced)",
};

/** Short ALL-CAPS form used by the compact badge (UI only; the domain label is SKILL_LABEL). */
const SKILL_ABBREVIATION: Record<SkillLevel, string> = {
  beginner: "BEG",
  intermediate: "INT",
  advanced: "ADV",
};

/**
 * Compact sizes. The width is fixed so all three levels line up in lists.
 * "sm": beside "N played" and in match rows. "md": beside a large display name (Summary).
 */
const COMPACT_SIZE = {
  sm: "h-[1.125rem] w-8 text-[10px]",
  md: "h-5 w-9 text-[11px]",
} as const;

export interface SkillBadgeProps {
  skill: SkillLevel;
  /** Abbreviation only (BEG / INT / ADV); the full label is the tooltip and screen-reader text. */
  compact?: boolean;
  /** Compact only. Defaults to "md". */
  size?: keyof typeof COMPACT_SIZE;
  className?: string;
}

/**
 * Skill level as a tinted tag: the level's colour plus its name, so the text alone tells the
 * levels apart (works without colour vision). Compact shows BEG / INT / ADV at a fixed width.
 */
export function SkillBadge({
  skill,
  compact = false,
  size = "md",
  className = "",
}: SkillBadgeProps) {
  const label = SKILL_LABEL[skill];
  const style = tagStyle(SKILL_COLOR[skill]);

  if (compact) {
    return (
      <span
        className={`inline-grid shrink-0 place-items-center rounded-[0.3125rem] border leading-none font-semibold tracking-[0.06em] ${COMPACT_SIZE[size]} ${className}`}
        style={style}
        title={label}
      >
        {/* pl balances the trailing letter-spacing so the text sits optically centred. */}
        <span aria-hidden="true" className="pl-[0.06em]">
          {SKILL_ABBREVIATION[skill]}
        </span>
        <span className="sr-only">{label}</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex h-7 shrink-0 items-center rounded-md border-[1.5px] px-2.5 text-sm font-semibold whitespace-nowrap ${className}`}
      style={style}
    >
      {label}
    </span>
  );
}

/** Tint, border and text all mixed from the level's colour (text leans to base-content for contrast). */
function tagStyle(color: string) {
  return {
    color: `color-mix(in oklab, ${color} 72%, var(--color-base-content))`,
    borderColor: `color-mix(in oklab, ${color} 55%, transparent)`,
    backgroundColor: `color-mix(in oklab, ${color} 12%, transparent)`,
  };
}
